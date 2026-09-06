import { PassThrough, Transform } from 'node:stream';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { BridgeSession } from './bridge';
import { CAPABILITY_OPS } from './protocol';
import { assertExecStderr, checkArtifacts, checkStoppedSurfaces, adminCounts, assertProbeWindow, checkTerminalProbe } from './integrationEvidence';
import { observeStderr } from './secretScan';
import { realEvidence, setupFor } from './slice4.testkit';
import { kindOf } from './compose.testkit';

it('independent response decoder retains every real token through consumption and erases buffers only at finish', async () => {
  const h = await realEvidence(vi.fn);
  try {
    expect(h.evidence.secrets).toHaveLength(3);
    await h.set['benign-login'].registerRun(setupFor('A'));
    const response = h.evidence.bridges[0].responses.find((f) => f.op === 'register')!;
    if (response.kind !== 'res' || !response.ok) throw new Error('register');
    expect(h.evidence.secrets).toHaveLength(9);
    for (const op of CAPABILITY_OPS) expect(h.evidence.secrets.filter((s) => s.equals(Buffer.from(response.body[op] as string, 'base64url')))).toHaveLength(1);
    expect(new Set(h.evidence.secrets.map((s) => s.toString('hex'))).size).toBe(9);
    await h.set['benign-login'].finalizeRun('A'); await h.set['benign-login'].acknowledgeReceipt('A');
    await h.set['benign-login'].close();
    expect(h.evidence.secrets.every((s) => s.some((v) => v !== 0))).toBe(true);
    checkStoppedSurfaces(h.evidence); await checkArtifacts(h.evidence, h.root);
    const retained = [...h.evidence.secrets]; expect(retained).toHaveLength(9);
    await h.evidence.finish(); expect(retained.every((s) => s.every((v) => v === 0))).toBe(true);
    expect(h.evidence.secrets).toEqual([]);
  } finally { await h.dispose(); }
});
it.each(CAPABILITY_OPS)('same live artifact consumer detects independent received %s token', async (op) => {
  const h = await realEvidence(vi.fn);
  try {
    await h.set['benign-login'].registerRun(setupFor('A'));
    const response = h.evidence.bridges[0].responses.find((f) => f.op === 'register')!;
    if (response.kind !== 'res' || !response.ok) throw new Error('register');
    await h.set['benign-login'].close();
    await mkdir(join(h.root, 'nested'), { recursive: true });
    await writeFile(join(h.root, 'nested', 'leak'), Buffer.from(response.body[op] as string, 'base64url'));
    await expect(checkArtifacts(h.evidence, h.root)).rejects.toMatchObject({ code: 'secret-exposed' });
  } finally { await h.dispose(); }
});
it.each((['logs', 'export'] as const).flatMap((sink) => CAPABILITY_OPS.map((op) => [sink, op] as const)))('same live stopped consumer detects a received token on actual %s stream (%s)', async (sink, op) => {
  const h = await realEvidence(vi.fn);
  try {
    await h.set['benign-login'].registerRun(setupFor('A'));
    const frame = h.evidence.bridges[0].responses.find((f) => f.op === 'register')!;
    if (frame.kind !== 'res' || !frame.ok) throw new Error('register');
    const token = frame.body[op] as string;
    if (sink === 'logs') {
      const run = h.runner.run.getMockImplementation()!;
      h.runner.run.mockImplementation(async (spawn) => { const result = await run(spawn);
        if (kindOf(spawn) === 'logs') result.stdout += token; return result; });
    } else {
      const spawn = h.runner.spawnLongLived.getMockImplementation()!;
      h.runner.spawnLongLived.mockImplementation((description) => { const handle = spawn(description);
        if (kindOf(description) === 'export') handle.stdout.push(token); return handle; });
    }
    await expect(h.set['benign-login'].close()).rejects.toMatchObject({ code: 'secret-exposed' });
    expect(() => checkStoppedSurfaces(h.evidence)).toThrow('secret-exposed');
  } finally { await h.dispose(); }
});
it('exec evidence consumes sticky overflow and retains exposure precedence', () => {
  const stream = new PassThrough(); const stderr = observeStderr(stream, []);
  try {
    stream.write(Buffer.alloc(65536, 1)); stream.write('overflow');
    expect(() => assertExecStderr({ stderr }, [])).toThrow('scan-failed');
    expect(() => assertExecStderr({ stderr }, [Buffer.alloc(32, 1)])).toThrow('secret-exposed');
    expect(stderr.snapshot()).toHaveLength(65536);
  } finally { stderr.destroy(); stream.destroy(); }
});
it('actual ProjectCloser export reader propagates retained-stderr overflow', async () => {
  const h = await realEvidence(vi.fn);
  try {
    const spawn = h.runner.spawnLongLived.getMockImplementation()!;
    // Write before the fake runner's queued normal end, after the closer attaches its reader.
    h.runner.spawnLongLived.mockImplementation((description) => { const handle = spawn(description);
      if (kindOf(description) === 'export') (handle.stderr as PassThrough).push(Buffer.alloc(65537, 1));
      return handle; });
    await expect(h.set['benign-login'].close()).rejects.toMatchObject({ code: 'scan-failed' });
  } finally { await h.dispose(); }
});
it('audit parser counts all seven fixed records and probe consumer rejects any independent counter delta', () => {
  const ops = ['register', ...CAPABILITY_OPS];
  const empty = adminCounts('boot\n');
  const counts = adminCounts(ops.map((op) => `fixture-admin:${op}\n`).join(''));
  for (const op of ops) {
    expect(counts[op as keyof typeof counts]).toBe(1);
    expect(() => assertProbeWindow(empty, { ...empty, [op]: 1 })).toThrow('underlying administration');
  }
  expect(() => adminCounts('fixture-admin:untrusted\n')).toThrow('vocabulary');
});

it.each(['exposure', 'overflow', 'both'] as const)('evidence export stderr caller rejects %s with secret precedence independently of closer', async (mode) => {
  const h = await realEvidence(vi.fn);
  try {
    await h.set['benign-login'].registerRun(setupFor('A'));
    const token = h.evidence.secrets[3];
    const spawn = h.runner.spawnLongLived.getMockImplementation()!;
    h.runner.spawnLongLived.mockImplementation((description) => {
      const handle = spawn(description);
      // No production stderr marker exists. These known bytes positively exercise this second reader.
      if (kindOf(description) === 'export') {
        if (mode !== 'overflow') handle.stderr.push(token);
        if (mode !== 'exposure') handle.stderr.push(Buffer.alloc(65537, 1));
      }
      return handle;
    });
    // The real closer also rejects; its rejection is deliberately not the assertion under test here.
    await h.set['benign-login'].close().catch(() => {});
    expect(h.evidence.exports).toHaveLength(3);
    expect(() => checkStoppedSurfaces(h.evidence), `evidence export stderr ${mode}`)
      .toThrow(mode === 'overflow' ? 'scan-failed' : 'secret-exposed');
  } finally { await h.dispose(); }
});

it.each(['tar-error', 'bundle-input'] as const)('actual export metadata consumer rejects independent %s bytes', async (mode) => {
  const h = await realEvidence(vi.fn);
  try {
    const spawn = h.runner.spawnLongLived.getMockImplementation()!;
    h.runner.spawnLongLived.mockImplementation((description) => {
      const handle = spawn(description);
      if (kindOf(description) !== 'export') return handle;
      const transformed = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        const header = Buffer.from(chunk.subarray(0, 512));
        const size = Number.parseInt(header.subarray(124, 136).toString().split('\0')[0], 8);
        const meta = JSON.parse(chunk.subarray(512, 512 + size).toString());
        if (mode === 'bundle-input') meta.inputs['unlisted-input.ts'] = {};
        const body = Buffer.from(JSON.stringify(meta));
        header.fill(0, 124, 136); header.write(body.length.toString(8).padStart(11, '0'), 124);
        const bad = Buffer.alloc(512); bad.write('invalid', 124);
        callback(null, Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512),
          mode === 'tar-error' ? bad : Buffer.alloc(1024)]));
      } });
      handle.stdout.pipe(transformed);
      return { ...handle, stdout: transformed };
    });
    await h.set['benign-login'].close();
    expect(() => checkStoppedSurfaces(h.evidence), `actual metadata consumer:${mode}`)
      .toThrow(mode === 'tar-error' ? 'export tar reader failed' : 'fixture bundle inputs changed');
  } finally { await h.dispose(); }
});

it('actual stopped log and terminal wire consumers allow only the fixed post-window budget', async () => {
  const clients: BridgeSession[] = [];
  const hello = BridgeSession.prototype.hello;
  const spy = vi.spyOn(BridgeSession.prototype, 'hello').mockImplementation(async function (this: BridgeSession, body) {
    const key = await hello.call(this, body); clients.push(this); return key;
  });
  const h = await realEvidence(vi.fn);
  try {
    for (const fixture of Object.values(h.set)) await fixture.registerRun(setupFor('A'));
    const beforeAdmin = h.entries.map((entries) => adminCounts(entries.map((op) => `fixture-admin:${op}\n`).join('')));
    const beforeWire = { completed: clients.map((b) => b.completedRequests), frames: h.evidence.bridges.map((b) => ({
      requests: [...b.requests], responses: b.responses.map((f) => `${f.id}:${f.kind}:${f.op}`),
    })) };
    const run = h.runner.run.getMockImplementation()!;
    h.runner.run.mockImplementation(async (spawn) => {
      const result = await run(spawn);
      if (kindOf(spawn) === 'logs') {
        const i = h.evidence.bridges.findIndex((b) => b.id === spawn.args[1]);
        result.stderr += '\n' + h.entries[i].map((op) => `fixture-admin:${op}\n`).join('');
      }
      return result;
    });
    for (const fixture of Object.values(h.set)) for (let n = 1; n < 32; n++) await fixture.registerRun(setupFor(`budget-${n}`));
    await expect(h.set['benign-login'].registerRun(setupFor('overflow'))).rejects.toBeDefined();
    await h.set['benign-login'].close();
    const check = () => checkTerminalProbe(h.evidence, beforeAdmin, beforeWire, clients.map((b) => b.completedRequests));
    check();
    const log = h.evidence.results.find(({ spawn }) => kindOf(spawn) === 'logs')!.result;
    log.stderr += '\nfixture-admin:receipt\n';
    expect(check, 'final stopped consumer detects direct entry').toThrow('final stopped administration changed');
    log.stderr = log.stderr.replace(/\nfixture-admin:receipt\n$/, '');
    const wire = h.evidence.bridges[0]; wire.requests.push('999:receipt');
    expect(check, 'terminal request consumer').toThrow('terminal request ledger changed'); wire.requests.pop();
    const frame = wire.responses.pop()!;
    expect(check, 'terminal response consumer').toThrow('terminal response ledger changed'); wire.responses.push(frame);
    expect(() => checkTerminalProbe(h.evidence, beforeAdmin, beforeWire, clients.map((b) => b.completedRequests + 1)),
      'terminal completed consumer').toThrow('terminal completed request ledger changed');
  } finally { spy.mockRestore(); await h.dispose(); }
});
