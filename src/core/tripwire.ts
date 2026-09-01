import {
  SECRET_TRANSFORM_NAMES,
  type SecretTransformName,
} from '../../testbed/checkers/leakScan';

export { SECRET_TRANSFORM_NAMES };
export type { SecretTransformName };

export const TRIPWIRE_INSPECTION_REFUSED_MESSAGE = 'Tripwire refused non-trusted evidence';

export type TripwireEvidence = Readonly<{
  provenance: 'trusted' | 'mixed';
  bytes: string;
}>;

export type TripwireDiagnostics = Readonly<{
  matched: boolean;
  transform: SecretTransformName | null;
  evidenceIndex: number | null;
}>;

export type TripwireVerdict = Readonly<{
  verdict: 'pass' | 'fail';
  diagnostics: TripwireDiagnostics;
}>;

const ALL_TRANSFORMS = new Set<SecretTransformName>(SECRET_TRANSFORM_NAMES);

/**
 * Pure control-plane detector. It preflights provenance before reading bytes, refuses mixed evidence,
 * and does not reassemble fragments across records. It exposes no callback or match-dependent hook.
 */
export function detectTripwire(
  evidence: readonly TripwireEvidence[],
  canary: string,
): TripwireVerdict {
  return detectTripwireWithTransforms(evidence, canary, ALL_TRANSFORMS);
}

/** Exported only so tests can name the exact deletion mutation for every canonical transform. */
export function detectTripwireWithTransforms(
  evidence: readonly TripwireEvidence[],
  canary: string,
  enabled: ReadonlySet<SecretTransformName>,
): TripwireVerdict {
  if (canary.length === 0 || evidence.some((item) => item.provenance !== 'trusted')) {
    throw new Error(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
  }

  for (let evidenceIndex = 0; evidenceIndex < evidence.length; evidenceIndex += 1) {
    const bytes = evidence[evidenceIndex].bytes;
    for (const transform of SECRET_TRANSFORM_NAMES) {
      if (enabled.has(transform) && matchesTransform(bytes, canary, transform)) {
        return verdict('fail', true, transform, evidenceIndex);
      }
    }
  }
  return verdict('pass', false, null, null);
}

function matchesTransform(bytes: string, canary: string, transform: SecretTransformName): boolean {
  const encoded = encodedTransforms(canary);
  switch (transform) {
    case 'raw': return bytes.includes(canary);
    case 'base64': return bytes.includes(encoded.base64);
    case 'base64url-unpadded': return unpaddedBase64urlPresent(bytes, encoded.base64url);
    case 'base32': return bytes.includes(encoded.base32);
    case 'hex': return bytes.toLowerCase().includes(encoded.hex);
    case 'percent': return decodedPercentContains(bytes, canary);
    case 'json-escape': return decodedJsonEscapeContains(bytes, canary);
    case 'reversed': return bytes.includes(encoded.reversed);
    case 'whitespace-split': return /\s/u.test(bytes) && bytes.replace(/\s+/gu, '').includes(canary);
  }
}

function encodedTransforms(canary: string): {
  base64: string; base64url: string; base32: string; hex: string; reversed: string;
} {
  const bytes = Buffer.from(canary, 'utf8');
  return {
    base64: bytes.toString('base64'),
    base64url: bytes.toString('base64url'),
    base32: base32Encode(bytes),
    hex: bytes.toString('hex'),
    reversed: [...canary].reverse().join(''),
  };
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) encoded += alphabet[(buffer << (5 - bits)) & 31];
  return encoded;
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

function verdict(
  result: 'pass' | 'fail',
  matched: boolean,
  transform: SecretTransformName | null,
  evidenceIndex: number | null,
): TripwireVerdict {
  return Object.freeze({
    verdict: result,
    diagnostics: Object.freeze({ matched, transform, evidenceIndex }),
  });
}
