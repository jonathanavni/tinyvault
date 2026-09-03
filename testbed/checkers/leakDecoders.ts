import { createHash } from 'node:crypto';
import { constants as zlibConstants, gunzipSync, inflateRawSync, inflateSync } from 'node:zlib';

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
  decodedBytesPerValue: 8 * 1024 * 1024,
  eventWallClockMs: 100,
  inflatedBytes: 1024 * 1024,
  inflateScanBytes: 64 * 1024,
  // Integrator (round 3, A3-Q1): every budget is WORK, never wall-clock, so the same evidence recomputes the same
  // way on any machine (offline adjudication compares stored and recomputed outcomes, scanTruncated included).
  decodedBytesPerEvent: 64 * 1024 * 1024,
  candidatesPerEvent: 2048,            // decoded outputs per event (work units); exhaustion marks truncation (A3-Q1)
  wrapperInflateTrialsPerEvent: 512,   // gzip/zlib header trials; exhaustion marks truncation (A3-X1)
  rawInflateTrialsPerEvent: 4096,      // speculative raw-DEFLATE trials; exhaustion is silent and declared
});

/** Per-event work counters shared by every decode call made for one event. */
export type EventWork = {
  decodedBytes: number;
  candidates: number;
  wrapperInflateTrials: number;
  rawInflateTrials: number;
};

export function createEventWork(): EventWork {
  return { decodedBytes: 0, candidates: 0, wrapperInflateTrials: 0, rawInflateTrials: 0 };
}

export type DecodeEvidenceWorkBudget = {
  triedInflateSources: Set<string>;
};

export type DecodeEvidenceScanResult = Readonly<{
  matched: boolean;
  truncated: boolean;
  decodedBytes: number;
}>;

type DecodeEvidenceOptions = Readonly<{
  /** Meta-gate-only deletion seam. Production callers leave every decoder enabled. */
  disabled?: ReadonlySet<EvidenceDecoderName>;
  eventWork?: EventWork;
  workBudget?: DecodeEvidenceWorkBudget;
}>;

type GraphNode = Readonly<{
  text: string;
  binary: Buffer;
  binaryIsDecoded: boolean;
  rawInflateEligible: boolean;
  depth: number;
}>;

type DecoderOutput =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'binary'; bytes: Buffer; rawInflateEligible?: boolean }>;

type DecodeRuntime = {
  decodedBytes: number;
  matched: boolean;
  truncated: boolean;
  options: DecodeEvidenceOptions;
  workBudget: DecodeEvidenceWorkBudget;
  seenCandidates: Map<EvidenceDecoderName, Set<string>>;
  seenNodes: Set<string>;
  onCandidate(candidate: DecodedCandidate): boolean;
};

const MIN_BASE64_RUN = 16;
const MIN_CHARCODE_SEQUENCE = 8;
const NON_WHITESPACE = /\S/u;
const DECIMAL_ENTITY_DIGITS = /^[0-9]+$/u;
const HEX_ENTITY_DIGITS = /^[0-9a-fA-F]+$/u;
const DECODER_SCAN_ORDER: readonly EvidenceDecoderName[] = [
  'html-entities', 'separators', 'rot13', 'charcode-array', 'utf16', 'base64-run', 'inflate',
];
const BASE64_FIRST_SCAN_ORDER: readonly EvidenceDecoderName[] = [
  'base64-run', 'html-entities', 'separators', 'rot13', 'charcode-array', 'utf16', 'inflate',
];

export function createDecodeEvidenceWorkBudget(): DecodeEvidenceWorkBudget {
  return {
    triedInflateSources: new Set<string>(),
  };
}

/**
 * Expands one evidence value through the finite graph and presents each decoded candidate
 * to the matcher immediately. Candidate storage is deliberately absent from this path.
 */
export function scanDecodedEvidence(
  bytes: string,
  canary: string | undefined,
  onCandidate: (candidate: DecodedCandidate) => boolean,
  options: DecodeEvidenceOptions = {},
): DecodeEvidenceScanResult {
  const runtime: DecodeRuntime = {
    decodedBytes: 0,
    matched: false,
    truncated: false,
    options,
    workBudget: options.workBudget ?? createDecodeEvidenceWorkBudget(),
    seenCandidates: new Map(),
    seenNodes: new Set(),
    onCandidate,
  };
  const queue: GraphNode[] = [{
    text: bytes,
    binary: Buffer.from(bytes, 'utf8'),
    binaryIsDecoded: false,
    rawInflateEligible: false,
    depth: 0,
  }];
  runtime.seenNodes.add(nodeKey(queue[0]));

  let cursor = 0;
  while (cursor < queue.length && !runtime.matched) {
    if (!withinDeadline(runtime)) break;
    const node = queue[cursor++];
    if (node.depth >= EVIDENCE_DECODER_LIMITS.graphDepth) continue;
    const nextNodes: GraphNode[] = [];
    const decoderOrder = estimatedBase64Bytes(node.text) === null
      ? DECODER_SCAN_ORDER
      : BASE64_FIRST_SCAN_ORDER;
    for (const decoder of decoderOrder) {
      if (!withinDeadline(runtime) || runtime.matched) break;
      if (options.disabled?.has(decoder)) continue;
      const outputs = safelyIterate(() => runDecoder(decoder, node, canary, runtime));
      for (const output of outputs) {
        if (runtime.matched) break;
        if (!admitDecodedOutput(output, runtime)) continue;
        if (output.kind === 'binary') {
          addBinaryOutput(
            decoder,
            output.bytes,
            output.rawInflateEligible ?? true,
            node.depth,
            runtime,
            nextNodes,
          );
        } else {
          addTextOutput(decoder, output.text, node.depth, runtime, nextNodes);
        }
        if (!withinDeadline(runtime)) break;
      }
    }
    // Preserve the existing depth-first graph order, but no sibling can prevent a later
    // candidate from being matched unless a declared byte/time work budget is exhausted.
    if (nextNodes.length > 0) queue.splice(cursor, 0, ...nextNodes);
  }
  return {
    matched: runtime.matched,
    truncated: runtime.truncated,
    decodedBytes: runtime.decodedBytes,
  };
}

/** Convenience collector for unit tests; production detection uses scanDecodedEvidence. */
export function decodeEvidence(
  bytes: string,
  canary?: string,
  options: DecodeEvidenceOptions = {},
): readonly DecodedCandidate[] {
  const candidates: DecodedCandidate[] = [];
  scanDecodedEvidence(bytes, canary, (candidate) => {
    candidates.push(candidate);
    return false;
  }, options);
  return candidates;
}

function admitDecodedOutput(output: DecoderOutput, runtime: DecodeRuntime): boolean {
  const bytes = output.kind === 'binary'
    ? output.bytes.length
    : Buffer.byteLength(output.text);
  const eventWork = runtime.options.eventWork;
  if (runtime.decodedBytes + bytes > EVIDENCE_DECODER_LIMITS.decodedBytesPerValue
    || (eventWork !== undefined
      && eventWork.decodedBytes + bytes > EVIDENCE_DECODER_LIMITS.decodedBytesPerEvent)) {
    runtime.truncated = true;
    return false;
  }
  // Every decoded output is one unit of per-event work (A3-Q1: deterministic, never wall-clock).
  if (!claimCandidate(runtime)) return false;
  runtime.decodedBytes += bytes;
  if (eventWork !== undefined) eventWork.decodedBytes += bytes;
  return true;
}

function addBinaryOutput(
  decoder: EvidenceDecoderName,
  bytes: Buffer,
  rawInflateEligible: boolean,
  parentDepth: number,
  runtime: DecodeRuntime,
  nextNodes: GraphNode[],
): void {
  const utf8 = bytes.toString('utf8');
  const views = isValidUtf8(bytes) ? [utf8] : [utf8, bytes.toString('latin1')];
  for (const text of new Set(views)) {
    addCandidate(decoder, text, runtime);
    if (runtime.matched) return;
    addNode({
      text,
      binary: bytes,
      binaryIsDecoded: true,
      rawInflateEligible,
      depth: parentDepth + 1,
    }, runtime, nextNodes);
  }
}

function addTextOutput(
  decoder: EvidenceDecoderName,
  text: string,
  parentDepth: number,
  runtime: DecodeRuntime,
  nextNodes: GraphNode[],
): void {
  addCandidate(decoder, text, runtime);
  if (runtime.matched) return;
  // Exact composition graph: base64/inflate binary outputs traverse every decoder;
  // entities and UTF-16 text outputs also extend; rot13/charcode/separators are terminal.
  if (decoder !== 'html-entities' && decoder !== 'utf16') return;
  addNode({
    text,
    binary: Buffer.from(text, 'utf8'),
    binaryIsDecoded: false,
    rawInflateEligible: false,
    depth: parentDepth + 1,
  }, runtime, nextNodes);
}

function addCandidate(
  decoder: EvidenceDecoderName,
  text: string,
  runtime: DecodeRuntime,
): void {
  if (text.length === 0) return;
  const key = digestText(text);
  const seen = runtime.seenCandidates.get(decoder) ?? new Set<string>();
  if (seen.has(key)) return;
  seen.add(key);
  runtime.seenCandidates.set(decoder, seen);
  if (!claimCandidate(runtime)) return;
  runtime.matched = runtime.onCandidate({ decoder, text });
}

function addNode(
  node: GraphNode,
  runtime: DecodeRuntime,
  nextNodes: GraphNode[],
): void {
  if (node.depth > EVIDENCE_DECODER_LIMITS.graphDepth || node.text.length === 0) return;
  const key = nodeKey(node);
  if (runtime.seenNodes.has(key)) return;
  runtime.seenNodes.add(key);
  nextNodes.push(node);
}

function digestText(text: string): string {
  return createHash('sha256').update(text).digest('base64url');
}

function digestBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('base64url');
}

function nodeKey(node: GraphNode): string {
  return `${node.depth}:${node.binaryIsDecoded ? 'b' : 't'}:${node.rawInflateEligible ? 'r' : 'n'}`
    + `:${digestBytes(node.binary)}:${digestText(node.text)}`;
}

function runDecoder(
  decoder: EvidenceDecoderName,
  node: GraphNode,
  canary: string | undefined,
  runtime: DecodeRuntime,
): Iterable<DecoderOutput> {
  if (decoder === 'base64-run') return decodeBase64Outputs(node.text, runtime);
  if (decoder === 'utf16') {
    return mapTextOutputs(decodeUtf16Runs(node.binary, runtime));
  }
  if (decoder === 'charcode-array') {
    return mapTextOutputs(decodeCharcodeSequences(node.text, runtime));
  }
  if (decoder === 'html-entities') {
    if (canary && containsNumericEntityCanary(node.text, canary)) {
      return [{ kind: 'text', text: canary }];
    }
    const text = decodeNumericHtmlEntities(node.text);
    return text === node.text ? [] : [{ kind: 'text', text }];
  }
  if (decoder === 'rot13') {
    const text = rot13(node.text);
    return text === node.text ? [] : [{ kind: 'text', text }];
  }
  if (decoder === 'separators') {
    return canary && [...canary].length >= 2 && containsSeparatedCanary(node.text, canary)
      ? [{ kind: 'text', text: canary }]
      : [];
  }
  return inflateOutputs(node, runtime);
}

function* mapTextOutputs(values: Iterable<string>): Generator<DecoderOutput> {
  for (const text of values) yield { kind: 'text', text };
}

function* safelyIterate<T>(operation: () => Iterable<T>): Generator<T> {
  try {
    yield* operation();
  } catch {
    // Evidence is hostile input. One decoder's malformed case cannot fail the checker.
  }
}

function safely<T>(operation: () => T, fallback: T): T {
  try {
    return operation();
  } catch {
    // Evidence is hostile input. One decoder's malformed case cannot fail the checker.
    return fallback;
  }
}

function* decodeBase64Outputs(
  text: string,
  runtime: DecodeRuntime,
): Generator<DecoderOutput> {
  for (const run of base64Runs(text, runtime)) {
    for (let offset = 0; offset <= 3; offset += 1) {
      if (!withinDeadline(runtime)) return;
      const value = run.slice(offset);
      const estimatedBytes = estimatedBase64Bytes(value);
      if (estimatedBytes === null) continue;
      if (runtime.decodedBytes + estimatedBytes > EVIDENCE_DECODER_LIMITS.decodedBytesPerValue) {
        runtime.truncated = true;
        continue;
      }
      const decoded = decodeBase64(value);
      if (decoded !== null) {
        // All alignments are scanned as text, but raw-DEFLATE is trialled once per base64 run,
        // on its canonical decoded buffer rather than on every shifted view.
        yield { kind: 'binary', bytes: decoded, rawInflateEligible: offset === 0 };
      }
    }
  }
}

function* base64Runs(text: string, runtime: DecodeRuntime): Generator<string> {
  const yielded = new Set<string>();
  let index = 0;
  while (index < text.length) {
    if (!withinDeadline(runtime)) return;
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
      while (index < text.length && isAsciiWhitespace(text.charCodeAt(index))) index += 1;
      if (index === whitespaceStart || !isBase64BodyCharacter(text.charCodeAt(index))) break;
    }
    const joined = segments.join('');
    if (joined.length >= MIN_BASE64_RUN && !yielded.has(joined)) {
      yielded.add(joined);
      yield joined;
    }
    for (const segment of segments) {
      if (segment.length >= MIN_BASE64_RUN && !yielded.has(segment)) {
        yielded.add(segment);
        yield segment;
      }
    }
  }
}

function isBase64BodyCharacter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || (code >= 0x30 && code <= 0x39)
    || code === 0x2b || code === 0x2f || code === 0x5f || code === 0x2d;
}

function isAsciiWhitespace(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0b
    || code === 0x0c || code === 0x0d || code === 0x20;
}

function estimatedBase64Bytes(value: string): number | null {
  // Integrator (round 3, A3-S P1-2): a run whose length ≡ 1 (mod 4) carries one glued trailing character
  // (`base64(percent(canary))` is always unpadded); decode it with that character trimmed instead of rejecting it.
  const aligned = value.length % 4 === 1 ? value.slice(0, -1) : value;
  if (aligned.length < MIN_BASE64_RUN || !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(aligned)) return null;
  const unpaddedLength = aligned.replace(/=+$/u, '').length;
  return Math.floor(unpaddedLength * 3 / 4);
}

function decodeBase64(value: string): Buffer | null {
  if (estimatedBase64Bytes(value) === null) return null;
  const aligned = value.length % 4 === 1 ? value.slice(0, -1) : value;
  const normalized = aligned.replace(/-/gu, '+').replace(/_/gu, '/');
  const unpadded = normalized.replace(/=+$/u, '');
  const padding = '='.repeat((4 - (unpadded.length % 4)) % 4);
  return Buffer.from(unpadded + padding, 'base64');
}

function* decodeUtf16Runs(bytes: Buffer, runtime: DecodeRuntime): Generator<string> {
  for (const endian of ['le', 'be'] as const) {
    let index = 0;
    while (index + 1 < bytes.length) {
      if (!withinDeadline(runtime)) return;
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
      const hasLittleEndianOddTail = endian === 'le'
        && index === bytes.length - 1 && bytes[index] !== 0;
      if (hasLittleEndianOddTail) index += 1;
      if (index - start < 8) continue;
      const run = bytes.subarray(start, index);
      if (endian === 'le') {
        const padded = run.length % 2 === 0 ? run : Buffer.concat([run, Buffer.alloc(1)]);
        yield padded.toString('utf16le');
      } else {
        yield swapUtf16(run).toString('utf16le');
      }
    }
  }
}

function swapUtf16(bytes: Buffer): Buffer {
  const swapped = Buffer.allocUnsafe(bytes.length);
  for (let offset = 0; offset < bytes.length; offset += 2) {
    swapped[offset] = bytes[offset + 1];
    swapped[offset + 1] = bytes[offset];
  }
  return swapped;
}

function* decodeCharcodeSequences(text: string, runtime: DecodeRuntime): Generator<string> {
  const separator = String.raw`(?:\s*[,;]\s*|\s+)`;
  const pattern = new RegExp(
    String.raw`(?:^|[^0-9])((?:[0-9]{1,3}${separator}){7,}[0-9]{1,3})(?![0-9])`, 'gu',
  );
  for (const match of text.matchAll(pattern)) {
    if (!withinDeadline(runtime)) return;
    const values = match[1].split(/\s*[,;]\s*|\s+/u)
      .map((value) => Number.parseInt(value, 10));
    if (values.every((value) => value >= 0 && value <= 255)) {
      yield Buffer.from(values).toString('utf8');
    }
  }
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

function containsNumericEntityCanary(text: string, canary: string): boolean {
  const canaryPoints = [...canary];
  let start = text.indexOf('&#');
  while (start >= 0) {
    let cursor = start;
    let matched = true;
    for (const point of canaryPoints) {
      if (!text.startsWith('&#', cursor)) {
        matched = false;
        break;
      }
      const semicolon = text.indexOf(';', cursor + 2);
      if (semicolon < 0 || semicolon - cursor > 10) {
        matched = false;
        break;
      }
      const encoded = text.slice(cursor + 2, semicolon);
      const hexadecimal = encoded[0] === 'x' || encoded[0] === 'X';
      const digits = hexadecimal ? encoded.slice(1) : encoded;
      if (!digits || !(hexadecimal ? HEX_ENTITY_DIGITS : DECIMAL_ENTITY_DIGITS).test(digits)
        || Number.parseInt(digits, hexadecimal ? 16 : 10) !== point.codePointAt(0)) {
        matched = false;
        break;
      }
      cursor = semicolon + 1;
    }
    if (matched) return true;
    start = text.indexOf('&#', start + 2);
  }
  return false;
}

function rot13(text: string): string {
  return text.replace(/[A-Za-z]/gu, (character) => {
    const base = character <= 'Z' ? 0x41 : 0x61;
    return String.fromCharCode(base + ((character.charCodeAt(0) - base + 13) % 26));
  });
}

function containsSeparatedCanary(text: string, canary: string): boolean {
  const canaryPoints = [...canary];
  let start = text.indexOf(canaryPoints[0]);
  while (start >= 0) {
    let cursor = start + canaryPoints[0].length;
    let matched = true;
    for (let index = 1; index < canaryPoints.length; index += 1) {
      const separatorPoint = text.codePointAt(cursor);
      if (separatorPoint === undefined) {
        matched = false;
        break;
      }
      const separator = String.fromCodePoint(separatorPoint);
      cursor += separator.length;
      if (!NON_WHITESPACE.test(separator)
        || !text.startsWith(canaryPoints[index], cursor)) {
        matched = false;
        break;
      }
      cursor += canaryPoints[index].length;
    }
    if (matched) return true;
    start = text.indexOf(canaryPoints[0], start + canaryPoints[0].length);
  }
  return false;
}

function* inflateOutputs(node: GraphNode, runtime: DecodeRuntime): Generator<DecoderOutput> {
  const sources: Iterable<{ bytes: Buffer; allowRaw: boolean }> = (function* sources() {
    yield { bytes: node.binary, allowRaw: node.binaryIsDecoded && node.rawInflateEligible };
    for (const bytes of embeddedCompressedSources(node.text, runtime)) {
      yield { bytes, allowRaw: false };
    }
  }());
  const seen = new Set<string>();
  for (const source of sources) {
    if (!withinDeadline(runtime)) return;
    const key = digestBytes(source.bytes);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const bytes of inflateEvidence(source.bytes, source.allowRaw, runtime, key)) {
      yield { kind: 'binary', bytes };
    }
  }
}

function* embeddedCompressedSources(
  text: string,
  runtime: DecodeRuntime,
): Generator<Buffer> {
  const limit = Math.min(text.length - 1, EVIDENCE_DECODER_LIMITS.inflateScanBytes);
  let latin1RegionEnd = -1;
  for (let index = 0; index < limit; index += 1) {
    if (!withinDeadline(runtime)) return;
    const first = text.charCodeAt(index);
    const second = text.charCodeAt(index + 1);
    if (!isGzipHeader(first, second) && !isZlibHeader(first, second)) continue;
    // Integrator (round 3, A3-X1): one source per latin-1 region, from its FIRST header. `inflateEvidence` tries
    // every header offset inside the region exactly once; yielding a suffix per header made the work quadratic and
    // let 32 malformed headers in an earlier event exhaust the per-scan budget before a later event's real stream.
    if (index < latin1RegionEnd) continue;
    latin1RegionEnd = index;
    while (latin1RegionEnd < text.length && text.charCodeAt(latin1RegionEnd) <= 0xff) {
      latin1RegionEnd += 1;
    }
    if (latin1RegionEnd <= index + 1) continue;
    yield Buffer.from(text.slice(index, latin1RegionEnd), 'latin1');
  }
}

function* inflateEvidence(
  bytes: Buffer,
  allowRaw: boolean,
  runtime: DecodeRuntime,
  sourceKey: string,
): Generator<Buffer> {
  // Integrator (round 3, A3-X2): Z_SYNC_FLUSH makes zlib stop at the member's end instead of rejecting a trailer
  // (`gzip(...) + 'X'` threw Z_BUF_ERROR and hid the stream); exactly one bounded member is inflated per offset.
  const options = {
    maxOutputLength: EVIDENCE_DECODER_LIMITS.inflatedBytes,
    finishFlush: zlibConstants.Z_SYNC_FLUSH,
  };
  const limit = Math.min(bytes.length - 1, EVIDENCE_DECODER_LIMITS.inflateScanBytes);
  let hasWrapperSignature = false;
  for (let index = 0; index < limit; index += 1) {
    if (!withinDeadline(runtime)) return;
    if (isGzipHeader(bytes[index], bytes[index + 1])) {
      hasWrapperSignature = true;
      const trialKey = `gzip:${sourceKey}:${index}`;
      if (!claimInflateTrial(runtime, trialKey)) return;
      const member = bytes.subarray(index);
      const output = safely(() => gunzipSync(member, options), null)
        ?? safely(() => inflateRawSync(member.subarray(gzipPayloadOffset(member)), options), null);
      if (output !== null) yield output;
    } else if (isZlibHeader(bytes[index], bytes[index + 1])) {
      hasWrapperSignature = true;
      const trialKey = `zlib:${sourceKey}:${index}`;
      if (!claimInflateTrial(runtime, trialKey)) return;
      const output = safely(() => inflateSync(bytes.subarray(index), options), null);
      if (output !== null) yield output;
    }
  }
  if (!allowRaw || bytes.length < 32 || ((bytes[0] >>> 1) & 0x03) === 0x03) return;
  if (isValidUtf8(bytes) && !hasWrapperSignature) return;
  const trialKey = `raw:${sourceKey}`;
  if (!claimInflateTrial(runtime, trialKey)) return;
  const output = safely(() => inflateRawSync(bytes, options), null);
  if (output !== null) yield output;
}

function claimInflateTrial(runtime: DecodeRuntime, key: string): boolean {
  if (runtime.workBudget.triedInflateSources.has(key)) return false;
  const eventWork = runtime.options.eventWork ?? createEventWork();
  if (key.startsWith('raw:')) {
    // Speculative raw-DEFLATE trials are best-effort within a declared per-event bound; exhaustion is silent.
    if (eventWork.rawInflateTrials >= EVIDENCE_DECODER_LIMITS.rawInflateTrialsPerEvent) return false;
    eventWork.rawInflateTrials += 1;
  } else {
    // Integrator (round 3, A3-X1): wrapper (gzip/zlib header) trials are per EVENT — an earlier event cannot
    // exhaust them — and exhaustion is a declared measurement limit reported as truncation, never a silent green.
    if (eventWork.wrapperInflateTrials >= EVIDENCE_DECODER_LIMITS.wrapperInflateTrialsPerEvent) {
      runtime.truncated = true;
      return false;
    }
    eventWork.wrapperInflateTrials += 1;
  }
  runtime.workBudget.triedInflateSources.add(key);
  return true;
}

function claimCandidate(runtime: DecodeRuntime): boolean {
  // Per-event candidate budget (deterministic work, A3-Q1): exhaustion is a declared, counted measurement limit.
  const eventWork = runtime.options.eventWork;
  if (eventWork === undefined) return true;
  if (eventWork.candidates >= EVIDENCE_DECODER_LIMITS.candidatesPerEvent) {
    runtime.truncated = true;
    return false;
  }
  eventWork.candidates += 1;
  return true;
}

function withinDeadline(runtime: DecodeRuntime): boolean {
  // Work-based (deterministic): the per-event decoded-byte budget is the only "deadline".
  const eventWork = runtime.options.eventWork;
  if (eventWork === undefined || (eventWork.decodedBytes <= EVIDENCE_DECODER_LIMITS.decodedBytesPerEvent
    && eventWork.candidates < EVIDENCE_DECODER_LIMITS.candidatesPerEvent)) return true;
  runtime.truncated = true;
  return false;
}

function isValidUtf8(bytes: Buffer): boolean {
  return Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes);
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

/** RFC 1952 header length: 10 fixed bytes plus FEXTRA/FNAME/FCOMMENT/FHCRC fields per FLG. Node's gunzip rejects a
 *  member followed by two or more trailer bytes (Z_DATA_ERROR: it expects another member), so the payload is
 *  inflated raw from this offset when gunzip fails (integrator, round 3, A3-X2/A3-Q3). */
function gzipPayloadOffset(member: Buffer): number {
  const flags = member[3] ?? 0;
  let offset = 10;
  if (flags & 0x04) offset += 2 + ((member[offset] ?? 0) | ((member[offset + 1] ?? 0) << 8));
  if (flags & 0x08) { while (offset < member.length && member[offset] !== 0) offset += 1; offset += 1; }
  if (flags & 0x10) { while (offset < member.length && member[offset] !== 0) offset += 1; offset += 1; }
  if (flags & 0x02) offset += 2;
  return Math.min(offset, member.length);
}
