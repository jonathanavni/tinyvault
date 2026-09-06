import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { CompletionReceipt } from './scorecard.schema';
import { CompletionVerifier, canaryCommitment, signCompletionReceipt } from './completion';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, sign: vi.fn(actual.sign), verify: vi.fn(actual.verify) };
});

const now = Date.parse('2026-08-31T12:00:00.000Z');
const keyPair = generateKeyPairSync('ed25519');
const canary = 'TVC_completion_run-1_A234567BCDEF';

function receipt(overrides: Partial<CompletionReceipt> = {}): CompletionReceipt {
  return {
    fixtureId: 'benign-login',
    fixtureVersion: '1',
    scenarioId: 'benign-login-control',
    runId: 'run-1',
    nonce: 'nonce-1',
    canaryId: 'canary-run-1',
    canaryCommitment: canaryCommitment(canary),
    successEndpoint: 'http://127.0.0.1/success',
    issuedAt: new Date(now).toISOString(),
    ...overrides,
  };
}

function binding(payload = receipt()) {
  return {
    fixtureId: payload.fixtureId,
    fixtureVersion: payload.fixtureVersion,
    scenarioId: payload.scenarioId,
    runId: payload.runId,
    nonce: payload.nonce,
    canaryId: payload.canaryId,
    canaryCommitment: payload.canaryCommitment,
    successEndpoint: payload.successEndpoint,
  };
}

describe('CompletionVerifier', () => {
  it('rejects a genuine attestation paired with a foreign fixture receipt as bad-signature', () => {
    const foreign = generateKeyPairSync('ed25519');
    const payload = receipt();
    const foreignReceipt = signCompletionReceipt(payload, foreign.privateKey);
    expect(new CompletionVerifier(keyPair.publicKey).verify(
      foreignReceipt, binding(payload), now,
    )).toEqual({ taskCompleted: false, reason: 'bad-signature' });
  });

  it('shares replay identity across two verifiers when the evaluation ledger is shared', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    const ledger = new Set<string>();
    const first = new CompletionVerifier(keyPair.publicKey, undefined, undefined, ledger);
    const second = new CompletionVerifier(keyPair.publicKey, undefined, undefined, ledger);
    expect(first.verify(signed, binding(payload), now)).toEqual({ taskCompleted: true });
    expect(second.verify(signed, binding(payload), now)).toEqual({
      taskCompleted: false, reason: 'replayed',
    });
  });
  it('accepts a bound valid receipt once and rejects replay', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    const verifier = new CompletionVerifier(keyPair.publicKey);
    expect(verifier.verify(signed, binding(payload), now)).toEqual({ taskCompleted: true });
    expect(verifier.verify(signed, binding(payload), now)).toEqual({
      taskCompleted: false, reason: 'replayed',
    });
  });

  it('rejects noncanonical signatures and replays by bound identity', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    const padded = JSON.parse(signed) as { signature: string };
    padded.signature += '=';
    const verifier = new CompletionVerifier(keyPair.publicKey);

    expect(verifier.verify(signed, binding(payload), now).taskCompleted).toBe(true);
    expect(verifier.verify(JSON.stringify(padded), binding(payload), now).taskCompleted).toBe(false);
    expect(verifier.verify(signed, binding(payload), now).reason).toBe('replayed');
  });

  it('binds fixture identity as well as the run identity', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), fixtureId: 'other-fixture',
    }, now).taskCompleted).toBe(false);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), fixtureVersion: 'other-version',
    }, now).taskCompleted)
      .toBe(false);
  });

  it('rejects cross-run, tampered, and stale receipts', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), runId: 'run-2',
    }, now).taskCompleted).toBe(false);

    const tampered = JSON.parse(signed) as { payload: CompletionReceipt };
    tampered.payload.nonce = 'attacker-nonce';
    expect(new CompletionVerifier(keyPair.publicKey).verify(
      JSON.stringify(tampered), binding(payload), now,
    ).reason).toBe('bad-signature');

    const stale = receipt({ issuedAt: new Date(now - 600_000).toISOString() });
    expect(new CompletionVerifier(keyPair.publicKey).verify(
      signCompletionReceipt(stale, keyPair.privateKey), binding(stale), now,
    ).reason).toBe('stale');
  });

  it('rejects a canary that does not match the signed commitment', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), canaryCommitment: canaryCommitment('TVC_decoy_run-1_A234567BCDEF'),
    }, now)).toEqual({ taskCompleted: false, reason: 'canary-mismatch' });
  });

  it('rejects unknown receipt payload fields', () => {
    const payload = receipt();
    const envelope = JSON.parse(signCompletionReceipt(payload, keyPair.privateKey)) as {
      payload: CompletionReceipt & { attackerControlled?: string };
    };
    envelope.payload.attackerControlled = 'unsigned-extension';
    expect(new CompletionVerifier(keyPair.publicKey).verify(
      JSON.stringify(envelope), binding(payload), now,
    )).toEqual({ taskCompleted: false, reason: 'malformed' });
  });

  it('uses the persisted run window instead of adjudication wall-clock time', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    const verifier = new CompletionVerifier(keyPair.publicKey);
    expect(verifier.verifyPersisted(signed, binding(payload), {
      startedAt: new Date(now - 1_000).toISOString(),
      endedAt: new Date(now + 1_000).toISOString(),
    })).toEqual({ taskCompleted: true });

    const outside = receipt({ issuedAt: new Date(now - 2_000).toISOString() });
    expect(new CompletionVerifier(keyPair.publicKey).verifyPersisted(
      signCompletionReceipt(outside, keyPair.privateKey), binding(outside), {
        startedAt: new Date(now - 1_000).toISOString(),
        endedAt: new Date(now + 1_000).toISOString(),
      },
    )).toEqual({ taskCompleted: false, reason: 'stale' });
  });
});

// Independent wire oracle: never imports production domains, field lists or encoders.
function receiptFields(p: CompletionReceipt): string[] {
  return ['receipt', p.fixtureId, p.fixtureVersion, p.scenarioId, p.runId, p.nonce,
    p.canaryId, p.canaryCommitment, p.successEndpoint, p.issuedAt];
}
function literalFrames(fields: string[]): Buffer {
  return Buffer.concat(fields.map((s) => {
    const bytes = Buffer.from(s, 'utf8');
    const n = bytes.length;
    return Buffer.concat([Buffer.from([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255]), bytes]);
  }));
}
function independentReceipt(p: CompletionReceipt, preimage: Buffer = Buffer.concat([
  Buffer.from('TinyVault/receipt/v2\0'), literalFrames(receiptFields(p)),
])): string {
  return JSON.stringify({ version: '2', payload: p,
    signature: cryptoSign(null, preimage, keyPair.privateKey).toString('base64url') });
}
function verifyReceipt(raw: string, p = receipt()) {
  return new CompletionVerifier(keyPair.publicKey).verify(raw, binding(p), now);
}

describe('receipt v2 signed transcript', () => {
  it('captures the exact literal receipt preimage at real signing and verification', () => {
    const p = receipt({ fixtureId: 'é\0😀', fixtureVersion: 'a|b', scenarioId: 'c',
      runId: 'r\u0001', nonce: 'e\u0301' });
    const expected = Buffer.concat([Buffer.from('TinyVault/receipt/v2\0'), literalFrames(receiptFields(p))]);
    vi.mocked(cryptoSign).mockClear();
    const signed = signCompletionReceipt(p, keyPair.privateKey);
    expect(JSON.parse(signed).version).toBe('2');
    expect(vi.mocked(cryptoSign).mock.calls).toHaveLength(1);
    expect(Buffer.from(vi.mocked(cryptoSign).mock.calls[0][1] as Buffer)).toEqual(expected);
    vi.mocked(cryptoVerify).mockClear();
    expect(verifyReceipt(signed, p)).toEqual({ taskCompleted: true });
    expect(vi.mocked(cryptoVerify).mock.calls).toHaveLength(1);
    expect(Buffer.from(vi.mocked(cryptoVerify).mock.calls[0][1] as Buffer)).toEqual(expected);
  });

  it('rejects independently signed missing domain, wrong kind/version/operation and omitted fields', () => {
    const p = receipt();
    const fields = receiptFields(p);
    const negatives = [
      literalFrames(fields),
      Buffer.concat([Buffer.from('TinyVault/attestation/v2\0'), literalFrames(fields)]),
      Buffer.concat([Buffer.from('TinyVault/receipt/v1\0'), literalFrames(fields)]),
      Buffer.concat([Buffer.from('TinyVault/receipt/v2\0'), literalFrames(['attest', ...fields.slice(1)])]),
      ...fields.map((_, i) => Buffer.concat([Buffer.from('TinyVault/receipt/v2\0'),
        literalFrames(fields.filter((_, j) => j !== i))])),
    ];
    expect(verifyReceipt(independentReceipt(p))).toEqual({ taskCompleted: true });
    for (const preimage of negatives) expect(verifyReceipt(independentReceipt(p, preimage)).reason).toBe('bad-signature');
  });

  it('keeps framed tuples and canonically equivalent Unicode strings distinct', () => {
    for (const [a, b] of [
      [receipt({ fixtureId: 'a|b', fixtureVersion: 'c' }), receipt({ fixtureId: 'a', fixtureVersion: 'b|c' })],
      [receipt({ fixtureId: 'é' }), receipt({ fixtureId: 'e\u0301' })],
    ]) {
      const left = signCompletionReceipt(a, keyPair.privateKey);
      const right = signCompletionReceipt(b, keyPair.privateKey);
      expect(JSON.parse(left).signature).not.toBe(JSON.parse(right).signature);
      expect(verifyReceipt(left, b).reason).toBe('binding-mismatch');
      expect(verifyReceipt(right, b).taskCompleted).toBe(true);
    }
  });

  it('binds every expected receipt field with the same verification key', () => {
    const p = receipt();
    const signed = signCompletionReceipt(p, keyPair.privateKey);
    for (const field of Object.keys(binding(p)) as Array<keyof ReturnType<typeof binding>>) {
      const expected = { ...binding(p), [field]: field === 'canaryCommitment' ? '0'.repeat(64) : 'different' };
      expect(new CompletionVerifier(keyPair.publicKey).verify(signed, expected, now).taskCompleted).toBe(false);
    }
    expect(verifyReceipt(signed).taskCompleted).toBe(true);
  });
});

describe('receipt v2 closed canonical envelope', () => {
  it.each([
    ['envelope duplicate same value', (raw: string) => raw.replace('"version":"2"', '"version":"2","version":"2"')],
    ['envelope duplicate conflicting value', (raw: string) => raw.replace('"version":"2"', '"version":"1","version":"2"')],
    ['envelope escaped duplicate alias', (raw: string) => raw.replace('"version":"2"', '"ver\\u0073ion":"2","version":"2"')],
    ['payload duplicate same value', (raw: string) => raw.replace('"fixtureId":"benign-login"', '"fixtureId":"benign-login","fixtureId":"benign-login"')],
    ['payload duplicate conflicting value', (raw: string) => raw.replace('"fixtureId":"benign-login"', '"fixtureId":"other","fixtureId":"benign-login"')],
    ['payload escaped duplicate alias', (raw: string) => raw.replace('"fixtureId":"benign-login"', '"fixture\\u0049d":"benign-login","fixtureId":"benign-login"')],
    ['escaped key spelling', (raw: string) => raw.replace('"fixtureId"', '"fixture\\u0049d"')],
    ['alternative value escape', (raw: string) => raw.replace('benign-login', '\\u0062enign-login')],
    ['interior whitespace', (raw: string) => raw.replace('{', '{ ')],
    ['trailing newline', (raw: string) => `${raw}\n`],
    ['leading BOM', (raw: string) => `\ufeff${raw}`],
    ['envelope key order', (raw: string) => JSON.stringify({ payload: JSON.parse(raw).payload, version: '2', signature: JSON.parse(raw).signature })],
    ['payload key order', (raw: string) => JSON.stringify({ ...JSON.parse(raw), payload: Object.fromEntries(Object.entries(JSON.parse(raw).payload).reverse()) })]
  ] as const)('rejects raw receipt %s before replay consumption', (_name, change) => {
    const p = receipt(); const raw = signCompletionReceipt(p, keyPair.privateKey);
    const verifier = new CompletionVerifier(keyPair.publicKey);
    expect(verifier.verify(change(raw), binding(p), now)).toEqual({ taskCompleted: false, reason: 'malformed' });
    expect(verifier.verify(raw, binding(p), now).taskCompleted).toBe(true);
  });

  it('rejects closed-schema/type/signature/digest/time violations in consumers and payload violations before signing', () => {
    const p = receipt();
    const raw = signCompletionReceipt(p, keyPair.privateKey);
    const envelope = JSON.parse(raw);
    const envelopes = [
      { ...envelope, version: '1' }, { ...envelope, version: 2 }, { ...envelope, extra: 'x' },
      { payload: p, signature: envelope.signature },
      { ...envelope, payload: [] }, { ...envelope, payload: null },
      ...['', `${envelope.signature}=`, envelope.signature.slice(1), 'A'.repeat(85) + 'B', 7]
        .map((signature) => ({ ...envelope, signature })),
    ];
    const payloads: unknown[] = [ { ...p, extra: 'x' },
      { ...p, canaryCommitment: p.canaryCommitment.toUpperCase() },
      ...['2026-08-31', '2026-08-31T12:00:00Z', '2026-02-30T12:00:00.000Z', 'bad', now]
        .map((issuedAt) => ({ ...p, issuedAt })),
    ];
    for (const field of Object.keys(p)) {
      const missing = { ...p } as Record<string, unknown>; delete missing[field]; payloads.push(missing);
      for (const value of ['', '\ud800', '\udfff', null, 1, false, [], {}]) payloads.push({ ...p, [field]: value });
    }
    for (const payload of payloads) {
      envelopes.push({ ...envelope, payload });
      vi.mocked(cryptoSign).mockClear();
      expect(() => signCompletionReceipt(payload as CompletionReceipt, keyPair.privateKey)).toThrow();
      expect(cryptoSign).not.toHaveBeenCalled();
    }
    for (const envelope of envelopes) expect(verifyReceipt(JSON.stringify(envelope)).reason).toBe('malformed');
    expect(verifyReceipt(raw).taskCompleted).toBe(true);
  });
});

function receiptAtSize(size: number, escaped: boolean): CompletionReceipt {
  const p = receipt({ fixtureId: 'a', runId: 'b' });
  const available = size - Buffer.byteLength(independentReceipt(p));
  const units = Math.floor(available / (escaped ? 6 : 1) / 2);
  const fill = (escaped ? '\0' : 'é').repeat(escaped ? units : Math.floor(units / 2));
  p.fixtureId += fill;
  p.runId += fill;
  p.nonce += 'x'.repeat(size - Buffer.byteLength(independentReceipt(p)));
  return p;
}

describe('receipt direct artifact byte bound', () => {
  it.each([false, true])('accepts exactly 262144 and rejects 262145 before sign/parse (escape expansion=%s)', (escaped) => {
    const exact = receiptAtSize(262144, escaped);
    const over = receiptAtSize(262145, escaped);
    const exactRaw = independentReceipt(exact);
    const overRaw = independentReceipt(over);
    expect(Buffer.byteLength(exactRaw)).toBe(262144);
    expect(Buffer.byteLength(overRaw)).toBe(262145);
    expect(Object.values(over).every((field) => Buffer.byteLength(field) < 262144)).toBe(true);
    expect(signCompletionReceipt(exact, keyPair.privateKey)).toBe(exactRaw);
    expect(verifyReceipt(exactRaw, exact).taskCompleted).toBe(true);
    vi.mocked(cryptoSign).mockClear();
    expect(() => signCompletionReceipt(over, keyPair.privateKey)).toThrow('artifact limit');
    expect(cryptoSign).not.toHaveBeenCalled();
    const parse = vi.spyOn(JSON, 'parse');
    try {
      expect(verifyReceipt(overRaw, over).reason).toBe('malformed');
      expect(parse).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
  });
});
