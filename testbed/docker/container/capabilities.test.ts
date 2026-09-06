import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { afterEach, expect, it, vi } from 'vitest';
import { CAPABILITY_OPS } from '../protocol';
import { CapabilityRegistry, type CapabilityScope } from './capabilities';
vi.mock('node:crypto', async (original) => {
  const crypto = await original<typeof import('node:crypto')>();
  return { ...crypto, randomBytes: vi.fn(crypto.randomBytes) };
});
vi.mock('node:perf_hooks', () => ({ performance: { now: vi.fn(() => 1000) } }));
afterEach(() => { vi.mocked(randomBytes).mockClear(); vi.mocked(performance.now).mockReturnValue(1000); });
const scope: CapabilityScope = { epoch: '1-' + 'a'.repeat(32), fixtureId: 'benign-login', runId: 'A' };
function setup() {
  const registry = new CapabilityRegistry(scope.fixtureId, scope.epoch);
  const tokens = registry.register(scope);
  return { registry, tokens };
}
it('mints six independent real 32-byte tokens separately from the instance nonce', () => {
  const { registry, tokens } = setup();
  expect(vi.mocked(randomBytes).mock.calls).toEqual(Array.from({ length: 7 }, () => [32]));
  expect(new Set(Object.values(tokens)).size).toBe(6);
  for (const token of Object.values(tokens)) expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  registry.close();
});
it.each(CAPABILITY_OPS)('expires %s at the exact server monotonic boundary', (op) => {
  const { registry, tokens } = setup();
  if (op !== 'finalize') { registry.authorize(scope, 'finalize', tokens.finalize); registry.markFinalized(scope.runId); }
  vi.mocked(performance.now).mockReturnValue(60999.999);
  registry.authorize(scope, op, tokens[op]);
  vi.mocked(performance.now).mockReturnValue(1000);
  const second = setup();
  if (op !== 'finalize') { second.registry.authorize(scope, 'finalize', second.tokens.finalize); second.registry.markFinalized(scope.runId); }
  // Exactly 60000 ms after the second registration is refused.
  vi.mocked(performance.now).mockReturnValue(61000);
  expect(() => second.registry.authorize(scope, op, second.tokens[op])).toThrow('capability-refused');
  registry.close(); second.registry.close();
});
it.each([
  ['fixture', { fixtureId: 'lookalike-origin' }], ['epoch', { epoch: '2-' + 'b'.repeat(32) }],
  ['run', { runId: 'B' }], ['unknown run', { runId: 'unknown' }],
] as const)('refuses explicit %s scope independently of token possession', (_name, change) => {
  const { registry, tokens } = setup();
  registry.register({ ...scope, runId: 'B' });
  expect(() => registry.authorize({ ...scope, ...change }, 'receipt', tokens.receipt)).toThrow('capability-refused');
  registry.close();
});
it('refuses another operation token for every operation', () => {
  const { registry, tokens } = setup();
  registry.authorize(scope, 'finalize', tokens.finalize); registry.markFinalized(scope.runId);
  for (const op of CAPABILITY_OPS) {
    expect(() => registry.authorize(scope, op, tokens[op === 'key' ? 'receipt' : 'key'])).toThrow('capability-refused');
  }
  registry.close();
});
it.each(['capture', 'ack', 'attest'] as const)('%s requires completed finalization', (op) => {
  const { registry, tokens } = setup();
  expect(() => registry.authorize(scope, op, tokens[op])).toThrow('run-state');
  registry.authorize(scope, 'finalize', tokens.finalize);
  expect(() => registry.authorize(scope, op, tokens[op])).toThrow('run-state');
  registry.markFinalized(scope.runId);
  expect(() => registry.authorize(scope, op, tokens[op])).not.toThrow();
  registry.close();
});
it.each(['finalize', 'ack', 'attest'] as const)('%s refuses a second authorization after consumption', (op) => {
  const { registry, tokens } = setup();
  if (op !== 'finalize') { registry.authorize(scope, 'finalize', tokens.finalize); registry.markFinalized(scope.runId); }
  registry.authorize(scope, op, tokens[op]);
  expect(() => registry.authorize(scope, op, tokens[op])).toThrow('capability-refused');
  registry.close();
});
it('ack revokes receipt while repeatable key and capture authority remains usable', () => {
  const { registry, tokens } = setup();
  registry.authorize(scope, 'finalize', tokens.finalize); registry.markFinalized(scope.runId);
  registry.authorize(scope, 'ack', tokens.ack);
  expect(() => registry.authorize(scope, 'receipt', tokens.receipt)).toThrow('capability-refused');
  for (let i = 0; i < 2; i++) for (const op of ['key', 'capture'] as const) registry.authorize(scope, op, tokens[op]);
  registry.close();
});
it('rejects duplicate finalized run and the 33rd run without recycling', () => {
  const { registry, tokens } = setup();
  registry.authorize(scope, 'finalize', tokens.finalize); registry.markFinalized(scope.runId);
  expect(() => registry.register(scope)).toThrow('run-state');
  for (let i = 1; i < 32; i++) registry.register({ ...scope, runId: `run-${i}` });
  expect(() => registry.register({ ...scope, runId: 'run-33' })).toThrow('control-limit');
  registry.close();
});
it.each(['short', 'duplicate'] as const)('rejects %s RNG bytes and zeroes minted buffers', (bad) => {
  const registry = new CapabilityRegistry(scope.fixtureId, scope.epoch);
  const bytes = Buffer.alloc(32, 7);
  vi.mocked(randomBytes).mockReturnValueOnce(bytes as never).mockReturnValueOnce(
    (bad === 'short' ? Buffer.alloc(31, 8) : Buffer.from(bytes)) as never);
  expect(() => registry.register(scope)).toThrow('control-limit');
  expect(bytes).toEqual(Buffer.alloc(32));
});
it('rejects short control-instance RNG output', () => {
  vi.mocked(randomBytes).mockReturnValueOnce(Buffer.alloc(31) as never);
  expect(() => new CapabilityRegistry(scope.fixtureId, scope.epoch)).toThrow('control-limit');
});
it('close erases every token buffer and permanently refuses old authority', () => {
  const { registry, tokens } = setup();
  const bytes = vi.mocked(randomBytes).mock.results.map((entry) => entry.value as Buffer);
  registry.close();
  expect(bytes.every((value) => value.equals(Buffer.alloc(32)))).toBe(true);
  expect(() => registry.authorize(scope, 'receipt', tokens.receipt)).toThrow('capability-refused');
  expect(() => registry.register(scope)).toThrow('capability-refused');
});
it('fresh instance and new eval reject earlier capabilities with recurring run ids', () => {
  const old = setup(); old.registry.close();
  const fresh = setup();
  expect(() => fresh.registry.authorize(scope, 'receipt', old.tokens.receipt)).toThrow('capability-refused');
  const nextScope = { ...scope, epoch: '2-' + 'b'.repeat(32) };
  const next = new CapabilityRegistry(scope.fixtureId, nextScope.epoch); next.register(nextScope);
  expect(() => next.authorize(nextScope, 'receipt', fresh.tokens.receipt)).toThrow('capability-refused');
  fresh.registry.close(); next.close();
});
