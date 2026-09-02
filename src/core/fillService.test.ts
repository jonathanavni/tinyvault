import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import {
  BackendError,
  type BackendStatus,
  type CredentialBackend,
} from '../backends/backend';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import {
  SessionHostError,
  type FillDestinationPort,
  type InjectOutcome,
  type SessionHost,
} from './browserPort';
import { InvalidControlIdentityError, type LockdownRegistry } from './lockdown';
import { Secret } from './redaction';
import { createFillService } from './fillService';
import type { CredentialPolicy, FillRequest, Origin } from './types';
import { serializeExact } from '../agents/transcript';

const ORIGIN_A = 'https://a.example' as Origin;
const ORIGIN_B = 'https://b.example' as Origin;
const HANDLE = 'vh_test';

class TrackedSecret extends Secret {
  clearCalls = 0;
  override clear(): void {
    this.clearCalls += 1;
    super.clear();
  }
}

type HarnessOptions = Readonly<{
  origin?: Origin | null;
  reobserved?: Origin | null;
  epochReads?: readonly number[];
  inject?: (secret: Secret, expectedOrigin: Origin) => Promise<InjectOutcome>;
  policy?: CredentialPolicy;
  resolvePolicyError?: unknown;
  resolveSecretError?: unknown;
  sessionError?: SessionHostError;
  observeThrows?: boolean;
  registry?: LockdownRegistry;
  afterResolveSecret?: (domain: ReturnType<typeof createLockdownDomain>) => void;
  status?: BackendStatus;
  secretValue?: string;
  pinKind?: 'no-password-control' | 'cross-origin-frame';
  preLocked?: boolean;
}>;

function request(overrides: Partial<FillRequest> = {}): FillRequest {
  return {
    handle: HANDLE,
    sessionId: 'session',
    fields: [{ role: 'password', selector: '#password' }],
    ...overrides,
  };
}

function harness(options: HarnessOptions = {}) {
  const domain = createLockdownDomain();
  const identity = domain.authority.mint({
    sessionId: 'session', documentId: 'doc', frameId: 'top', elementId: 'password',
  });
  if (options.preLocked) domain.registry.lock(identity);
  const log: string[] = [];
  let epochIndex = 0;
  let observeCalls = 0;
  const inject = options.inject ?? (async (secret: Secret) => {
    log.push('inject');
    secret.consume();
    return Object.freeze({
      assigned: true, observedOrigin: ORIGIN_A,
      controlToken: 'control', documentToken: 'document',
    });
  });
  const port: FillDestinationPort = Object.freeze({
    documentEpoch: () => {
      log.push('epoch');
      const values = options.epochReads ?? [0];
      return values[Math.min(epochIndex++, values.length - 1)]!;
    },
    observeTop: async () => {
      log.push('observe');
      observeCalls += 1;
      if (options.observeThrows) throw new Error('violated totality');
      const initial = Object.hasOwn(options, 'origin') ? options.origin! : ORIGIN_A;
      const reobserved = Object.hasOwn(options, 'reobserved') ? options.reobserved! : initial;
      const origin = observeCalls === 1 ? initial : reobserved;
      return Object.freeze({ origin, path: origin === null ? null : `${origin}/login` });
    },
    pinPasswordDestination: async () => {
      log.push('pin');
      if (options.pinKind !== undefined) return Object.freeze({ kind: options.pinKind });
      return Object.freeze({
        kind: 'pinned' as const,
        destination: Object.freeze({ identity, inject }),
      });
    },
  });
  const sessions: SessionHost = {
    async runExclusive(_sessionId, operation) {
      log.push('session');
      if (options.sessionError) throw options.sessionError;
      return operation(port);
    },
  };
  const secrets: TrackedSecret[] = [];
  const backend: CredentialBackend = {
    probeAvailability: vi.fn(async () => options.status ?? ({ available: true } as const)),
    listItems: vi.fn(async () => Object.freeze([Object.freeze({
      handle: HANDLE, label: 'Account', kind: 'password' as const, available: true,
    })])),
    resolvePolicy: vi.fn(async () => {
      log.push('policy');
      if (options.resolvePolicyError) throw options.resolvePolicyError;
      return options.policy ?? Object.freeze({
        canonicalOrigin: ORIGIN_A,
        fieldRecipe: Object.freeze(['password']) as unknown as CredentialPolicy['fieldRecipe'],
      });
    }),
    resolveSecret: vi.fn(async () => {
      log.push('secret');
      if (options.resolveSecretError) throw options.resolveSecretError;
      const secret = new TrackedSecret(options.secretValue ?? 'unit-secret');
      secrets.push(secret);
      options.afterResolveSecret?.(domain);
      return secret;
    }),
    dispose: vi.fn(async () => undefined),
  };
  const service = createFillService({
    backend,
    sessions,
    registry: options.registry ?? tracingRegistry(domain.registry, log),
  });
  return { backend, domain, identity, log, port, secrets, service };
}

function tracingRegistry(registry: LockdownRegistry, log: string[]): LockdownRegistry {
  return Object.freeze({
    lock(identity) { log.push('lock'); registry.lock(identity); },
    isLocked(identity) { log.push('isLocked'); return registry.isLocked(identity); },
  });
}

describe('D4 locked fill order and closed boundary', () => {
  it('kills reorder, policy-derived filled roles, mutable output, and extra-key mutants', async () => {
    const setup = harness();
    const outcome = await setup.service.fill(request({ assertedOrigin: ORIGIN_A }));
    expect(setup.log).toEqual([
      'session', 'epoch', 'observe', 'policy', 'pin', 'epoch',
      'isLocked', 'lock', 'secret', 'isLocked', 'inject',
    ]);
    expect(outcome).toEqual({
      result: { ok: true, filled: ['password'] },
      observation: {
        topOrigin: ORIGIN_A, topPath: `${ORIGIN_A}/login`, reobservedOrigin: null,
        assertedMismatch: null,
        assigned: { observedOrigin: ORIGIN_A, controlToken: 'control', documentToken: 'document' },
      },
    });
    expect(Reflect.ownKeys(outcome)).toEqual(['result', 'observation']);
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.result)).toBe(true);
    expect(Object.isFrozen(outcome.observation)).toBe(true);
    expect(setup.secrets[0]!.clearCalls).toBe(1);
  });

  it.each([
    ['zero fields', []],
    ['two fields', [{ role: 'password', selector: '#password' }, { role: 'password', selector: '#other' }]],
    ['username', [{ role: 'username', selector: '#password' }]],
    ['totp', [{ role: 'totp', selector: '#password' }]],
    ['extra field key', [{ role: 'password', selector: '#password', value: 'forbidden' }]],
  ] as const)('kills boundary mutation accepting %s without backend traffic', async (_name, fields) => {
    const setup = harness();
    expect((await setup.service.fill(request({ fields: fields as any }))).result)
      .toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.backend.resolvePolicy).not.toHaveBeenCalled();
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it.each(['unknown-session', 'closing'] as const)(
    'kills %s host-error leakage while keeping the backend unopened',
    async (kind) => {
      const setup = harness({ sessionError: new SessionHostError(kind) });
      expect((await setup.service.fill(request())).result).toEqual({ ok: false, reason: 'session-unknown' });
      expect(setup.backend.resolvePolicy).not.toHaveBeenCalled();
    },
  );

  it('kills queued reentrancy leakage by mapping it to the fixed no-control result', async () => {
    const setup = harness({ sessionError: new SessionHostError('reentrant') });
    expect((await setup.service.fill(request())).result)
      .toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.backend.resolvePolicy).not.toHaveBeenCalled();
  });
});

describe('origin, staleness, and backend mapping', () => {
  it('kills policy/page confusion and resolving a secret on the wrong live origin', async () => {
    const setup = harness({ origin: ORIGIN_B });
    const outcome = await setup.service.fill(request());
    expect(outcome.result).toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(outcome.observation.topOrigin).toBe(ORIGIN_B);
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it('kills asserted-origin authority, omission refusal, and malformed-origin leakage', async () => {
    const mismatch = harness();
    const denied = await mismatch.service.fill(request({ assertedOrigin: ORIGIN_B }));
    expect(denied.result).toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(denied.observation.assertedMismatch).toBe(ORIGIN_B);
    expect(mismatch.backend.resolveSecret).not.toHaveBeenCalled();

    const malformed = harness();
    expect((await malformed.service.fill(request({ assertedOrigin: 'https://a.example/path' }))).result)
      .toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(malformed.backend.resolvePolicy).not.toHaveBeenCalled();

    expect((await harness().service.fill(request())).result).toEqual({ ok: true, filled: ['password'] });
    expect((await harness().service.fill(request({ assertedOrigin: ORIGIN_A }))).result)
      .toEqual({ ok: true, filled: ['password'] });
  });

  it('kills about:blank authorization and canonical-origin synthesis from policy', async () => {
    const setup = harness({ origin: null });
    const outcome = await setup.service.fill(request());
    expect(outcome.result).toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(outcome.observation).toMatchObject({ topOrigin: null, topPath: null });
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it('kills canonicalOrigin re-reads after the step-1 policy snapshot', async () => {
    let originReads = 0;
    const policy = {
      get canonicalOrigin() {
        originReads += 1;
        return originReads === 1 ? ORIGIN_A : ORIGIN_B;
      },
      fieldRecipe: ['password'],
    } as CredentialPolicy;
    const setup = harness({
      policy,
      inject: async (secret, expectedOrigin) => {
        secret.consume();
        expect(expectedOrigin).toBe(ORIGIN_A);
        return {
          assigned: true, observedOrigin: ORIGIN_A,
          controlToken: 'control', documentToken: 'document',
        };
      },
    });

    expect((await setup.service.fill(request())).result).toEqual({ ok: true, filled: ['password'] });
    expect(originReads).toBe(1);
  });

  it.each([
    ['not found', new BackendError('not-found'), 'handle-unavailable'],
    ['locked', new BackendError('locked'), 'backend-error'],
    ['integrity', new BackendError('integrity'), 'backend-error'],
    ['foreign', new Error('native detail'), 'backend-error'],
  ] as const)('kills resolvePolicy mapping mutation for %s', async (_name, error, reason) => {
    const setup = harness({ resolvePolicyError: error });
    expect((await setup.service.fill(request())).result).toEqual({ ok: false, reason });
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it('kills accepting a recipe without password or resolving its secret', async () => {
    const setup = harness({ policy: { canonicalOrigin: ORIGIN_A, fieldRecipe: ['username'] } });
    expect((await setup.service.fill(request())).result)
      .toEqual({ ok: false, reason: 'handle-unavailable' });
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it('kills post-secret lock rollback after a backend failure', async () => {
    const setup = harness({ resolveSecretError: new BackendError('unavailable') });
    expect((await setup.service.fill(request())).result).toEqual({ ok: false, reason: 'backend-error' });
    expect(setup.domain.registry.isLocked(setup.identity)).toBe(true);
    expect((await setup.service.fill(request())).result).toEqual({ ok: false, reason: 'locked-field' });
    expect(setup.backend.resolveSecret).toHaveBeenCalledTimes(1);
  });

  it('kills the missing epoch check before secret resolution', async () => {
    const setup = harness({ epochReads: [4, 5], reobserved: ORIGIN_A });
    expect((await setup.service.fill(request())).result)
      .toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it('kills stale-lock misclassification and persists a changed re-observed origin', async () => {
    const registry: LockdownRegistry = Object.freeze({
      lock: () => { throw new InvalidControlIdentityError(); },
      isLocked: () => false,
    });
    const setup = harness({ registry, reobserved: ORIGIN_B });
    const outcome = await setup.service.fill(request());
    expect(outcome.result).toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(outcome.observation.reobservedOrigin).toBe(ORIGIN_B);
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it('kills a throwing staleness handler that exposes port errors to the caller', async () => {
    let calls = 0;
    const setup = harness();
    const throwingPort: FillDestinationPort = {
      ...setup.port,
      observeTop: async () => {
        calls += 1;
        if (calls > 1) throw new Error('forbidden handler detail');
        return { origin: ORIGIN_A, path: `${ORIGIN_A}/login` };
      },
      documentEpoch: (() => { let epoch = 0; return () => epoch++; })(),
    };
    const sessions: SessionHost = { runExclusive: async (_id, op) => op(throwingPort) };
    const service = createFillService({ backend: setup.backend, sessions, registry: setup.domain.registry });
    expect((await service.fill(request())).result).toEqual({ ok: false, reason: 'no-password-control' });
  });

  it('kills collapsing a session-gone staleness observation into a page-gone refusal', async () => {
    const setup = harness();
    let observations = 0;
    const stalePort: FillDestinationPort = {
      ...setup.port,
      observeTop: async () => {
        observations += 1;
        if (observations > 1) throw new SessionHostError('unknown-session');
        return { origin: ORIGIN_A, path: `${ORIGIN_A}/login` };
      },
      documentEpoch: (() => { let epoch = 0; return () => epoch++; })(),
    };
    const sessions: SessionHost = { runExclusive: async (_id, op) => op(stalePort) };
    const service = createFillService({ backend: setup.backend, sessions, registry: setup.domain.registry });
    expect((await service.fill(request())).result).toEqual({ ok: false, reason: 'session-unknown' });
    expect(setup.backend.resolveSecret).not.toHaveBeenCalled();
  });

  it.each([
    ['not found', new BackendError('not-found'), 'handle-unavailable'],
    ['integrity', new BackendError('integrity'), 'backend-error'],
    ['foreign', new Error('native secret detail'), 'backend-error'],
  ] as const)('kills resolveSecret mapping mutation for %s after preserving the pre-lock', async (_name, error, reason) => {
    const setup = harness({ resolveSecretError: error });
    expect((await setup.service.fill(request())).result).toEqual({ ok: false, reason });
    expect(setup.domain.registry.isLocked(setup.identity)).toBe(true);
  });
});

describe('Secret cleanup and closed inject mapping', () => {
  it.each([
    ['origin', { assigned: false, reason: 'origin', observedOrigin: ORIGIN_B }],
    ['identity', { assigned: false, reason: 'identity' }],
    ['transport', { assigned: false, reason: 'transport' }],
    ['too-long', { assigned: false, reason: 'too-long' }],
    ['unplaceable', { assigned: false, reason: 'unplaceable' }],
  ] as const)('kills missing clear and result mapping on the post-consume %s path', async (_name, injected) => {
    const setup = harness({ inject: async (secret) => { secret.consume(); return injected; } });
    const outcome = await setup.service.fill(request());
    const reasons = {
      origin: 'origin-not-authorized', identity: 'no-password-control',
      transport: 'no-password-control', 'too-long': 'backend-error',
      unplaceable: 'backend-error',
    } as const;
    expect(outcome.result).toEqual({ ok: false, reason: reasons[injected.reason] });
    expect(setup.secrets[0]!.clearCalls).toBe(1);
    if (injected.reason === 'origin') expect(outcome.observation.reobservedOrigin).toBe(ORIGIN_B);
  });

  it('kills a try block that begins only at inject by clearing post-resolve staleness', async () => {
    const setup = harness({
      afterResolveSecret: (domain) => domain.lifecycle.clearOnTrustedTopLevelNavigation('session'),
    });
    const outcome = await setup.service.fill(request());
    expect(outcome.result).toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.secrets[0]!.clearCalls).toBe(1);
  });

  it('kills a browser exception escape while still clearing the resolved secret', async () => {
    const setup = harness({ inject: async () => { throw new Error('browser detail'); } });
    expect((await setup.service.fill(request())).result)
      .toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.secrets[0]!.clearCalls).toBe(1);
  });
});

describe('noninterference, setup, and structural surface', () => {
  it('kills secret-value influence on every pre-secret refusal while retaining a success control', async () => {
    const cases = [
      ['boundary', {}, request({ fields: [] }), 'no-password-control'],
      ['unknown session', { sessionError: new SessionHostError('unknown-session') }, request(), 'session-unknown'],
      ['missing handle', { resolvePolicyError: new BackendError('not-found') }, request(), 'handle-unavailable'],
      ['recipe', { policy: { canonicalOrigin: ORIGIN_A, fieldRecipe: ['username'] } }, request(), 'handle-unavailable'],
      ['assertion', {}, request({ assertedOrigin: ORIGIN_B }), 'origin-not-authorized'],
      ['top origin', { origin: ORIGIN_B }, request(), 'origin-not-authorized'],
      ['pin refusal', { pinKind: 'no-password-control' }, request(), 'no-password-control'],
      ['frame refusal', { pinKind: 'cross-origin-frame' }, request(), 'cross-origin-frame'],
      ['epoch', { epochReads: [0, 1] }, request(), 'no-password-control'],
      ['locked', { preLocked: true }, request(), 'locked-field'],
    ] as const;
    for (const [name, options, input, reason] of cases) {
      const bytes: string[] = [];
      for (const secretValue of ['s', 'x'.repeat(4096)]) {
        const setup = harness({ ...options, secretValue } as HarnessOptions);
        bytes.push(serializeExact((await setup.service.fill(input)).result));
        expect(setup.backend.resolveSecret, name).not.toHaveBeenCalled();
      }
      expect(new Set(bytes), name).toEqual(new Set([serializeExact({ ok: false, reason })]));
    }
    expect((await harness({ secretValue: 'control' }).service.fill(request())).result)
      .toEqual({ ok: true, filled: ['password'] });
  });

  it('kills secret-dependent result/observation bytes across the complete secret axis', async () => {
    const secrets = [
      'a', 'x'.repeat(16), 'x'.repeat(64), 'x'.repeat(1024), 'x'.repeat(4096),
      '"\\\n\r\t\b\f', 'é漢字', '"\\'.repeat(256),
    ];
    const serialized = [];
    for (const value of secrets) {
      const setup = harness({ secretValue: value, inject: async (secret) => {
        expect(secret.consume()).toBe(value);
        return {
          assigned: true, observedOrigin: ORIGIN_A,
          controlToken: 'control', documentToken: 'document',
        };
      } });
      const outcome = await setup.service.fill(request());
      serialized.push([serializeExact(outcome.result), serializeExact(outcome.observation)]);
    }
    expect(new Set(serialized.map(([result]) => result)).size).toBe(1);
    expect(new Set(serialized.map(([, observation]) => observation)).size).toBe(1);
  });

  it('kills secret- or policy-shape-dependent closed outcomes on every post-consume refusal path', async () => {
    const secrets = ['a', 'x'.repeat(16), 'x'.repeat(64), 'x'.repeat(1024), 'x'.repeat(4096), 'é漢字', '"\\'.repeat(64)];
    const policyShapes: CredentialPolicy['fieldRecipe'][] = [
      ['password'],
      ['username', 'password', 'totp'],
    ];
    for (const injected of [
      { assigned: false, reason: 'origin', observedOrigin: ORIGIN_B },
      { assigned: false, reason: 'identity' },
      { assigned: false, reason: 'too-long' },
      { assigned: false, reason: 'unplaceable' },
      { assigned: false, reason: 'transport' },
    ] as const) {
      const bytes: string[] = [];
      const resultBytes: string[] = [];
      for (const fieldRecipe of policyShapes) {
        for (const value of secrets) {
          const setup = harness({
            policy: { canonicalOrigin: ORIGIN_A, fieldRecipe },
            secretValue: value,
            inject: async (secret) => { expect(secret.consume()).toBe(value); return injected; },
          });
          const outcome = await setup.service.fill(request());
          bytes.push(serializeExact({ result: outcome.result, observation: outcome.observation }));
          resultBytes.push(serializeExact(outcome.result));
        }
      }
      expect(new Set(bytes).size, injected.reason).toBe(1);
      expect(new Set(resultBytes).size, `${injected.reason} result bytes across policy shapes`).toBe(1);
    }
  });

  it('kills policy-derived success fields across field-recipe and canonical-origin shapes', async () => {
    const policies: CredentialPolicy[] = [
      { canonicalOrigin: 'https://a.co', fieldRecipe: ['password'] },
      { canonicalOrigin: 'https://an-intentionally-long-policy-origin.example', fieldRecipe: ['username', 'password'] },
    ];
    const resultBytes: string[] = [];
    for (const policy of policies) {
      const setup = harness({ origin: policy.canonicalOrigin, policy });
      const outcome = await setup.service.fill(request());
      resultBytes.push(serializeExact(outcome.result));
      expect(outcome.observation.topOrigin).toBe(policy.canonicalOrigin);
    }
    expect(new Set(resultBytes)).toEqual(new Set(['{"ok":true,"filled":["password"]}']));

    const refusalBytes: string[] = [];
    for (const canonicalOrigin of [ORIGIN_B, 'https://an-intentionally-long-wrong-origin.example' as Origin]) {
      const setup = harness({
        origin: ORIGIN_A,
        policy: { canonicalOrigin, fieldRecipe: ['username', 'password'] },
      });
      const outcome = await setup.service.fill(request());
      refusalBytes.push(serializeExact(outcome.result));
      expect(outcome.observation.topOrigin).toBe(ORIGIN_A);
    }
    expect(new Set(refusalBytes)).toEqual(new Set([
      '{"ok":false,"reason":"origin-not-authorized"}',
    ]));
  });

  it('kills mutable list/setup outputs, wrong status mapping, and skipped backend disposal', async () => {
    for (const [status, expected] of [
      [{ available: false, reason: 'not_installed' }, 'backend_unavailable'],
      [{ available: false, reason: 'error' }, 'backend_unavailable'],
      [{ available: false, reason: 'not_authenticated' }, 'backend_locked'],
      [{ available: false, reason: 'locked' }, 'backend_locked'],
    ] as const) {
      const setup = harness({ status });
      const backendError = { ok: false, reason: 'backend-error' } as const;
      expect(await setup.service.setupReasonFor(backendError)).toBe(expected);
    }
    const setup = harness();
    expect(await setup.service.setupReasonFor({ ok: false, reason: 'handle-unavailable' }))
      .toBe('missing_item');
    expect(await setup.service.setupReasonFor({ ok: false, reason: 'locked-field' })).toBeNull();
    const listed = await setup.service.listVault();
    expect(listed).toEqual({ items: [{ handle: HANDLE, label: 'Account', kind: 'password', available: true }] });
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(listed.items)).toBe(true);
    expect(await setup.service.requestSetup({ reason: 'backend_locked' }))
      .toEqual({ instruction: 'Unlock the TinyVault credential backend, then retry.' });
    await setup.service.disposeBackend();
    expect(setup.backend.dispose).toHaveBeenCalledOnce();
  });

  it('kills canary-bearing own properties on the fill service and outcome', async () => {
    const canary = 'TVC_fill_structure_91D2';
    const setup = harness({ secretValue: canary, inject: async (secret) => {
      secret.consume();
      return { assigned: false, reason: 'identity' };
    } });
    const outcome = await setup.service.fill(request());
    const visible = [setup.service, outcome].map((value) =>
      `${JSON.stringify(value)}\n${inspect(value, { showHidden: true, depth: 10 })}\n${Reflect.ownKeys(value)}`)
      .join('\n');
    expect(visible).not.toContain(canary);
    expect(Reflect.ownKeys(setup.service)).toEqual([
      'fill', 'listVault', 'requestSetup', 'setupReasonFor', 'disposeBackend',
    ]);
  });
});

// Compile-time negatives: each @ts-expect-error kills a widening of the locked port/result surface.
if (false) {
  const setup = harness();
  void setup.service.fill(request()).then((outcome) => {
    // @ts-expect-error FillOutcome.result has no secret-bearing field.
    const _leaky: { secret: string } = outcome.result;
    void _leaky;
  });
  void setup.port.pinPasswordDestination('#password').then((pinned) => {
    if (pinned.kind !== 'pinned') return;
    // @ts-expect-error inject requires the expected origin argument.
    void pinned.destination.inject(new Secret('compile-only'));
  });
  // @ts-expect-error FillDestinationPort exposes no general evaluate primitive.
  setup.port.evaluate;
  // @ts-expect-error FillDestinationPort exposes no Page.
  setup.port.page;
  // @ts-expect-error FillDestinationPort exposes no CDP session.
  setup.port.cdp;
}
