import { deflateRawSync, deflateSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { decodeEvidence, EVIDENCE_DECODER_NAMES } from './leakDecoders';

const canary = 'TVC_decoder_run-1_A234567BCDEF';

function hasCandidate(decoder: string, text: string): boolean {
  return decodeEvidence(text, canary)
    .some((candidate) => candidate.decoder === decoder && candidate.text.includes(canary));
}

describe('evidence decoders', () => {
  it('keeps the decoder inventory finite, ordered, deduplicated, and capped', () => {
    // Mutant killed: remove the shared 64-candidate stop or text deduplication.
    expect(EVIDENCE_DECODER_NAMES).toEqual([
      'base64-run', 'utf16', 'charcode-array', 'html-entities',
      'rot13', 'separators', 'inflate',
    ]);
    const noisyRuns = Array.from({ length: 100 }, (_, index) =>
      Buffer.from(`ordinary-candidate-${index.toString().padStart(3, '0')}`).toString('base64'))
      .join('.');
    const candidates = decodeEvidence(noisyRuns, canary);
    expect(candidates.length).toBeLessThanOrEqual(64);
    expect(new Set(candidates.map((candidate) => candidate.text)).size).toBe(candidates.length);
  });

  it('decodes UTF-16LE and UTF-16BE only from interleaved-NUL runs', () => {
    // Mutant killed: retain only one endian branch or scan UTF-16 bytes as UTF-8 text.
    const littleEndian = Buffer.from(canary, 'utf16le');
    const bigEndian = Buffer.alloc(littleEndian.length);
    for (let index = 0; index < littleEndian.length; index += 2) {
      bigEndian[index] = littleEndian[index + 1];
      bigEndian[index + 1] = littleEndian[index];
    }
    expect(hasCandidate('utf16', littleEndian.toString('latin1'))).toBe(true);
    expect(hasCandidate('utf16', bigEndian.toString('latin1'))).toBe(true);
  });

  it('decodes JSON and bare decimal char-code sequences with at least eight bytes', () => {
    // Mutant killed: support JSON arrays but omit the bare comma/space sequence grammar.
    const values = [...Buffer.from(canary)];
    expect(hasCandidate('charcode-array', JSON.stringify(values))).toBe(true);
    expect(hasCandidate('charcode-array', values.join(','))).toBe(true);
    expect(hasCandidate('charcode-array', values.join(' '))).toBe(true);
    expect(decodeEvidence('84,86,67,95,97,98,99', canary)
      .some((candidate) => candidate.decoder === 'charcode-array')).toBe(false);
  });

  it('decodes decimal and hexadecimal numeric HTML entities', () => {
    // Mutant killed: recognize only decimal entities and miss the &#xHH; form.
    const encoded = [...canary].map((character, index) => index % 2 === 0
      ? `&#${character.charCodeAt(0)};`
      : `&#x${character.charCodeAt(0).toString(16)};`).join('');
    expect(hasCandidate('html-entities', encoded)).toBe(true);
  });

  it('applies ROT13 without changing digits, underscores, or hyphens', () => {
    // Mutant killed: omit ROT13 or rotate non-letter canary characters.
    const encoded = canary.replace(/[A-Za-z]/gu, (character) => {
      const base = character <= 'Z' ? 0x41 : 0x61;
      return String.fromCharCode(base + ((character.charCodeAt(0) - base + 13) % 26));
    });
    expect(hasCandidate('rot13', encoded)).toBe(true);
  });

  it('removes exactly one non-alphanumeric separator in linear time', () => {
    // Mutant killed: replace the fixed concatenation with a nested/backtracking separator regex.
    const separated = [...canary].join('#');
    const alphabet = 'TVCdecoderrun1A234567BCDEF';
    const prefixLength = 1024 * 1024 - separated.length;
    const body = alphabet.repeat(Math.ceil(prefixLength / alphabet.length)).slice(0, prefixLength)
      + separated;
    const started = performance.now();
    const candidates = decodeEvidence(body, canary);
    const elapsedMs = performance.now() - started;
    expect(candidates.some((candidate) => candidate.decoder === 'separators'
      && candidate.text.includes(canary))).toBe(true);
    expect(elapsedMs).toBeLessThan(200);
  });

  it('inflates gzip and zlib by magic and raw DEFLATE without a header', () => {
    // Mutant killed: select only header-bearing gzip/zlib and omit bounded inflateRawSync trial.
    const gzip = gzipSync(canary);
    const zlib = deflateSync(canary);
    const raw = deflateRawSync(canary);
    expect([...gzip.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(gzip[0] === 0x1f && gzip[1] === 0x8b).toBe(true);
    expect(zlib[0]).toBe(0x78);
    expect([0x01, 0x5e, 0x9c, 0xda]).toContain(zlib[1]);
    expect(raw[0] === 0x1f && raw[1] === 0x8b).toBe(false);
    expect(raw[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(raw[1] ?? -1)).toBe(false);
    for (const compressed of [gzip, zlib, raw]) {
      expect(hasCandidate('inflate', compressed.toString('latin1'))).toBe(true);
    }
  });

  it('inflates every base64-decoded binary candidate', () => {
    // Mutant killed: attempt decompression on raw evidence only, skipping base64-run buffers.
    const encoded = gzipSync(canary).toString('base64');
    expect(hasCandidate('inflate', encoded)).toBe(true);
  });

  it('UTF-16-decodes decompressed binary output', () => {
    // Mutant killed: feed UTF-16 only from raw/base64 bytes and omit inflated buffers.
    const compressed = gzipSync(Buffer.from(canary, 'utf16le')).toString('latin1');
    expect(hasCandidate('utf16', compressed)).toBe(true);
  });

  it('turns malformed compressed evidence and a 10 MiB bomb into no inflate candidate', () => {
    // Mutant killed: omit decompression catches or the 1 MiB maxOutputLength cap.
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
    // Mutant killed: remove any decoder boundary catch and expose its parser/decompressor exception.
    const garbage = '\u0000\u00ff%%%%====[999, nope &#x110000; not-a-stream';
    expect(() => decodeEvidence(garbage, canary)).not.toThrow();
  });
});
