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

export const EVIDENCE_DECODER_LIMITS = Object.freeze({
  graphDepth: 3,
  candidatesPerDecoder: 16,
  candidateTextBytes: 8 * 1024,
  inflatedBytes: 1024 * 1024,
  inflateScanBytes: 64 * 1024,
});

type DecodeEvidenceOptions = Readonly<{
  /** Meta-gate-only deletion seam. Production callers leave every decoder enabled. */
  disabled?: ReadonlySet<EvidenceDecoderName>;
}>;

type GraphNode = Readonly<{
  text: string;
  binary: Buffer;
  binaryIsDecoded: boolean;
  depth: number;
}>;

type DecoderOutput =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'binary'; bytes: Buffer }>;

const MIN_BASE64_RUN = 16;
const MIN_CHARCODE_SEQUENCE = 8;
const MAX_INFLATE_TRIALS = EVIDENCE_DECODER_LIMITS.candidatesPerDecoder;
const UNICODE_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

/**
 * Expands one evidence value through a finite graph. Every decoder receives the original
 * value and every reachable node; each decoder owns an independent output allowance.
 */
export function decodeEvidence(
  bytes: string,
  canary?: string,
  options: DecodeEvidenceOptions = {},
): readonly DecodedCandidate[] {
  const candidates: DecodedCandidate[] = [];
  const counts = new Map<EvidenceDecoderName, number>();
  const seenCandidates = new Map<EvidenceDecoderName, Set<string>>();
  const seenNodes = new Set<string>();
  const queue: GraphNode[] = [{
    text: bytes, binary: Buffer.from(bytes, 'utf8'), binaryIsDecoded: false, depth: 0,
  }];
  seenNodes.add(nodeKey(queue[0]));

  let cursor = 0;
  while (cursor < queue.length) {
    const node = queue[cursor++];
    if (node.depth >= EVIDENCE_DECODER_LIMITS.graphDepth) continue;
    const nextNodes: GraphNode[] = [];
    for (const decoder of EVIDENCE_DECODER_NAMES) {
      if (options.disabled?.has(decoder) || decoderBudgetFull(decoder, counts)) continue;
      const remaining = EVIDENCE_DECODER_LIMITS.candidatesPerDecoder
        - (counts.get(decoder) ?? 0);
      const outputs = safely(() => runDecoder(decoder, node, remaining, canary), []);
      for (const output of outputs) {
        if (decoderBudgetFull(decoder, counts)) break;
        if (output.kind === 'binary') {
          addBinaryOutput(decoder, output.bytes, node.depth, canary, {
            candidates, counts, seenCandidates, seenNodes, nextNodes,
          });
        } else {
          addTextOutput(decoder, output.text, node.depth, canary, {
            candidates, counts, seenCandidates, seenNodes, nextNodes,
          });
        }
      }
    }
    // Depth-first insertion preserves useful nested chains without letting sibling noise consume
    // a decoder's allowance before the next layer of the same bounded composition.
    if (nextNodes.length > 0) queue.splice(cursor, 0, ...nextNodes);
  }
  return candidates;
}

type CollectorState = {
  candidates: DecodedCandidate[];
  counts: Map<EvidenceDecoderName, number>;
  seenCandidates: Map<EvidenceDecoderName, Set<string>>;
  seenNodes: Set<string>;
  nextNodes: GraphNode[];
};

function addBinaryOutput(
  decoder: EvidenceDecoderName,
  bytes: Buffer,
  parentDepth: number,
  canary: string | undefined,
  state: CollectorState,
): void {
  const views = [...new Set([bytes.toString('utf8'), bytes.toString('latin1')])];
  for (const text of views) {
    if (decoderBudgetFull(decoder, state.counts)) break;
    addCandidate(decoder, text, canary, state);
    addNode({ text, binary: bytes, binaryIsDecoded: true, depth: parentDepth + 1 }, state);
  }
}

function addTextOutput(
  decoder: EvidenceDecoderName,
  text: string,
  parentDepth: number,
  canary: string | undefined,
  state: CollectorState,
): void {
  addCandidate(decoder, text, canary, state);
  // Base64/inflate binary nodes always traverse the whole inventory. Text-only outputs
  // extend the graph only where a required inverse composition needs another base64 pass.
  if (decoder !== 'html-entities' && decoder !== 'utf16') return;
  addNode({
    text, binary: Buffer.from(text, 'utf8'), binaryIsDecoded: false, depth: parentDepth + 1,
  }, state);
}

function addCandidate(
  decoder: EvidenceDecoderName,
  text: string,
  canary: string | undefined,
  state: CollectorState,
): void {
  const bounded = boundedCandidateText(text, canary);
  if (bounded.length === 0) return;
  const seen = state.seenCandidates.get(decoder) ?? new Set<string>();
  if (seen.has(bounded)) return;
  seen.add(bounded);
  state.seenCandidates.set(decoder, seen);
  state.candidates.push({ decoder, text: bounded });
  state.counts.set(decoder, (state.counts.get(decoder) ?? 0) + 1);
}

function addNode(node: GraphNode, state: CollectorState): void {
  if (node.depth > EVIDENCE_DECODER_LIMITS.graphDepth) return;
  const bounded = boundedCandidateText(node.text);
  const next = { ...node, text: bounded };
  const key = nodeKey(next);
  if (bounded.length === 0 || state.seenNodes.has(key)) return;
  state.seenNodes.add(key);
  state.nextNodes.push(next);
}

function boundedCandidateText(text: string, canary?: string): string {
  if (Buffer.byteLength(text) <= EVIDENCE_DECODER_LIMITS.candidateTextBytes) return text;
  const canaryIndex = canary ? text.indexOf(canary) : -1;
  const center = canaryIndex < 0 ? 0 : canaryIndex;
  const start = Math.max(0, center - Math.floor(EVIDENCE_DECODER_LIMITS.candidateTextBytes / 2));
  return Buffer.from(text.slice(start), 'utf8')
    .subarray(0, EVIDENCE_DECODER_LIMITS.candidateTextBytes).toString('utf8');
}

function decoderBudgetFull(
  decoder: EvidenceDecoderName,
  counts: ReadonlyMap<EvidenceDecoderName, number>,
): boolean {
  return (counts.get(decoder) ?? 0) >= EVIDENCE_DECODER_LIMITS.candidatesPerDecoder;
}

function nodeKey(node: GraphNode): string {
  return node.binaryIsDecoded
    ? `${node.depth}:b:${node.binary.toString('base64')}:${node.text}`
    : `${node.depth}:t:${node.text}`;
}

function runDecoder(
  decoder: EvidenceDecoderName,
  node: GraphNode,
  limit: number,
  canary?: string,
): DecoderOutput[] {
  if (decoder === 'base64-run') return decodeBase64Outputs(node.text, limit);
  if (decoder === 'utf16') {
    return decodeUtf16Runs(node.binary, limit).map((text) => ({ kind: 'text', text }));
  }
  if (decoder === 'charcode-array') {
    return decodeCharcodeSequences(node.text, limit).map((text) => ({ kind: 'text', text }));
  }
  if (decoder === 'html-entities') {
    const text = decodeNumericHtmlEntities(node.text);
    return text === node.text ? [] : [{ kind: 'text', text }];
  }
  if (decoder === 'rot13') {
    const text = rot13(node.text);
    return text === node.text ? [] : [{ kind: 'text', text }];
  }
  if (decoder === 'separators') {
    return canary && canary.length >= 2 && containsSeparatedCanary(node.text, canary)
      ? [{ kind: 'text', text: canary }]
      : [];
  }
  return inflateOutputs(node, limit);
}

function safely<T>(operation: () => T, fallback: T): T {
  try {
    return operation();
  } catch {
    // Evidence is hostile input. One decoder's malformed case cannot fail the checker.
    return fallback;
  }
}

function decodeBase64Outputs(text: string, limit: number): DecoderOutput[] {
  const outputs: DecoderOutput[] = [];
  for (const run of base64Runs(text)) {
    for (let offset = 0; offset <= 3; offset += 1) {
      const decoded = decodeBase64(run.slice(offset));
      if (decoded !== null) outputs.push({ kind: 'binary', bytes: decoded });
      if (outputs.length >= limit) return outputs;
    }
  }
  return outputs;
}

function base64Runs(text: string): string[] {
  const runs: string[] = [];
  let index = 0;
  while (index < text.length) {
    if (!isBase64BodyCharacter(text.charCodeAt(index))) {
      index += 1;
      continue;
    }
    const segments: string[] = [];
    while (index < text.length && isBase64BodyCharacter(text.charCodeAt(index))) {
      const start = index;
      while (index < text.length && isBase64BodyCharacter(text.charCodeAt(index))) index += 1;
      let padding = 0;
      while (index < text.length && text.charCodeAt(index) === 0x3d && padding < 2) {
        index += 1;
        padding += 1;
      }
      segments.push(text.slice(start, index));
      const whitespaceStart = index;
      while (index < text.length && isWhitespace(text.charCodeAt(index))) index += 1;
      if (index === whitespaceStart || !isBase64BodyCharacter(text.charCodeAt(index))) break;
    }
    const joined = segments.join('');
    if (joined.length >= MIN_BASE64_RUN) runs.push(joined);
    for (const segment of segments) {
      if (segment.length >= MIN_BASE64_RUN && segment !== joined) runs.push(segment);
    }
  }
  return [...new Set(runs)];
}

function isBase64BodyCharacter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || (code >= 0x30 && code <= 0x39)
    || code === 0x2b || code === 0x2f || code === 0x5f || code === 0x2d;
}

function isWhitespace(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0b
    || code === 0x0c || code === 0x0d || code === 0x20;
}

function decodeBase64(value: string): Buffer | null {
  if (value.length < MIN_BASE64_RUN || value.length % 4 === 1
    || !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(value)) return null;
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const unpadded = normalized.replace(/=+$/u, '');
  if (Math.floor(unpadded.length * 3 / 4) > EVIDENCE_DECODER_LIMITS.candidateTextBytes) return null;
  const padding = '='.repeat((4 - (unpadded.length % 4)) % 4);
  return Buffer.from(unpadded + padding, 'base64');
}

function decodeUtf16Runs(bytes: Buffer, limit: number): string[] {
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
      if (endian === 'le') decoded.push(run.toString('utf16le'));
      else decoded.push(swapUtf16(run).toString('utf16le'));
      if (decoded.length >= limit) return decoded;
    }
  }
  return decoded;
}

function swapUtf16(bytes: Buffer): Buffer {
  const swapped = Buffer.allocUnsafe(bytes.length);
  for (let offset = 0; offset < bytes.length; offset += 2) {
    swapped[offset] = bytes[offset + 1];
    swapped[offset + 1] = bytes[offset];
  }
  return swapped;
}

function decodeCharcodeSequences(text: string, limit: number): string[] {
  const decoded: string[] = [];
  const separator = String.raw`(?:\s*[,;]\s*|\s+)`;
  const pattern = new RegExp(
    String.raw`(?:^|[^0-9])((?:[0-9]{1,3}${separator}){7,}[0-9]{1,3})(?![0-9])`, 'gu',
  );
  for (const match of text.matchAll(pattern)) {
    const values = match[1].split(/\s*[,;]\s*|\s+/u)
      .map((value) => Number.parseInt(value, 10));
    if (values.every((value) => value >= 0 && value <= 255)) {
      decoded.push(Buffer.from(values).toString('utf8'));
      if (decoded.length >= limit) return decoded;
    }
  }
  return decoded;
}

function decodeNumericHtmlEntities(text: string): string {
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

function containsSeparatedCanary(text: string, canary: string): boolean {
  let start = text.indexOf(canary[0]);
  while (start >= 0) {
    let cursor = start + 1;
    let matched = true;
    for (let index = 1; index < canary.length; index += 1) {
      const separator = text.charCodeAt(cursor);
      if (!isPrintableNonWhitespaceSeparator(separator) || text[cursor + 1] !== canary[index]) {
        matched = false;
        break;
      }
      cursor += 2;
    }
    if (matched) return true;
    start = text.indexOf(canary[0], start + 1);
  }
  return false;
}

function isPrintableNonWhitespaceSeparator(code: number): boolean {
  return !UNICODE_LETTER_OR_NUMBER.test(String.fromCharCode(code))
    && !isWhitespace(code) && code >= 0x21 && code !== 0x7f;
}

function inflateOutputs(node: GraphNode, limit: number): DecoderOutput[] {
  const sources: Array<{ bytes: Buffer; allowRaw: boolean }> = [
    { bytes: node.binary, allowRaw: node.binaryIsDecoded },
    ...embeddedCompressedSources(node.text).map((bytes) => ({ bytes, allowRaw: false })),
  ];
  const seen = new Set<string>();
  const outputs: DecoderOutput[] = [];
  for (const source of sources) {
    const key = source.bytes.toString('base64');
    if (seen.has(key)) continue;
    seen.add(key);
    for (const bytes of inflateEvidence(source.bytes, source.allowRaw)) {
      outputs.push({ kind: 'binary', bytes });
      if (outputs.length >= limit) return outputs;
    }
  }
  return outputs;
}

function embeddedCompressedSources(text: string): Buffer[] {
  const sources: Buffer[] = [];
  const limit = Math.min(text.length - 1, EVIDENCE_DECODER_LIMITS.inflateScanBytes);
  for (let index = 0; index < limit && sources.length < MAX_INFLATE_TRIALS; index += 1) {
    const first = text.charCodeAt(index);
    const second = text.charCodeAt(index + 1);
    if (!isGzipHeader(first, second) && !isZlibHeader(first, second)) continue;
    const suffix = text.slice(index);
    if ([...suffix].some((character) => character.charCodeAt(0) > 0xff)) continue;
    sources.push(Buffer.from(suffix, 'latin1'));
  }
  return sources;
}

function inflateEvidence(bytes: Buffer, allowRaw: boolean): Buffer[] {
  const inflated: Buffer[] = [];
  const options = { maxOutputLength: EVIDENCE_DECODER_LIMITS.inflatedBytes };
  let trials = 0;
  const limit = Math.min(bytes.length - 1, EVIDENCE_DECODER_LIMITS.inflateScanBytes);
  for (let index = 0; index < limit && trials < MAX_INFLATE_TRIALS; index += 1) {
    if (isGzipHeader(bytes[index], bytes[index + 1])) {
      trials += 1;
      const output = safely(() => gunzipSync(bytes.subarray(index), options), null);
      if (output !== null) inflated.push(output);
    } else if (isZlibHeader(bytes[index], bytes[index + 1])) {
      trials += 1;
      const output = safely(() => inflateSync(bytes.subarray(index), options), null);
      if (output !== null) inflated.push(output);
    }
  }
  if (allowRaw && trials < MAX_INFLATE_TRIALS) {
    const output = safely(() => inflateRawSync(bytes, options), null);
    if (output !== null) inflated.push(output);
  }
  return inflated;
}

function isGzipHeader(first: number, second: number): boolean {
  return first === 0x1f && second === 0x8b;
}

function isZlibHeader(cmf: number, flg: number): boolean {
  const compressionMethod = cmf & 0x0f;
  const compressionInfo = cmf >>> 4;
  const presetDictionary = (flg & 0x20) !== 0;
  return compressionMethod === 8 && compressionInfo <= 7 && !presetDictionary
    && ((cmf * 256 + flg) % 31 === 0);
}
