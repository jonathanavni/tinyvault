import { gunzipSync, inflateRawSync, inflateSync } from 'node:zlib';

export const EVIDENCE_DECODER_NAMES = [
  'base64-run',
  'utf16',
  'charcode-array',
  'html-entities',
  'rot13',
  'separators',
  'inflate',
] as const;

export type EvidenceDecoderName = typeof EVIDENCE_DECODER_NAMES[number];

export type DecodedCandidate = Readonly<{
  decoder: EvidenceDecoderName;
  text: string;
}>;

const MAX_BASE64_DEPTH = 3;
const MAX_CANDIDATES = 64;
const MAX_INFLATED_BYTES = 1024 * 1024;
const MIN_BASE64_RUN = 16;
const MIN_CHARCODE_SEQUENCE = 8;

type BinaryCandidate = Readonly<{ bytes: Buffer; depth: number }>;

/**
 * Expands one evidence value through a finite decoder inventory. Base64 recursion stops
 * after three decodes and the shared collector stops after 64 unique texts per value.
 * Every decoder is isolated because malformed hostile evidence must never escape here.
 */
export function decodeEvidence(bytes: string, canary?: string): readonly DecodedCandidate[] {
  const candidates: DecodedCandidate[] = [];
  const seenTexts = new Set<string>();
  const seenBinary = new Set<string>();
  const binaryCandidates: BinaryCandidate[] = [];

  const addText = (decoder: EvidenceDecoderName, text: string): void => {
    if (candidates.length >= MAX_CANDIDATES || text === bytes || seenTexts.has(text)) return;
    seenTexts.add(text);
    candidates.push({ decoder, text });
  };

  safely(() => {
    const queue: BinaryCandidate[] = [{ bytes: Buffer.from(bytes, 'latin1'), depth: 0 }];
    let cursor = 0;
    while (cursor < queue.length && candidates.length < MAX_CANDIDATES) {
      const current = queue[cursor++];
      if (current.depth >= MAX_BASE64_DEPTH) continue;
      const source = current.depth === 0
        ? bytes
        : current.bytes.toString('utf8');
      for (const run of base64Runs(source)) {
        for (let offset = 0; offset <= 2; offset += 1) {
          const decoded = decodeBase64(run.slice(offset));
          if (decoded === null) continue;
          const binaryKey = decoded.toString('latin1');
          if (seenBinary.has(binaryKey)) continue;
          seenBinary.add(binaryKey);
          if (binaryCandidates.length >= MAX_CANDIDATES) return;
          const next = { bytes: decoded, depth: current.depth + 1 };
          binaryCandidates.push(next);
          queue.push(next);
          addBufferTexts('base64-run', decoded, addText);
          if (candidates.length >= MAX_CANDIDATES) return;
        }
      }
    }
  });

  safely(() => {
    for (const source of [Buffer.from(bytes, 'latin1'), ...binaryCandidates.map((item) => item.bytes)]) {
      for (const decoded of decodeUtf16Runs(source)) addText('utf16', decoded);
      if (candidates.length >= MAX_CANDIDATES) return;
    }
  });

  safely(() => {
    for (const decoded of decodeCharcodeSequences(bytes)) addText('charcode-array', decoded);
  });

  safely(() => {
    const decoded = decodeNumericHtmlEntities(bytes);
    if (decoded !== bytes) addText('html-entities', decoded);
  });

  safely(() => addText('rot13', rot13(bytes)));

  safely(() => {
    if (!canary || canary.length < 2) return;
    const decoded = removeCanarySeparators(bytes, canary);
    if (decoded !== bytes) addText('separators', decoded);
  });

  safely(() => {
    const sources = [Buffer.from(bytes, 'latin1'), ...binaryCandidates.map((item) => item.bytes)];
    for (const source of sources) {
      for (const inflated of inflateEvidence(source)) {
        addBufferTexts('inflate', inflated, addText);
        for (const decoded of decodeUtf16Runs(inflated)) addText('utf16', decoded);
      }
      if (candidates.length >= MAX_CANDIDATES) return;
    }
  });

  return candidates;
}

function safely(operation: () => void): void {
  try {
    operation();
  } catch {
    // Evidence is hostile input. One decoder's malformed case cannot fail the checker.
  }
}

function addBufferTexts(
  decoder: EvidenceDecoderName,
  bytes: Buffer,
  add: (decoder: EvidenceDecoderName, text: string) => void,
): void {
  add(decoder, bytes.toString('utf8'));
  add(decoder, bytes.toString('latin1'));
}

function base64Runs(text: string): string[] {
  const runs: string[] = [];
  let index = 0;
  while (index < text.length) {
    if (!isBase64Character(text.charCodeAt(index))) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < text.length) {
      const code = text.charCodeAt(end);
      if (isBase64Character(code)) {
        end += 1;
        continue;
      }
      if (!isWhitespace(code)) break;
      let next = end + 1;
      while (next < text.length && isWhitespace(text.charCodeAt(next))) next += 1;
      if (next >= text.length || !isBase64Character(text.charCodeAt(next))) break;
      end = next;
    }
    const run = text.slice(index, end).replace(/\s/gu, '');
    if (run.length >= MIN_BASE64_RUN) runs.push(run);
    index = Math.max(end, index + 1);
  }
  return runs;
}

function isBase64Character(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || (code >= 0x30 && code <= 0x39)
    || code === 0x2b || code === 0x2f || code === 0x3d || code === 0x5f || code === 0x2d;
}

function isWhitespace(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0b
    || code === 0x0c || code === 0x0d || code === 0x20;
}

function decodeBase64(value: string): Buffer | null {
  if (value.length < MIN_BASE64_RUN || value.length % 4 === 1
    || !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(value)) {
    return null;
  }
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const unpadded = normalized.replace(/=+$/u, '');
  const padding = '='.repeat((4 - (unpadded.length % 4)) % 4);
  return Buffer.from(unpadded + padding, 'base64');
}

function decodeUtf16Runs(bytes: Buffer): string[] {
  const decoded: string[] = [];
  for (const endian of ['le', 'be'] as const) {
    let index = 0;
    while (index + 1 < bytes.length) {
      const startsPair = endian === 'le'
        ? bytes[index] !== 0 && bytes[index + 1] === 0
        : bytes[index] === 0 && bytes[index + 1] !== 0;
      if (!startsPair) {
        index += 1;
        continue;
      }
      const start = index;
      while (index + 1 < bytes.length) {
        const pairMatches = endian === 'le'
          ? bytes[index] !== 0 && bytes[index + 1] === 0
          : bytes[index] === 0 && bytes[index + 1] !== 0;
        if (!pairMatches) break;
        index += 2;
      }
      if (index - start < 8) continue;
      const run = bytes.subarray(start, index);
      if (endian === 'le') {
        decoded.push(run.toString('utf16le'));
      } else {
        const swapped = Buffer.allocUnsafe(run.length);
        for (let offset = 0; offset < run.length; offset += 2) {
          swapped[offset] = run[offset + 1];
          swapped[offset + 1] = run[offset];
        }
        decoded.push(swapped.toString('utf16le'));
      }
    }
  }
  return decoded;
}

function decodeCharcodeSequences(text: string): string[] {
  const decoded: string[] = [];
  const pattern = /(?:^|[^0-9])((?:[0-9]{1,3}(?:\s*,\s*|\s+)){7,}[0-9]{1,3})(?![0-9])/gu;
  for (const match of text.matchAll(pattern)) {
    const values = match[1].split(/\s*,\s*|\s+/u).map((value) => Number.parseInt(value, 10));
    if (values.every((value) => value >= 0 && value <= 255)) {
      decoded.push(Buffer.from(values).toString('utf8'));
    }
  }
  return decoded;
}

function decodeNumericHtmlEntities(text: string): string {
  // Named entities are unnecessary for the canary alphabet [A-Z0-9_a-z].
  return text.replace(/&#(?:([0-9]+)|[xX]([0-9a-fA-F]+));/gu,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      const value = Number.parseInt(decimal ?? hexadecimal ?? '', decimal === undefined ? 16 : 10);
      return Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : entity;
    });
}

function rot13(text: string): string {
  return text.replace(/[A-Za-z]/gu, (character) => {
    const base = character <= 'Z' ? 0x41 : 0x61;
    return String.fromCharCode(base + ((character.charCodeAt(0) - base + 13) % 26));
  });
}

function removeCanarySeparators(text: string, canary: string): string {
  const pattern = [...canary]
    .map((character) => escapeRegExp(character))
    .join('[^A-Za-z0-9]');
  // This fixed alternation of literals and one-character classes has no variable quantifier
  // or choice point, so matching remains linear in the evidence length.
  return text.replace(new RegExp(pattern, 'gu'), canary);
}

function escapeRegExp(character: string): string {
  return character.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

function inflateEvidence(bytes: Buffer): Buffer[] {
  const inflated: Buffer[] = [];
  const options = { maxOutputLength: MAX_INFLATED_BYTES };
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    safely(() => inflated.push(gunzipSync(bytes, options)));
  }
  if (bytes[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(bytes[1] ?? -1)) {
    safely(() => inflated.push(inflateSync(bytes, options)));
  }
  // Raw DEFLATE has no header, so every raw/base64-decoded binary candidate gets one bounded trial.
  safely(() => inflated.push(inflateRawSync(bytes, options)));
  return inflated;
}
