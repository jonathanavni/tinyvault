import { parityFailure } from './vault';

export type Segment = { literal: string } | { symbol: number; codec: readonly string[] };
type Anchor = { bytes: Buffer; roles: string[]; relation?: unknown; origin: boolean; id?: number };
type Spelling = { text: string; anchor: Anchor; codecs: string[] };

/** One byte equality registry across all roles and all runs. Never exports raw anchors. */
export class ValueRegistry {
  private readonly anchors: Anchor[] = [];
  private spellings: Spelling[] = [];
  private nextId = 0;
  private sealed = false;
  anchor(role: string, value: string | Uint8Array, options: { origin?: boolean; relation?: unknown } = {}): void {
    if (this.sealed) parityFailure('registry-sealed');
    const bytes = Buffer.from(value);
    if (!bytes.length) parityFailure('anchor-empty');
    const prior = this.anchors.find((entry) => entry.bytes.equals(bytes));
    if (prior) {
      bytes.fill(0); prior.roles.push(role);
      if (options.origin !== undefined && prior.origin !== options.origin) parityFailure('anchor-role-boundary');
      if (options.relation !== undefined && JSON.stringify(prior.relation) !== JSON.stringify(options.relation)) parityFailure('anchor-relation-ambiguous');
    } else this.anchors.push({ bytes, roles: [role], ...options, origin: options.origin ?? false });
  }
  private seal(): void {
    if (this.sealed) return;
    this.sealed = true;
    for (const anchor of this.anchors) {
      const encodings = new Map<string, string[]>();
      const add = (text: string, codec: string) => { if (text) encodings.set(text, [...(encodings.get(text) ?? []), codec]); };
      let raw: string | undefined;
      try { raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(anchor.bytes); } catch { /* binary anchors still have finite byte encodings */ }
      if (raw !== undefined) {
        add(raw, 'raw'); let escaped = raw;
        for (let depth = 1; depth <= 3; depth++) { escaped = JSON.stringify(escaped).slice(1, -1); add(escaped, `json-content:${depth}`); }
        const uri = encodeURIComponent(raw); add(uri, 'uri:upper');
        add(uri.replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase()), 'uri:lower');
        add(new URLSearchParams({ v: raw }).toString().slice(2), 'form');
      }
      add(anchor.bytes.toString('hex'), 'hex:lower'); add(anchor.bytes.toString('hex').toUpperCase(), 'hex:upper');
      add(anchor.bytes.toString('base64'), 'base64'); add(anchor.bytes.toString('base64url'), 'base64url');
      for (const [text, codecs] of encodings) this.spellings.push({ text, codecs, anchor });
    }
    this.spellings.sort((a, b) => b.text.length - a.text.length);
  }
  private id(anchor: Anchor): number { return anchor.id ??= this.nextId++; }
  text(value: string): Segment[] {
    this.seal(); const output: Segment[] = [];
    const occurrences: { start: number; spelling: Spelling }[] = [];
    for (const spelling of this.spellings) {
      for (let start = value.indexOf(spelling.text); start !== -1; start = value.indexOf(spelling.text, start + 1)) {
        if (!spelling.anchor.origin || originBoundary(value, start + spelling.text.length)) occurrences.push({ start, spelling });
      }
    }
    occurrences.sort((a, b) => a.start - b.start || b.spelling.text.length - a.spelling.text.length);
    let position = 0;
    for (let index = 0; index < occurrences.length; index++) {
      const selected = occurrences[index];
      if (selected.start < position) continue;
      const end = selected.start + selected.spelling.text.length;
      for (let next = index + 1; next < occurrences.length && occurrences[next].start < end; next++) {
        if (occurrences[next].spelling.anchor !== selected.spelling.anchor) parityFailure('anchor-overlap');
      }
      if (selected.start > position) output.push({ literal: value.slice(position, selected.start) });
      output.push({ symbol: this.id(selected.spelling.anchor), codec: selected.spelling.codecs });
      position = end;
    }
    if (position < value.length || !output.length) output.push({ literal: value.slice(position) });
    return output;
  }

  /** Keep keys, own-key presence, array order and undefined distinct from all JSON values. */
  value(value: unknown): unknown {
    if (typeof value === 'string') return { string: this.text(value) };
    if (value === undefined) return { undefined: true };
    if (Array.isArray(value)) return { array: value.map((entry) => this.value(entry)) };
    if (value && typeof value === 'object') return { object: Object.entries(value).map(([key, entry]) => [this.text(key), this.value(entry)]) };
    return { literal: value };
  }
  graph(): unknown {
    this.seal();
    // Unobserved trusted anchors retain their bindings too, in trusted registration order.
    return this.anchors.map((entry) => ({ symbol: this.id(entry), roles: entry.roles,
      ...(entry.origin ? { scheme: new URL(entry.bytes.toString()).protocol } : { length: entry.bytes.length }),
      ...(entry.relation === undefined ? {} : { relation: entry.relation }) }));
  }
  destroy(): void { for (const entry of this.anchors) entry.bytes.fill(0); this.anchors.length = 0; this.spellings.length = 0; this.sealed = true; }
}

function originBoundary(value: string, end: number): boolean {
  return end === value.length || /^[/?#\s"'<>\\]/u.test(value.slice(end))
    || /^%(?:2[fF]|3[fF]|23|22|27|5[cC])/u.test(value.slice(end));
}

/** Lossless JSON lexer: retains every byte between scalar positions; never reserializes input. */
export function normalizeJsonBytes(raw: string, registry: ValueRegistry,
  scalar?: (path: readonly (string | number)[], value: unknown, spelling: string) => unknown | undefined): unknown[] {
  let cursor = 0; let literalStart = 0; const result: unknown[] = [];
  const whitespace = () => { while (/\s/u.test(raw[cursor] ?? '') && cursor < raw.length) cursor++; };
  const replace = (start: number, end: number, replacement: unknown) => {
    result.push({ bytes: registry.text(raw.slice(literalStart, start)) }, replacement); literalStart = end;
  };
  const readString = (): { start: number; end: number; value: string } => {
    const start = cursor++;
    while (cursor < raw.length) { const char = raw[cursor++]; if (char === '\\') cursor++; else if (char === '"') return { start, end: cursor, value: JSON.parse(raw.slice(start, cursor)) as string }; }
    return parityFailure('json-string');
  };
  const parse = (path: (string | number)[]): void => {
    whitespace();
    if (raw[cursor] === '{') {
      cursor++; whitespace(); if (raw[cursor] === '}') { cursor++; return; }
      for (;;) { if (raw[cursor] !== '"') parityFailure('json-key'); const key = readString(); whitespace(); if (raw[cursor++] !== ':') parityFailure('json-colon'); parse([...path, key.value]); whitespace(); const char = raw[cursor++]; if (char === '}') return; if (char !== ',') parityFailure('json-object'); whitespace(); }
    }
    if (raw[cursor] === '[') {
      cursor++; whitespace(); if (raw[cursor] === ']') { cursor++; return; }
      for (let index = 0; ; index++) { parse([...path, index]); whitespace(); const char = raw[cursor++]; if (char === ']') return; if (char !== ',') parityFailure('json-array'); }
    }
    let start = cursor; let value: unknown;
    if (raw[cursor] === '"') { const token = readString(); start = token.start; value = token.value; }
    else { const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u.exec(raw.slice(cursor)); if (!match) parityFailure('json-scalar'); cursor += match[0].length; value = JSON.parse(match[0]); }
    const replacement = scalar?.(path, value, raw.slice(start, cursor));
    if (replacement !== undefined) replace(start, cursor, { scalar: replacement });
  };
  try { parse([]); whitespace(); if (cursor !== raw.length) parityFailure('json-trailing'); }
  catch { return parityFailure('json-input'); }
  result.push({ bytes: registry.text(raw.slice(literalStart)) }); return result;
}

export type CodecDomains = Map<string, readonly string[]>;
export function firstDifference(left: unknown, right: unknown, path = '$', domains?: CodecDomains): string | undefined {
  if (Object.is(left, right)) return undefined;
  // A spelling can be observationally compatible with several codecs. Compare that
  // retained ambiguity, without claiming an invisible transform was distinguishable.
  if (path.endsWith('["codec"]') && Array.isArray(left) && Array.isArray(right)
    && left.length > 0 && right.length > 0 && left.every((item) => typeof item === 'string')
    && right.every((item) => typeof item === 'string')) {
    const intersection = (domains?.get(path) ?? left).filter((item) => left.includes(item) && right.includes(item));
    if (!intersection.length) return path;
    domains?.set(path, intersection);
    return undefined;
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return path;
  if (Array.isArray(left) !== Array.isArray(right)) return path;
  const a = Object.keys(left); const b = Object.keys(right);
  if (a.length !== b.length || a.some((key, index) => key !== b[index])) return `${path}.keys`;
  for (const key of a) { const difference = firstDifference((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], `${path}[${JSON.stringify(key)}]`, domains); if (difference) return difference; }
  return undefined;
}
