import { createHash, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { signEventsDigest, verifyEventsDigest } from './eventsDigest';
import { startLoginFixture } from './loginFixture';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, sign: vi.fn(actual.sign), verify: vi.fn(actual.verify) };
});
const keys = generateKeyPairSync('ed25519');
const events = Buffer.from('[ ]\n');
type Payload = { fixtureId: string; runId: string; eventsSha256: string };
function payload(fixtureId = 'benign-login', runId = 'run-1', bytes = events): Payload {
  return { fixtureId, runId, eventsSha256: createHash('sha256').update(bytes).digest('hex') };
}
// Independent literal vector, including uint32 bytes rather than a production encoder import.
function framed(fields: string[]): Buffer {
  return Buffer.concat(fields.map((value) => {
    const bytes = Buffer.from(value);
    const n = bytes.length;
    return Buffer.concat([Buffer.from([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255]), bytes]);
  }));
}
function fields(p: Payload): string[] { return ['attest', p.fixtureId, p.runId, p.eventsSha256]; }
function signed(p = payload(), preimage: Buffer = Buffer.concat([
  Buffer.from('TinyVault/attestation/v2\0'), framed(fields(p)),
])): string {
  return JSON.stringify({ version: '2', payload: p,
    signature: cryptoSign(null, preimage, keys.privateKey).toString('base64url') });
}
function verify(raw: string, p = payload(), bytes = events): boolean {
  return verifyEventsDigest(raw, p.fixtureId, p.runId, bytes, keys.publicKey);
}

describe('attestation v2 signed transcript', () => {
  it('captures the exact literal attestation preimage through finalized fixture signing and real verification', async () => {
    const fixture = await startLoginFixture(await mkdtemp(join(tmpdir(), 'tv-v2-preimage-')), {
      fixtureId: 'benign-login', fixtureVersion: '2', pages: {}, routes: {},
    });
    const setup = { scenarioId: 'test', runId: 'r-finalized', nonce: 'n', canaryId: 'c', canary: 'synthetic' };
    try {
      await fixture.registerRun(setup);
      await fixture.finalizeRun(setup.runId);
      const p = payload('benign-login', setup.runId);
      const expected = Buffer.concat([Buffer.from('TinyVault/attestation/v2\0'), framed(fields(p))]);
      vi.mocked(cryptoSign).mockClear();
      const raw = await fixture.attestEvents(setup.runId, events);
      expect(JSON.parse(raw)).toMatchObject({ version: '2', payload: p });
      expect(vi.mocked(cryptoSign).mock.calls).toHaveLength(1);
      expect(Buffer.from(vi.mocked(cryptoSign).mock.calls[0][1] as Buffer)).toEqual(expected);
      vi.mocked(cryptoVerify).mockClear();
      expect(verifyEventsDigest(raw, p.fixtureId, p.runId, events, fixture.verificationPublicKey)).toBe(true);
      expect(vi.mocked(cryptoVerify).mock.calls).toHaveLength(1);
      expect(Buffer.from(vi.mocked(cryptoVerify).mock.calls[0][1] as Buffer)).toEqual(expected);
    } finally { await fixture.close(); }
  });

  it('captures exact multibyte and NUL framing at the direct sign/verify boundary', () => {
    const p = payload('é\0😀', 'e\u0301|r\u0001');
    const expected = Buffer.concat([Buffer.from('TinyVault/attestation/v2\0'), framed(fields(p))]);
    vi.mocked(cryptoSign).mockClear();
    const raw = signEventsDigest(p.fixtureId, p.runId, events, keys.privateKey);
    expect(Buffer.from(vi.mocked(cryptoSign).mock.calls[0][1] as Buffer)).toEqual(expected);
    vi.mocked(cryptoVerify).mockClear();
    expect(verify(raw, p)).toBe(true);
    expect(Buffer.from(vi.mocked(cryptoVerify).mock.calls[0][1] as Buffer)).toEqual(expected);
  });

  it('rejects independently signed missing domain, wrong kind/version/operation and omitted fields', () => {
    const p = payload();
    const list = fields(p);
    const negatives = [framed(list),
      Buffer.concat([Buffer.from('TinyVault/receipt/v2\0'), framed(list)]),
      Buffer.concat([Buffer.from('TinyVault/attestation/v1\0'), framed(list)]),
      Buffer.concat([Buffer.from('TinyVault/attestation/v2\0'), framed(['receipt', ...list.slice(1)])]),
      ...list.map((_, i) => Buffer.concat([Buffer.from('TinyVault/attestation/v2\0'), framed(list.filter((_, j) => j !== i))])),
    ];
    expect(verify(signed(p))).toBe(true);
    for (const preimage of negatives) expect(verify(signed(p, preimage))).toBe(false);
  });

  it('rejects same-key fixture mismatch', () => {
    const raw = signed();
    expect(verify(raw)).toBe(true);
    expect(verifyEventsDigest(raw, 'other-fixture', 'run-1', events, keys.publicKey)).toBe(false);
  });
  it('rejects same-key run mismatch', () => {
    const raw = signed();
    expect(verify(raw)).toBe(true);
    expect(verifyEventsDigest(raw, 'benign-login', 'run-2', events, keys.publicKey)).toBe(false);
  });
  it('rejects exact-byte digest mismatch without reparsing or canonicalizing events', () => {
    const raw = signed();
    expect(verify(raw)).toBe(true);
    expect(verify(raw, payload(), Buffer.from('[]'))).toBe(false);
  });
  it('keeps framed tuples and canonically equivalent Unicode strings distinct', () => {
    for (const [a, b] of [[payload('a|b', 'c'), payload('a', 'b|c')], [payload('é'), payload('e\u0301')]]) {
      const first = signEventsDigest(a.fixtureId, a.runId, events, keys.privateKey);
      const second = signEventsDigest(b.fixtureId, b.runId, events, keys.privateKey);
      expect(JSON.parse(first).signature).not.toBe(JSON.parse(second).signature);
      expect(verify(first, b)).toBe(false);
      expect(verify(second, b)).toBe(true);
    }
  });
});

describe('attestation v2 closed canonical envelope', () => {
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
    ['payload key order', (raw: string) => JSON.stringify({ ...JSON.parse(raw), payload: { runId: JSON.parse(raw).payload.runId, ...JSON.parse(raw).payload } })]
  ] as const)('rejects raw attestation %s', (_name, change) => {
    const raw = signed();
    expect(verify(raw)).toBe(true);
    expect(verify(change(raw))).toBe(false);
  });

  it('rejects closed-schema/type/signature/digest violations and invalid producer strings before signing', () => {
    const p = payload(); const envelope = JSON.parse(signed());
    const variants: unknown[] = [
      { ...envelope, version: '1' }, { ...envelope, version: 2 }, { ...envelope, extra: 'x' },
      { payload: p, signature: envelope.signature }, { ...envelope, payload: [] }, { ...envelope, payload: null },
      { ...envelope, payload: { ...p, extra: 'x' } },
      { ...envelope, payload: { ...p, eventsSha256: p.eventsSha256.toUpperCase() } },
      ...['', `${envelope.signature}=`, envelope.signature.slice(1), 'A'.repeat(85) + 'B', 7]
        .map((signature) => ({ ...envelope, signature })),
    ];
    for (const field of Object.keys(p)) {
      const missing = { ...p } as Record<string, unknown>; delete missing[field];
      variants.push({ ...envelope, payload: missing });
      for (const value of ['', '\ud800', '\udfff', null, 1, false, [], {}]) {
        variants.push({ ...envelope, payload: { ...p, [field]: value } });
        if (field === 'eventsSha256') continue;
        vi.mocked(cryptoSign).mockClear();
        expect(() => signEventsDigest(
          field === 'fixtureId' ? value as string : p.fixtureId,
          field === 'runId' ? value as string : p.runId, events, keys.privateKey,
        )).toThrow();
        expect(cryptoSign).not.toHaveBeenCalled();
      }
    }
    for (const variant of variants) expect(verify(JSON.stringify(variant))).toBe(false);
    expect(verify(JSON.stringify(envelope))).toBe(true);
  });
});

function payloadAtSize(size: number, escaped: boolean): Payload {
  const p = payload('a', 'b');
  const available = size - Buffer.byteLength(signed(p));
  const units = Math.floor(available / (escaped ? 6 : 2) / 2);
  p.fixtureId += (escaped ? '\0' : 'é').repeat(units);
  p.runId += (escaped ? '\0' : 'é').repeat(units);
  p.runId += 'x'.repeat(size - Buffer.byteLength(signed(p)));
  return p;
}

describe('attestation direct byte bounds', () => {
  it.each([false, true])('accepts 262144 and rejects 262145 before sign/parse (escape expansion=%s)', (escaped) => {
    const exact = payloadAtSize(262144, escaped); const over = payloadAtSize(262145, escaped);
    const exactRaw = signed(exact); const overRaw = signed(over);
    expect(Buffer.byteLength(exactRaw)).toBe(262144); expect(Buffer.byteLength(overRaw)).toBe(262145);
    expect(Object.values(over).every((s) => Buffer.byteLength(s) < 262144)).toBe(true);
    expect(signEventsDigest(exact.fixtureId, exact.runId, events, keys.privateKey)).toBe(exactRaw);
    expect(verify(exactRaw, exact)).toBe(true);
    vi.mocked(cryptoSign).mockClear();
    expect(() => signEventsDigest(over.fixtureId, over.runId, events, keys.privateKey)).toThrow('artifact limit');
    expect(cryptoSign).not.toHaveBeenCalled();
    const parse = vi.spyOn(JSON, 'parse');
    try { expect(verify(overRaw, over)).toBe(false); expect(parse).not.toHaveBeenCalled(); }
    finally { parse.mockRestore(); }
  });
  it('accepts exactly 131072 raw bytes and refuses 131073 before signing', () => {
    const exact = Buffer.alloc(131072, 0x61); const over = Buffer.alloc(131073, 0x61);
    const raw = signEventsDigest('benign-login', 'run', exact, keys.privateKey);
    expect(verifyEventsDigest(raw, 'benign-login', 'run', exact, keys.publicKey)).toBe(true);
    vi.mocked(cryptoSign).mockClear();
    expect(() => signEventsDigest('benign-login', 'run', over, keys.privateKey)).toThrow('control-limit');
    expect(cryptoSign).not.toHaveBeenCalled();
  });
  it('direct attestation verifier refuses independently signed 131073 raw bytes with a 131072 positive', () => {
    const exact = Buffer.alloc(131072, 0x61); const over = Buffer.alloc(131073, 0x61);
    const exactPayload = payload('benign-login', 'run', exact);
    expect(verify(signed(exactPayload), exactPayload, exact)).toBe(true);
    const overPayload = payload('benign-login', 'run', over);
    const oversizedRaw = signed(overPayload);
    const signature = Buffer.from(JSON.parse(oversizedRaw).signature, 'base64url');
    expect(cryptoVerify(null, Buffer.concat([Buffer.from('TinyVault/attestation/v2\0'), framed(fields(overPayload))]),
      keys.publicKey, signature)).toBe(true);
    expect(verifyEventsDigest(oversizedRaw, 'benign-login', 'run', over, keys.publicKey)).toBe(false);
  });

});
