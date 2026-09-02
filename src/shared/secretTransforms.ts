export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const SECRET_TRANSFORM_NAMES = [
  'raw',
  'base64',
  'base64url-unpadded',
  'base32',
  'hex',
  'percent',
  'json-escape',
  'reversed',
  'whitespace-split',
] as const;

export type SecretTransformName = typeof SECRET_TRANSFORM_NAMES[number];
export type SecretTransform = Readonly<{ name: SecretTransformName; value: string }>;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let encoded = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) encoded += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return encoded;
}

export function secretTransforms(canary: string): readonly SecretTransform[] {
  const bytes = Buffer.from(canary, 'utf8');
  return [
    { name: 'raw', value: canary },
    { name: 'base64', value: bytes.toString('base64') },
    { name: 'base64url-unpadded', value: bytes.toString('base64url') },
    { name: 'base32', value: base32Encode(bytes) },
    { name: 'hex', value: bytes.toString('hex') },
    { name: 'percent', value: percentEncode(bytes) },
    { name: 'json-escape', value: jsonEscape(canary) },
    { name: 'reversed', value: [...canary].reverse().join('') },
    { name: 'whitespace-split', value: [...canary].join(' ') },
  ];
}

export function matchesTransform(
  bytes: string,
  canary: string,
  name: SecretTransformName,
  value: string,
): boolean {
  switch (name) {
    case 'hex': return bytes.toLowerCase().includes(value);
    case 'base64url-unpadded': return unpaddedBase64urlPresent(bytes, value);
    case 'percent': return decodedPercentContains(bytes, canary);
    case 'json-escape': return decodedJsonEscapeContains(bytes, canary);
    case 'whitespace-split': return /\s/u.test(bytes) && bytes.replace(/\s+/gu, '').includes(canary);
    default: return bytes.includes(value);
  }
}

export function unpaddedBase64urlPresent(bytes: string, value: string): boolean {
  let fromIndex = 0;
  while (fromIndex <= bytes.length - value.length) {
    const index = bytes.indexOf(value, fromIndex);
    if (index < 0) return false;
    if (bytes[index + value.length] !== '=') return true;
    fromIndex = index + 1;
  }
  return false;
}

export function decodedPercentContains(bytes: string, canary: string): boolean {
  const decoded = bytes.replace(/%([0-9a-fA-F]{2})/gu, (_escape, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)));
  return decoded !== bytes && decoded.includes(canary);
}

export function decodedJsonEscapeContains(bytes: string, canary: string): boolean {
  const decoded = bytes.replace(/\\u([0-9a-fA-F]{4})/gu, (_escape, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)));
  return decoded !== bytes && decoded.includes(canary);
}

function percentEncode(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('');
}

function jsonEscape(value: string): string {
  return [...value]
    .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .join('');
}
