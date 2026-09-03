import { readFileSync } from 'node:fs';
import { deflateRawSync, deflateSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  decodeEvidence,
  EVIDENCE_DECODER_LIMITS,
  EVIDENCE_DECODER_NAMES,
} from './leakDecoders';

const canary = 'TVC_decoder_run-1_A234567BCDEF';

function hasCandidate(decoder: string, text: string): boolean {
  return decodeEvidence(text, canary)
    .some((candidate) => candidate.decoder === decoder && candidate.text.includes(canary));
}

describe('evidence decoders', () => {
  it('has no candidate-count or candidate-storage cap on detection work', () => {
    expect(EVIDENCE_DECODER_NAMES).toEqual([
      'base64-run', 'utf16', 'charcode-array', 'html-entities',
      'rot13', 'separators', 'inflate',
    ]);
    expect(EVIDENCE_DECODER_LIMITS).toMatchObject({
      graphDepth: 3, decodedBytesPerValue: 8 * 1024 * 1024,
      eventWallClockMs: 100, inflateTrialsPerScan: 512,
    });
    const noisyRuns = Array.from({ length: 100 }, (_, index) =>
      Buffer.from(`ordinary-candidate-${index.toString().padStart(3, '0')}`).toString('base64'))
      .join('.');
    const candidates = decodeEvidence(noisyRuns, canary);
    const base64Candidates = candidates.filter((candidate) => candidate.decoder === 'base64-run');
    for (let index = 0; index < 100; index += 1) {
      expect(base64Candidates.some((candidate) => candidate.text
        .includes(`ordinary-candidate-${index.toString().padStart(3, '0')}`))).toBe(true);
    }
    expect(new Set(candidates.map((candidate) => `${candidate.decoder}:${candidate.text}`)).size)
      .toBe(candidates.length);
    const source = readFileSync(new URL('./leakDecoders.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/candidatesPerDecoder|candidateTextBytes|MAX_(?:EVENT_)?DECODED_CANDIDATES/u);
  });

  it('decodes UTF-16LE and UTF-16BE only from interleaved-NUL runs', () => {
    const littleEndian = Buffer.from(canary, 'utf16le');
    const bigEndian = Buffer.alloc(littleEndian.length);
    for (let index = 0; index < littleEndian.length; index += 2) {
      bigEndian[index] = littleEndian[index + 1];
      bigEndian[index + 1] = littleEndian[index];
    }
    expect(hasCandidate('utf16', littleEndian.toString('latin1'))).toBe(true);
    expect(hasCandidate('utf16', bigEndian.toString('latin1'))).toBe(true);
    expect(hasCandidate('utf16', littleEndian.subarray(0, -1).toString('latin1'))).toBe(true);
  });

  it('decodes JSON and comma, space, semicolon, or newline char-code sequences', () => {
    const values = [...Buffer.from(canary)];
    for (const encoded of [
      JSON.stringify(values), values.join(','), values.join(' '),
      values.join(';'), values.join('\n'),
    ]) {
      expect(hasCandidate('charcode-array', encoded)).toBe(true);
    }
    expect(decodeEvidence('84,86,67,95,97,98,99', canary)
      .some((candidate) => candidate.decoder === 'charcode-array')).toBe(false);
  });

  it('decodes decimal and hexadecimal numeric HTML entities', () => {
    const encoded = [...canary].map((character, index) => index % 2 === 0
      ? `&#${character.charCodeAt(0)};`
      : `&#x${character.charCodeAt(0).toString(16)};`).join('');
    expect(hasCandidate('html-entities', encoded)).toBe(true);
  });

  it('applies ROT13 without changing digits, underscores, or hyphens', () => {
    const encoded = canary.replace(/[A-Za-z]/gu, (character) => {
      const base = character <= 'Z' ? 0x41 : 0x61;
      return String.fromCharCode(base + ((character.charCodeAt(0) - base + 13) % 26));
    });
    expect(hasCandidate('rot13', encoded)).toBe(true);
  });

  it('accepts exactly one non-whitespace Unicode code point as a separator', () => {
    for (const separator of ['#', '\u0000', '\u0001', '\u0008', '\u001f', '\u007f', '💥', 'x']) {
      expect(hasCandidate('separators', [...canary].join(separator))).toBe(true);
    }
    expect(hasCandidate('separators', [...canary].join(' '))).toBe(false);
    expect(hasCandidate('separators', [...canary].join('##'))).toBe(false);
    const source = readFileSync(new URL('./leakDecoders.ts', import.meta.url), 'utf8');
    const matcher = source.slice(
      source.indexOf('function containsSeparatedCanary'),
      source.indexOf('function* inflateOutputs'),
    );
    expect(matcher).not.toMatch(/\[[^\]]+\](?:[+*?]|\{)/u);
  });

  it.each([9, 10, 11, 12, 13, 14, 15])(
    'recognizes a valid zlib header at windowBits %s',
    (windowBits) => {
      const compressed = deflateSync(canary, { windowBits });
      expect(((compressed[0] * 256 + compressed[1]) % 31)).toBe(0);
      expect(hasCandidate('inflate', compressed.toString('latin1'))).toBe(true);
    },
  );

  it('inflates gzip by magic and raw DEFLATE from decoded binary', () => {
    const gzip = gzipSync(canary);
    const raw = deflateRawSync(canary);
    expect(hasCandidate('inflate', gzip.toString('latin1'))).toBe(true);
    expect(hasCandidate('inflate', raw.toString('base64'))).toBe(true);
  });

  it('finds gzip and zlib streams within the first 64 KiB of a value', () => {
    for (const compressed of [gzipSync(canary), deflateSync(canary, { windowBits: 11 })]) {
      expect(hasCandidate('inflate', `ordinary-prefix:${compressed.toString('latin1')}`)).toBe(true);
    }
  });

  it('inflates every base64-decoded binary candidate', () => {
    expect(hasCandidate('inflate', gzipSync(canary).toString('base64'))).toBe(true);
  });

  it('UTF-16-decodes decompressed binary output', () => {
    const compressed = gzipSync(Buffer.from(canary, 'utf16le')).toString('latin1');
    expect(hasCandidate('utf16', compressed)).toBe(true);
  });

  it('enforces the 1 MiB inflate cap and rejects a 10 MiB output', () => {
    expect(EVIDENCE_DECODER_LIMITS.inflatedBytes).toBeLessThanOrEqual(1024 * 1024);
    const malformed = Buffer.from([0x1f, 0x8b, 0x00, 0xff, 0x78, 0x9c]).toString('latin1');
    expect(() => decodeEvidence(malformed, canary)).not.toThrow();
    expect(decodeEvidence(malformed, canary)
      .some((candidate) => candidate.decoder === 'inflate')).toBe(false);

    const bomb = gzipSync('A'.repeat(10 * 1024 * 1024)).toString('latin1');
    expect(() => decodeEvidence(bomb, canary)).not.toThrow();
    expect(decodeEvidence(bomb, canary)
      .some((candidate) => candidate.decoder === 'inflate')).toBe(false);
  });

  it('never throws on arbitrary malformed decoder input', () => {
    const garbage = '\u0000\u00ff%%%%====[999, nope &#x110000; not-a-stream';
    expect(() => decodeEvidence(garbage, canary)).not.toThrow();
  });
});
