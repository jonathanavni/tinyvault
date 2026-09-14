import { validateBareOrigin } from '../core/originGuard';
import type { CredentialPolicy } from '../core/types';
import { BackendError } from './backend';
import { isRecordId } from './onepasswordConfig';

type ObjectValue = Record<string, unknown>;
const bad = (): never => { throw new BackendError('integrity'); };
const overflow = (): never => { throw new BackendError('unavailable'); };

/** Scan before JSON.parse: duplicate decoded names cannot be recovered from a parsed object. */
export function parseProviderJson(bytes: Uint8Array, cap: number): unknown {
  if (bytes.byteLength > cap) return overflow();
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return bad(); }
  let at = 0;
  let nodes = 0;
  function space(): void { while (/[\x20\t\r\n]/u.test(source[at] ?? '') && at < source.length) at++; }
  function string(): string {
    const start = at++;
    while (at < source.length) {
      const code = source.charCodeAt(at++);
      if (code === 34) {
        try { return JSON.parse(source.slice(start, at)) as string; } catch { return bad(); }
      }
      if (code < 32) return bad();
      if (code === 92) {
        const escape = source[at++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(source.slice(at, at + 4))) return bad();
          at += 4;
        } else if (escape === undefined || !'"\\/bfnrt'.includes(escape)) return bad();
      }
    }
    return bad();
  }
  function value(depth: number): void {
    if (depth > 12 || ++nodes > 65_536) return overflow();
    space();
    const head = source[at];
    if (head === '{' || head === '[') {
      const object = head === '{';
      const end = object ? '}' : ']';
      const keys = new Set<string>();
      at++;
      space();
      if (source[at] === end) { at++; return; }
      for (;;) {
        if (object) {
          if (source[at] !== '"') return bad();
          const key = string();
          if (keys.has(key)) return bad();
          keys.add(key);
          space();
          if (source[at++] !== ':') return bad();
        }
        value(depth + 1);
        space();
        if (source[at] === end) { at++; return; }
        if (source[at++] !== ',') return bad();
        space();
      }
    }
    if (head === '"') { string(); return; }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, at)) { at += literal.length; return; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(source.slice(at));
    if (number === null || !Number.isFinite(Number(number[0]))) return bad();
    at += number[0].length;
  }
  value(0);
  space();
  if (at !== source.length) return bad();
  try { return JSON.parse(source); } catch { return bad(); }
}

function object(value: unknown, required: string[], optional: string[] = []): ObjectValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad();
  if (!required.every((key) => Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) return bad();
  return value as ObjectValue;
}
function strings(value: ObjectValue, keys: string[]): void {
  for (const key of keys) if (Object.hasOwn(value, key) && typeof value[key] !== 'string') bad();
}
function number(value: ObjectValue, key: string): void {
  if (Object.hasOwn(value, key) && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) bad();
}
function urls(value: unknown): ObjectValue[] {
  if (!Array.isArray(value)) return bad();
  return value.map((entry) => {
    const url = object(entry, ['href'], ['label', 'primary']);
    strings(url, ['href', 'label']);
    if (Object.hasOwn(url, 'primary') && typeof url.primary !== 'boolean') bad();
    return url;
  });
}
function fields(value: unknown): ObjectValue[] {
  if (!Array.isArray(value)) return bad();
  const ids = new Set<string>();
  const purposes = new Set<string>();
  return value.map((entry) => {
    const field = object(entry, ['id', 'type'], ['purpose', 'label', 'value', 'reference', 'entropy', 'password_details']);
    strings(field, ['id', 'type', 'purpose', 'label', 'value', 'reference']);
    if (field.id === '' || ids.has(field.id as string)) bad();
    ids.add(field.id as string);
    if (Object.hasOwn(field, 'purpose')) {
      if (purposes.has(field.purpose as string)) bad();
      purposes.add(field.purpose as string);
    }
    number(field, 'entropy');
    if (Object.hasOwn(field, 'password_details')) {
      const details = object(field.password_details, ['entropy', 'generated', 'strength']);
      number(details, 'entropy');
      strings(details, ['strength']);
      if (typeof details.generated !== 'boolean') bad();
    }
    if ((Object.hasOwn(field, 'entropy') || Object.hasOwn(field, 'password_details'))
      && (field.id !== 'password' || field.type !== 'CONCEALED' || field.purpose !== 'PASSWORD')) bad();
    return field;
  });
}
function row(value: unknown, detail: boolean): ObjectValue {
  const optional = ['title', 'version', 'last_edited_by', 'created_at', 'updated_at', 'additional_information', 'urls'];
  const result = object(value, ['id', 'vault', 'category'], detail ? [...optional, 'state', 'fields'] : optional);
  strings(result, ['id', 'category', 'title', 'last_edited_by', 'created_at', 'updated_at', 'additional_information', 'state']);
  number(result, 'version');
  const vault = object(result.vault, ['id'], ['name']);
  strings(vault, ['id', 'name']);
  if (Object.hasOwn(result, 'urls')) urls(result.urls);
  if (Object.hasOwn(result, 'fields')) fields(result.fields);
  return result;
}
function identity(value: ObjectValue, vaultId: string, itemId?: string): void {
  const vault = value.vault as ObjectValue;
  if (!isRecordId(value.id) || !isRecordId(vault.id) || vault.id !== vaultId
    || value.category !== 'LOGIN' || (itemId !== undefined && value.id !== itemId)) bad();
}

export function websiteOrigin(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  let origin: string | undefined;
  try {
    for (const entry of value) {
      const href = (entry as ObjectValue).href;
      if (typeof href !== 'string' || /\s|[\u0000-\u001f\u007f\\]/u.test(href)
        || !/^https?:\/\//iu.test(href)) return undefined;
      const authorityEnd = href.slice(href.indexOf('://') + 3).search(/[/?#]/u);
      const raw = authorityEnd < 0 ? href : href.slice(0, href.indexOf('://') + 3 + authorityEnd);
      if (/[^\x00-\x7f]/u.test(raw)) return undefined;
      const current = validateBareOrigin(raw);
      if (new URL(href).origin !== current || (origin !== undefined && origin !== current)) return undefined;
      origin = current;
    }
    return origin;
  } catch { return undefined; }
}

/** Returns only fixed IDs and derived origins; never provider strings or objects. */
export function parseList(bytes: Uint8Array, vaultId: string, configured: readonly string[]): Map<string, string> {
  const parsed = parseProviderJson(bytes, 1_048_576);
  if (!Array.isArray(parsed)) return bad();
  if (parsed.length > 1024) return overflow();
  const rows = parsed.map((entry) => row(entry, false));
  const seen = new Set<string>();
  const eligible = new Map<string, string>();
  for (const entry of rows) {
    identity(entry, vaultId);
    const id = entry.id as string;
    if (seen.has(id)) return bad();
    seen.add(id);
    if (!configured.includes(id)) continue;
    const origin = websiteOrigin(entry.urls);
    if (origin !== undefined) eligible.set(id, origin);
  }
  return eligible;
}

export function parseDetail(bytes: Uint8Array, vaultId: string, itemId: string, policy: CredentialPolicy): string {
  const detail = row(parseProviderJson(bytes, 1_048_576), true);
  identity(detail, vaultId, itemId);
  if (detail.state === 'DELETED') throw new BackendError('not-found');
  if (Object.hasOwn(detail, 'state') && detail.state !== 'ACTIVE' && detail.state !== 'ARCHIVED') return bad();
  if (websiteOrigin(detail.urls) !== policy.canonicalOrigin) return bad();
  const candidates = ((detail.fields ?? []) as ObjectValue[])
    .filter((field) => field.id === 'password' || field.purpose === 'PASSWORD');
  if (candidates.length === 0) throw new BackendError('not-found');
  if (candidates.length !== 1) return bad();
  const selected = candidates[0];
  if (selected.id !== 'password' || selected.type !== 'CONCEALED' || selected.purpose !== 'PASSWORD') return bad();
  if (selected.value === undefined || selected.value === '') throw new BackendError('not-found');
  const value = selected.value as string;
  if (value.length > 4096 || /[\r\n]/u.test(value)) return overflow();
  return value;
}

export function parseProbe(bytes: Uint8Array): void {
  const keys = ['id', 'name', 'email', 'type', 'state', 'created_at', 'updated_at', 'last_auth_at'];
  const probe = object(parseProviderJson(bytes, 16_384), keys);
  strings(probe, keys);
  if (!/^[A-Z0-9]{26}$/u.test(probe.id as string) || probe.type !== 'SERVICE_ACCOUNT' || probe.state !== 'ACTIVE') bad();
}

export function parseVersion(bytes: Uint8Array): void {
  try {
    if (bytes.byteLength > 16_384) overflow();
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) overflow();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/gu, '') !== '2.39.0') overflow();
  } catch { throw new BackendError('unavailable'); }
}
