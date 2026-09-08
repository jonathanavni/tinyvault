// Fixed synthetic vectors prove the exact transcript binding; no vector establishes provenance.
import { createHmac, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  buildHelloTranscript, computeHelloMac, decodeBase64url, encodeBase64url, importAnnouncedKey,
  validateBody, verifyHelloMac, type HelloFields,
} from './handshake';
import { CAPABILITY_OPS, EPOCH_PATTERN, HELLO_PREFIX, type BridgeCode, type BridgeOp } from './protocol';
import { encodeFrame, FrameDecoder } from './frames';

const secret = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const fields: HelloFields = {
  challenge: Buffer.alloc(32, 0xa5), epoch: '1720000000000-0123456789abcdef0123456789abcdef',
  fixtureId: 'benign-login', containerId: '0123456789abcdef'.repeat(4),
  publicKeyDer: Buffer.from('302a300506032b6570032100' + '11'.repeat(32), 'hex'),
};
const publicKey = fields.publicKeyDer.toString('base64url');
const hello = { challenge: fields.challenge.toString('base64url'), epoch: fields.epoch,
  fixtureId: fields.fixtureId, containerId: fields.containerId };
const response = { publicKey, mac: computeHelloMac(secret, fields).toString('base64url') };

// Intentionally independent and wrong peer implementation: drops exactly one length-framed field.
function missingFieldMac(omit: number): Buffer {
  const values = [fields.challenge, Buffer.from(fields.epoch), Buffer.from(fields.fixtureId),
    Buffer.from(fields.containerId), fields.publicKeyDer];
  const pieces = values.filter((_, index) => index !== omit).map((value) => {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(value.length);
    return Buffer.concat([size, value]);
  });
  return createHmac('sha256', secret).update(Buffer.concat([Buffer.from(HELLO_PREFIX), ...pieces])).digest();
}
it('golden vector pins exact prefix field order lengths and MAC', () => {
  expect(computeHelloMac(secret, fields).toString('hex')).toBe('5abe44c28a422cb6928aa0d8c72d36c70d7993115038f7333c81955dfa04eeda');
  expect(buildHelloTranscript(fields).subarray(0, Buffer.byteLength(HELLO_PREFIX)).toString()).toBe(HELLO_PREFIX);
});
it.each(['challenge', 'epoch', 'fixtureId', 'containerId', 'publicKeyDer'])(
  'independent deletion of bound field %s fails verification', (name) => {
    const index = ['challenge', 'epoch', 'fixtureId', 'containerId', 'publicKeyDer'].indexOf(name);
    expect(() => verifyHelloMac(secret, fields, missingFieldMac(index))).toThrow('mac-invalid');
  },
);
it('tuple confusion equal concatenation with different splits produces different MACs', () => {
  const a = { ...fields, epoch: 'ab', fixtureId: 'c' };
  const b = { ...fields, epoch: 'a', fixtureId: 'bc' };
  expect(a.epoch + a.fixtureId).toBe(b.epoch + b.fixtureId);
  expect(computeHelloMac(secret, a)).not.toEqual(computeHelloMac(secret, b));
});
it('replay against fresh challenge fails', () => {
  const replay = computeHelloMac(secret, fields);
  expect(() => verifyHelloMac(secret, { ...fields, challenge: Buffer.alloc(32, 7) }, replay)).toThrow('mac-invalid');
  expect(() => verifyHelloMac(secret, fields, replay)).not.toThrow();
});
it.each([
  ['missing MAC', { publicKey }, 'body-shape'],
  ['short MAC', { ...response, mac: 'AA' }, 'mac-shape'],
  ['extra response body field', { ...response, extra: '' }, 'body-shape'],
  ['wrong MAC type', { ...response, mac: 4 }, 'body-shape'],
  ['key trailing bytes', { ...response, publicKey: Buffer.concat([fields.publicKeyDer, Buffer.from([0])]).toString('base64url') }, 'key-shape'],
] as const)('%s uses the ordered response code', (_name, body, code) => {
  expect(() => validateBody('hello', 'res', body)).toThrow(code);
});
it('key validation precedes MAC shape', () => {
  expect(() => validateBody('hello', 'res', { publicKey: 'AA', mac: 'AA' })).toThrow('key-shape');
});
it.each([
  ['extra hello body field', { ...hello, extra: '' }, 'body-shape'],
  ['non-64-hex containerId', { ...hello, containerId: 'benign-login' }, 'body-shape'],
  ['invalid epoch', { ...hello, epoch: 'old' }, 'body-shape'],
  ['invalid fixtureId', { ...hello, fixtureId: 'unknown' }, 'body-shape'],
  ['missing challenge', { epoch: hello.epoch, fixtureId: hello.fixtureId, containerId: hello.containerId }, 'body-shape'],
  ['short challenge', { ...hello, challenge: 'AA' }, 'challenge-shape'],
] as const)('%s uses the ordered request code', (_name, body, code) => {
  expect(() => validateBody('hello', 'req', body)).toThrow(code);
});
it('bootstrap missing secret is body-shape and short secret is secret-shape', () => {
  expect(() => validateBody('bootstrap', 'req', {})).toThrow('body-shape');
  expect(() => validateBody('bootstrap', 'req', { secret: 'AA' })).toThrow('secret-shape');
  expect(() => validateBody('bootstrap', 'res', { secret: '' })).toThrow('body-shape');
  expect(() => validateBody('bootstrap', 'req', { secret: secret.toString('base64url') })).not.toThrow();
});
it('base64url round trip rejects padding invalid alphabet and noncanonical pad bits', () => {
  const value = secret.toString('base64url');
  expect(decodeBase64url(value, 32, 'secret-shape')).toEqual(secret);
  for (const bad of [value + '=', '!' + value, value.slice(0, -1) + '9']) {
    expect(() => decodeBase64url(bad, 32, 'secret-shape')).toThrow('secret-shape');
  }
  expect(() => encodeBase64url(Buffer.alloc(1), 32, 'secret-shape')).toThrow('secret-shape');
});
it('key import accepts only byte-identical Ed25519 SPKI', () => {
  expect(importAnnouncedKey(fields.publicKeyDer).asymmetricKeyType).toBe('ed25519');
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'der' });
  expect(() => importAnnouncedKey(rsa)).toThrow('key-shape');
  expect(() => importAnnouncedKey(Buffer.from([0]))).toThrow('key-shape');
});
it('raw MAC and secret shape guards return only closed errors', () => {
  expect(() => verifyHelloMac(secret, fields, Buffer.alloc(0))).toThrow('mac-shape');
  expect(() => computeHelloMac(Buffer.alloc(0), fields)).toThrow('secret-shape');
  expect(() => computeHelloMac(secret, { ...fields, challenge: Buffer.alloc(0) })).toThrow('challenge-shape');
  expect(() => verifyHelloMac(secret, fields, Buffer.alloc(32))).toThrow('mac-invalid');
});

const registration = { epoch: hello.epoch, fixtureId: hello.fixtureId, scenarioId: 'scenario', runId: 'run-A',
  nonce: 'nonce', canaryId: 'canary', canary: 'synthetic' };
const operation = { epoch: hello.epoch, fixtureId: hello.fixtureId, runId: 'run-A', capability: secret.toString('base64url') };
it.each([
  ['run slash', { runId: 'a/b' }], ['run unicode', { runId: 'é' }], ['run too long', { runId: 'a'.repeat(129) }],
  ['run trailing LF', { runId: 'a\n' }], ['epoch trailing LF', { epoch: hello.epoch + '\n' }],
  ['empty scalar', { nonce: '' }], ['lone high surrogate', { nonce: '\ud800' }],
  ['lone low surrogate', { canary: '\udc00' }], ['scalar byte limit', { canary: 'é'.repeat(2049) }],
  ['scenario byte limit', { scenarioId: 'é'.repeat(65) }], ['canary id byte limit', { canaryId: 'a'.repeat(129) }],
  ['extra setup', { extra: 'x' }],
])('registration rejects %s', (_name, change) => {
  expect(() => validateBody('register', 'req', { ...registration, ...change })).toThrow('body-shape');
});
it('registration accepts exact byte limits and scalar Unicode pairs', () => {
  expect(() => validateBody('register', 'req', { ...registration, nonce: '😀'.repeat(1024),
    scenarioId: 'é'.repeat(64), canaryId: 'a'.repeat(128), runId: 'A'.repeat(128) })).not.toThrow();
});
it.each(['01', '-1', '1.0', '1e0', '1\n', '1\r', ' 1', '8388609', '9'.repeat(50)])('capture refuses noncanonical/out-of-bound offset %j', (offset) => {
  expect(() => validateBody('capture', 'req', { ...operation, kind: 'requests', offset })).toThrow('body-shape');
});
it('capture kind is closed and event bytes are canonical and bounded', () => {
  expect(() => validateBody('capture', 'req', { ...operation, kind: '../requests', offset: '0' })).toThrow('body-shape');
  expect(() => validateBody('attest', 'req', { ...operation, events: Buffer.alloc(1048576).toString('base64url') })).not.toThrow();
  expect(() => validateBody('attest', 'req', { ...operation, events: Buffer.alloc(1048577).toString('base64url') })).toThrow('control-limit');
  expect(() => validateBody('attest', 'req', { ...operation, events: 'AA==' })).toThrow('body-shape');
});
it.each([
  { bytes: '', total: '1', next: '0' }, { bytes: 'AA', total: '0', next: '1' },
  { bytes: 'AA', total: '01', next: '1' }, { bytes: 'AA', total: '1', next: '1\n' },
  { bytes: 'AA==', total: '1', next: '1' },
  { bytes: Buffer.alloc(65537).toString('base64url'), total: '65537', next: '65537' },
  { bytes: '', total: '8388609', next: '8388609' },
])('capture response rejects invalid bounded chunk %#', (body) => {
  expect(() => validateBody('capture', 'res', body)).toThrow('body-shape');
});
it('capture accepts empty snapshots and terminal rereads', () => {
  expect(() => validateBody('capture', 'res', { bytes: '', total: '0', next: '0' })).not.toThrow();
  expect(() => validateBody('capture', 'res', { bytes: '', total: '1', next: '1' })).not.toThrow();
});

vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createPublicKey: vi.fn(actual.createPublicKey) };
});

it.each(['receipt', 'attest'] as const)('AM12 %s artifact scalar UTF-8 boundary', op => {
  const field = op === 'receipt' ? 'receipt' : 'attestation';
  const exact = 'é'.repeat(131072);
  expect(Buffer.byteLength(exact)).toBe(262144);
  expect(() => validateBody(op, 'res', { [field]: exact })).not.toThrow();
  expect(() => validateBody(op, 'res', { [field]: exact + 'a' })).toThrow('body-shape');
});

it.each(['key', 'hello'] as const)('AM12 %s key rejects before decode and key import', op => {
  const body = (key: string) => op === 'hello' ? { publicKey: key, mac: response.mac } : { publicKey: key };
  expect(fields.publicKeyDer.length).toBe(44); expect(publicKey.length).toBe(59);
  expect(() => validateBody(op, 'res', body(publicKey))).not.toThrow();
  // Both 60-character vectors (including the encoding of 45 bytes) exercise encoded length,
  // along with the widened-frame exposure vector; they cannot isolate decoded-size equality.
  const badKeys = ['A'.repeat(1572864), publicKey + 'A',
    Buffer.concat([fields.publicKeyDer, Buffer.from([0])]).toString('base64url')];
  for (const key of badKeys) {
    const from = vi.spyOn(Buffer, 'from'); vi.mocked(createPublicKey).mockClear();
    let failure: unknown;
    try { validateBody(op, 'res', body(key)); } catch (error) { failure = error; }
    const decoded = from.mock.calls.some(args => args[0] === key && (args as unknown[])[1] === 'base64url');
    from.mockRestore();
    expect(decoded, 'oversized public key reached base64url decode').toBe(false);
    expect(createPublicKey).not.toHaveBeenCalled();
    expect(failure).toMatchObject({ code: 'key-shape' });
  }
  // The 58-character vector also exercises encoded length. Canonical 59-character base64url
  // necessarily decodes to 44 bytes, so the retained decoded equality has no independent killing vector.
  const short = 'A'.repeat(58); const shortFrom = vi.spyOn(Buffer, 'from'); vi.mocked(createPublicKey).mockClear();
  let shortFailure: unknown;
  try { validateBody(op, 'res', body(short)); } catch (error) { shortFailure = error; }
  const shortDecoded = shortFrom.mock.calls.some(args => args[0] === short && (args as unknown[])[1] === 'base64url');
  shortFrom.mockRestore();
  // Short direction: rejected by the encoded-length check before decode (kills a `!==` → `>` operator mutant).
  expect(shortDecoded, 'short public key reached base64url decode').toBe(false);
  expect(createPublicKey).not.toHaveBeenCalled();
  expect(shortFailure).toMatchObject({ code: 'key-shape' });
});

it('AM12 capture encoded boundary rejects before decode', () => {
  const exact = Buffer.alloc(65536).toString('base64url');
  expect(exact.length).toBe(87382);
  expect(() => validateBody('capture', 'res', { bytes: exact, total: '65536', next: '65536' })).not.toThrow();
  for (const bytes of [exact + 'A', Buffer.alloc(65537).toString('base64url')]) {
    const from = vi.spyOn(Buffer, 'from'); let failure: unknown;
    try { validateBody('capture', 'res', { bytes, total: '65537', next: '65537' }); } catch (error) { failure = error; }
    const decoded = from.mock.calls.some(args => args[0] === bytes && (args as unknown[])[1] === 'base64url');
    from.mockRestore();
    expect(decoded, 'oversized capture reached base64url decode').toBe(false);
    expect(failure).toMatchObject({ code: 'body-shape' });
  }
});

it('AM12 attest request encoded boundary and precedence reject before decode', () => {
  const exact = Buffer.alloc(1048576).toString('base64url');
  expect(exact.length).toBe(1398102);
  expect(() => validateBody('attest', 'req', { ...operation, events: exact })).not.toThrow();
  for (const events of [exact + 'A', Buffer.alloc(1048577).toString('base64url'), '!'.repeat(1398103)]) {
    const from = vi.spyOn(Buffer, 'from'); let failure: unknown;
    try { validateBody('attest', 'req', { ...operation, events }); } catch (error) { failure = error; }
    const decoded = from.mock.calls.some(args => args[0] === events && (args as unknown[])[1] === 'base64url');
    from.mockRestore();
    expect(decoded, 'oversized events reached base64url decode').toBe(false);
    expect(failure).toMatchObject({ code: 'control-limit' });
  }
  expect(() => validateBody('attest', 'req', { ...operation, events: '!' })).toThrow('body-shape');
});


const registeredCapabilities = Object.fromEntries(CAPABILITY_OPS.map((op, index) =>
  [op, Buffer.alloc(32, index + 1).toString('base64url')]));
const fixedSizeSites: { site: string; op: BridgeOp; kind: 'req' | 'res'; field: string;
  body: Record<string, string>; code: BridgeCode }[] = [
  { site: 'bootstrap secret', op: 'bootstrap', kind: 'req', field: 'secret',
    body: { secret: secret.toString('base64url') }, code: 'secret-shape' },
  ...CAPABILITY_OPS.map(op => ({ site: `${op} request capability`, op, kind: 'req' as const, field: 'capability',
    body: { ...operation, ...(op === 'capture' ? { kind: 'requests', offset: '0' } : {}),
      ...(op === 'attest' ? { events: '' } : {}) }, code: 'capability-refused' as const })),
  ...CAPABILITY_OPS.map(field => ({ site: `register response ${field}`, op: 'register' as const,
    kind: 'res' as const, field, body: registeredCapabilities, code: 'capability-refused' as const })),
  { site: 'hello challenge', op: 'hello', kind: 'req', field: 'challenge', body: hello, code: 'challenge-shape' },
  { site: 'hello MAC', op: 'hello', kind: 'res', field: 'mac', body: response, code: 'mac-shape' },
];
it.each(fixedSizeSites.flatMap(site => [44, 1572864].map(length => ({ ...site, length }))))(
  'AM12 F1 $site rejects $length characters before fixed-size decode', ({ op, kind, field, body, code, length }) => {
    const exact = body[field]!;
    expect(exact.length).toBe(43); expect(Buffer.from(exact, 'base64url').length).toBe(32);
    expect(() => validateBody(op, kind, body)).not.toThrow();
    const value = length === 44 ? exact + 'A' : 'A'.repeat(length);
    expect(value.length).toBe(length);
    const from = vi.spyOn(Buffer, 'from'); let failure: unknown; let decoded: boolean;
    try {
      try { validateBody(op, kind, { ...body, [field]: value }); } catch (error) { failure = error; }
      decoded = from.mock.calls.some(args => args[0] === value && (args as unknown[])[1] === 'base64url');
    } finally { from.mockRestore(); }
    expect(decoded, `${op} ${field} reached fixed-size base64url decode`).toBe(false);
    expect(failure).toMatchObject({ code });
  },
);

it('AM12 F2 hello epoch accepts 4096 and rejects excess before regex through validateBody', () => {
  const epoch = (bytes: number) => '1'.repeat(bytes - 33) + '-' + 'a'.repeat(32);
  const exact = epoch(4096);
  expect(Buffer.byteLength(exact)).toBe(4096); expect(EPOCH_PATTERN.test(exact)).toBe(true);
  // Use the actual frame codec and body validator; the frame ceiling cannot mask this scalar bound.
  const validateHelloFrame = (value: string) => {
    const wire = encodeFrame({ v: 1, kind: 'req', id: 2, op: 'hello', body: { ...hello, epoch: value } });
    new FrameDecoder(frame => {
      if (frame.kind === 'req') validateBody(frame.op, frame.kind, frame.body);
    }, code => { throw new Error(code); }).feed(wire);
  };
  expect(() => validateHelloFrame(exact)).not.toThrow();
  for (const length of [4097, 300033]) {
    const value = epoch(length); expect(Buffer.byteLength(value)).toBe(length);
    const regex = vi.spyOn(EPOCH_PATTERN, 'test'); let failure: unknown; let tested: boolean;
    try {
      try { validateHelloFrame(value); } catch (error) { failure = error; }
      tested = regex.mock.calls.some(([input]) => input === value);
    } finally { regex.mockRestore(); }
    expect(tested, 'oversized hello epoch reached EPOCH_PATTERN.test').toBe(false);
    expect(failure).toMatchObject({ code: 'body-shape' });
  }
});
