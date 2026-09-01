import { describe, expect, it } from 'vitest';

import {
  encodeAdditionalData,
  INVALID_LOCAL_VAULT_MESSAGE,
  validateLocalVaultFile,
} from './localFileFormat';

const handle = 'vh_0123456789abcdef0123456789abcdef';

function validFile(): Record<string, unknown> {
  return {
    version: 1,
    records: [{
      handle,
      label: 'Example',
      kind: 'password',
      account: 'person@example.com',
      canonicalOrigin: 'https://example.com',
      fieldRecipe: ['username', 'password'],
      sealed: {
        nonce: Buffer.alloc(24, 1).toString('base64'),
        ciphertext: Buffer.alloc(16, 2).toString('base64'),
      },
    }],
  };
}

describe('local vault format', () => {
  it.each([
    [
      'vh_00000000000000000000000000000000',
      'https://example.com',
      ['username', 'password'] as const,
      '5b2276685f3030303030303030303030303030303030303030303030303030303030303030222c2268747470733a2f2f6578616d706c652e636f6d222c5b22757365726e616d65222c2270617373776f7264225d5d',
    ],
    [
      handle,
      'http://localhost:8080',
      ['password'] as const,
      '5b2276685f3031323334353637383961626364656630313233343536373839616263646566222c22687474703a2f2f6c6f63616c686f73743a38303830222c5b2270617373776f7264225d5d',
    ],
    [
      'vh_ffffffffffffffffffffffffffffffff',
      'https://login.example',
      ['totp', 'password'] as const,
      '5b2276685f6666666666666666666666666666666666666666666666666666666666666666222c2268747470733a2f2f6c6f67696e2e6578616d706c65222c5b22746f7470222c2270617373776f7264225d5d',
    ],
  ])('kills writer/reader AD divergence for golden vector %#', (itemHandle, origin, roles, hex) => {
    // Mutation killed: changing array order, field order, JSON encoding, or canonical-origin bytes.
    expect(Buffer.from(encodeAdditionalData(itemHandle, {
      canonicalOrigin: origin,
      fieldRecipe: roles,
    })).toString('hex')).toBe(hex);
  });

  it('kills blanket rejection by accepting legitimate version-1 traffic', () => {
    // Mutation killed: a validator that rejects every file passes all negative-only cases.
    expect(validateLocalVaultFile(validFile())).toMatchObject({ version: 1 });
  });

  const invalidCases: ReadonlyArray<readonly [string, (file: Record<string, any>) => void]> = [
    ['unknown version', (file) => { file.version = 2; }],
    ['non-array records', (file) => { file.records = {}; }],
    ['top-level extra key', (file) => { file.extra = true; }],
    ['record extra key', (file) => { file.records[0].extra = true; }],
    ['sealed extra key', (file) => { file.records[0].sealed.extra = true; }],
    ['missing label', (file) => { delete file.records[0].label; }],
    ['non-string label', (file) => { file.records[0].label = 7; }],
    ['non-string account', (file) => { file.records[0].account = 7; }],
    ['wrong kind', (file) => { file.records[0].kind = 'totp'; }],
    ['missing recipe', (file) => { delete file.records[0].fieldRecipe; }],
    ['non-array recipe', (file) => { file.records[0].fieldRecipe = 'password'; }],
    ['empty recipe', (file) => { file.records[0].fieldRecipe = []; }],
    ['duplicate recipe role', (file) => { file.records[0].fieldRecipe = ['password', 'password']; }],
    ['unknown recipe role', (file) => { file.records[0].fieldRecipe = ['secret']; }],
    ['duplicate handle', (file) => { file.records.push({ ...file.records[0] }); }],
    ['malformed handle', (file) => { file.records[0].handle = 'vh_ABC'; }],
    ['unpadded base64', (file) => { file.records[0].sealed.ciphertext = 'AQEBAQEBAQEBAQEBAQEBAQ'; }],
    ['URL base64 alphabet', (file) => { file.records[0].sealed.ciphertext = '_____________________w=='; }],
    ['whitespace base64', (file) => { file.records[0].sealed.ciphertext += '\n'; }],
    ['wrong nonce length', (file) => { file.records[0].sealed.nonce = Buffer.alloc(23).toString('base64'); }],
    ['short ciphertext', (file) => { file.records[0].sealed.ciphertext = Buffer.alloc(15).toString('base64'); }],
    ['origin path', (file) => { file.records[0].canonicalOrigin = 'https://example.com/login'; }],
    ['origin trailing slash', (file) => { file.records[0].canonicalOrigin = 'https://example.com/'; }],
    ['origin ftp scheme', (file) => { file.records[0].canonicalOrigin = 'ftp://example.com'; }],
    ['origin whitespace', (file) => { file.records[0].canonicalOrigin = ' https://example.com'; }],
    ['non-normalized uppercase host', (file) => { file.records[0].canonicalOrigin = 'https://EXAMPLE.com'; }],
    ['non-normalized default port', (file) => { file.records[0].canonicalOrigin = 'https://example.com:443'; }],
    ['lookalike numeric host', (file) => { file.records[0].canonicalOrigin = 'https://0x7f000001'; }],
    ['lookalike fullwidth host', (file) => { file.records[0].canonicalOrigin = 'https://\uff45xample.com'; }],
  ];

  it.each(invalidCases)('kills trusting file shape: rejects %s', (_name, mutate) => {
    // Mutation killed: deleting the named validator branch admits attacker-controlled metadata or bytes.
    const file = validFile();
    mutate(file);
    expect(() => validateLocalVaultFile(file)).toThrow(INVALID_LOCAL_VAULT_MESSAGE);
  });
});
