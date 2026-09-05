// Fixed synthetic vectors prove the exact transcript binding; no vector establishes provenance.
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  buildHelloTranscript, computeHelloMac, decodeBase64url, encodeBase64url, importAnnouncedKey,
  validateBody, verifyHelloMac, type HelloFields,
} from './handshake';
import { HELLO_PREFIX } from './protocol';

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
