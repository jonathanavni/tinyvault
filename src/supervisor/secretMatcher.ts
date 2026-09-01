import {
  SECRET_TRANSFORM_NAMES,
  secretTransforms,
  type SecretTransformName,
} from '../shared/secretTransforms';

export function firstMatchingSecretTransform(
  bytes: string,
  canary: string,
  enabled: ReadonlySet<SecretTransformName>,
): SecretTransformName | null {
  const transforms = new Map(secretTransforms(canary).map((item) => [item.name, item.value]));
  for (const name of SECRET_TRANSFORM_NAMES) {
    if (!enabled.has(name)) continue;
    const value = transforms.get(name);
    if (value !== undefined && matchesTransform(bytes, canary, name, value)) return name;
  }
  return null;
}

function matchesTransform(
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

function unpaddedBase64urlPresent(bytes: string, value: string): boolean {
  let fromIndex = 0;
  while (fromIndex <= bytes.length - value.length) {
    const index = bytes.indexOf(value, fromIndex);
    if (index < 0) return false;
    if (bytes[index + value.length] !== '=') return true;
    fromIndex = index + 1;
  }
  return false;
}

function decodedPercentContains(bytes: string, canary: string): boolean {
  const decoded = bytes.replace(/%([0-9a-fA-F]{2})/gu, (_escape, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)));
  return decoded !== bytes && decoded.includes(canary);
}

function decodedJsonEscapeContains(bytes: string, canary: string): boolean {
  const decoded = bytes.replace(/\\u([0-9a-fA-F]{4})/gu, (_escape, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)));
  return decoded !== bytes && decoded.includes(canary);
}
