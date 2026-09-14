import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialBackend } from '../../backends/backend';
import * as local from '../../backends/localFile';
import * as remote from '../../backends/onepassword';
import * as hosts from '../../supervisor/host';
import { start } from './main';

let directory: string;
let configPath: string;
const config = { opPath: '/synthetic/op', tokenPath: '/synthetic/token',
  vaultId: 'v'.repeat(26), items: [{ itemId: 'a'.repeat(26), label: 'Synthetic Login' }] };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

function runtime(env: NodeJS.ProcessEnv) {
  const events = new EventEmitter(); const stdin = new PassThrough();
  const stdout = new PassThrough(); const stderr = new PassThrough(); const exit = vi.fn();
  let output = ''; let diagnostic = '';
  stdout.on('data', bytes => { output += bytes.toString(); });
  stderr.on('data', bytes => { diagnostic += bytes.toString(); });
  const value = Object.assign(events, { env, stdin, stdout, stderr, exit });
  return { value, events, stdin, stdout, exit, output: () => output, diagnostic: () => diagnostic };
}

function composition() {
  const order: string[] = [];
  const backend: CredentialBackend = {
    probeAvailability: vi.fn(async () => ({ available: true as const })),
    listItems: vi.fn(async () => []),
    resolvePolicy: vi.fn(async () => ({ canonicalOrigin: 'https://example.test', fieldRecipe: ['password' as const] })),
    resolveSecret: vi.fn(async () => { throw new Error('unexpected synthetic read'); }),
    dispose: vi.fn(async () => { order.push('backend-close'); }),
  };
  const host = {
    abort: vi.fn(() => { order.push('host-abort'); }),
    closeAll: vi.fn(async () => { order.push('host-close'); await backend.dispose(); }),
    settleEvidence: vi.fn(async () => { order.push('settle'); }),
    drainEvidence: vi.fn(() => { order.push('drain'); }),
    quiesceEvidenceProducers: vi.fn(async (options: {
      beforeClose: () => Promise<void>; afterClose: () => Promise<void>;
    }) => { await options.beforeClose(); await options.afterClose(); }),
    finish: vi.fn(() => { order.push('finish'); }),
    tools: {},
  } as unknown as hosts.SupervisedHost;
  const localFactory = vi.spyOn(local, 'createLocalFileBackend').mockReturnValue(backend);
  const remoteFactory = vi.spyOn(remote, 'createOnePasswordBackend').mockReturnValue(backend);
  const hostFactory = vi.spyOn(hosts, 'createSupervisedHost').mockResolvedValue(host);
  return { backend, host, order, localFactory, remoteFactory, hostFactory };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'tinyvault-main-backend-'));
  configPath = join(directory, 'config.json');
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
});
afterEach(() => { vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });

describe('M9 MCP backend selection and cleanup', () => {
  it.each([undefined, 'local-file'])('preserves the local backend for %s', async selected => {
    const f = composition(); const r = runtime({ TINYVAULT_BACKEND: selected,
      TINYVAULT_VAULT_PATH: '/synthetic/vault', TINYVAULT_KEY_PATH: '/synthetic/key' });
    const running = start(r.value); await tick(); r.stdin.end();
    expect(await running).toBe(0);
    expect(f.localFactory).toHaveBeenCalledExactlyOnceWith({
      vaultPath: '/synthetic/vault', keyPath: '/synthetic/key' });
    expect(f.remoteFactory).not.toHaveBeenCalled();
    expect(f.hostFactory).toHaveBeenCalledExactlyOnceWith({
      backend: f.backend, canary: expect.any(String), handleSignals: false });
    expect(r.diagnostic()).toBe(''); expect(r.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(f.order.indexOf('finish')).toBeLessThan(f.order.indexOf('host-close'));
    expect(f.backend.dispose).toHaveBeenCalled();
  });

  it('selects exactly one remote backend from the non-secret local config', async () => {
    const f = composition(); const r = runtime({ TINYVAULT_BACKEND: 'onepassword',
      TINYVAULT_1PASSWORD_CONFIG: configPath });
    const running = start(r.value); await tick(); r.stdin.end();
    expect(await running).toBe(0); expect(f.remoteFactory).toHaveBeenCalledExactlyOnceWith(config);
    expect(f.localFactory).not.toHaveBeenCalled(); expect(f.hostFactory).toHaveBeenCalledTimes(1);
    expect(f.backend.resolveSecret).not.toHaveBeenCalled(); expect(r.diagnostic()).toBe('');
  });

  it.each([
    { TINYVAULT_BACKEND: 'unknown' },
    { TINYVAULT_BACKEND: '' },
    { TINYVAULT_BACKEND: 'onepassword' },
    { TINYVAULT_BACKEND: 'onepassword', TINYVAULT_1PASSWORD_CONFIG: 'relative.json' },
    { TINYVAULT_BACKEND: 'onepassword', TINYVAULT_VAULT_PATH: '' },
    { TINYVAULT_BACKEND: 'onepassword', TINYVAULT_KEY_PATH: '/private/synthetic' },
    { TINYVAULT_BACKEND: 'onepassword', OP_SERVICE_ACCOUNT_TOKEN: 'synthetic-parent-token' },
    { TINYVAULT_BACKEND: 'onepassword', OP_SERVICE_ACCOUNT_TOKEN: '' },
    { TINYVAULT_BACKEND: 'onepassword', TINYVAULT_TRIPWIRE_CANARY: '' },
    { TINYVAULT_BACKEND: 'local-file', TINYVAULT_VAULT_PATH: '/synthetic/vault',
      TINYVAULT_KEY_PATH: '/synthetic/key', TINYVAULT_1PASSWORD_CONFIG: '' },
  ] as NodeJS.ProcessEnv[])('fails closed on invalid or mixed selection %#', async overrides => {
    const f = composition(); const env: NodeJS.ProcessEnv = { TINYVAULT_1PASSWORD_CONFIG: configPath, ...overrides };
    if (overrides.TINYVAULT_BACKEND === 'onepassword' && Object.keys(overrides).length === 1) {
      delete env.TINYVAULT_1PASSWORD_CONFIG;
    }
    const r = runtime(env);
    expect(await start(r.value)).toBe(4);
    expect(f.localFactory).not.toHaveBeenCalled(); expect(f.remoteFactory).not.toHaveBeenCalled();
    expect(f.hostFactory).not.toHaveBeenCalled();
    expect(r.diagnostic()).toBe('tinyvault-mcp: internal error\n'); expect(r.output()).toBe('');
    expect(r.exit).toHaveBeenCalledExactlyOnceWith(4);
  });

  it.each(['{ invalid synthetic json', 'null'])('contains config parse/factory failures: %s', async text => {
    const f = composition(); f.remoteFactory.mockImplementation(() => { throw new Error('synthetic-native-detail'); });
    writeFileSync(configPath, text);
    const r = runtime({ TINYVAULT_BACKEND: 'onepassword', TINYVAULT_1PASSWORD_CONFIG: configPath });
    expect(await start(r.value)).toBe(4); expect(f.hostFactory).not.toHaveBeenCalled();
    expect(r.diagnostic()).toBe('tinyvault-mcp: internal error\n');
    expect(r.output()).toBe('');
  });

  it('disposes an already-created backend when host creation fails', async () => {
    const f = composition(); f.hostFactory.mockRejectedValue(new Error('synthetic-host-private-detail'));
    const r = runtime({ TINYVAULT_BACKEND: 'onepassword', TINYVAULT_1PASSWORD_CONFIG: configPath });
    expect(await start(r.value)).toBe(4);
    expect(f.backend.dispose).toHaveBeenCalledExactlyOnceWith();
    expect(r.diagnostic()).toBe('tinyvault-mcp: internal error\n');
  });

  it('starts backend disposal before abort and host cleanup on output failure', async () => {
    const f = composition(); const r = runtime({ TINYVAULT_BACKEND: 'onepassword',
      TINYVAULT_1PASSWORD_CONFIG: configPath });
    const running = start(r.value); await tick();
    r.stdout.emit('error', new Error('synthetic-output-detail'));
    expect(await running).toBe(6);
    expect(f.order.indexOf('backend-close')).toBeLessThan(f.order.indexOf('host-abort'));
    expect(f.order.indexOf('backend-close')).toBeLessThan(f.order.indexOf('host-close'));
    expect(r.diagnostic()).toBe('');
    expect(r.value.listenerCount('unhandledRejection')).toBe(0);
  });

  it('contains disposal rejection and keeps startup error priority', async () => {
    const f = composition(); f.hostFactory.mockRejectedValue(new Error('synthetic-startup-detail'));
    vi.mocked(f.backend.dispose).mockRejectedValue(new Error('synthetic-disposal-detail'));
    const r = runtime({ TINYVAULT_BACKEND: 'onepassword', TINYVAULT_1PASSWORD_CONFIG: configPath });
    expect(await start(r.value)).toBe(4);
    expect(r.diagnostic()).toBe('tinyvault-mcp: internal error\n');
    expect(r.exit).toHaveBeenCalledExactlyOnceWith(4);
  });
});
