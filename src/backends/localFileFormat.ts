import { validateBareOrigin } from '../core/originGuard';
import type { CredentialPolicy, FieldRole, Handle, Origin } from '../core/types';
import { LOCAL_NONCE_BYTES, LOCAL_TAG_BYTES } from './localFileSodium';

export type LocalVaultFile = Readonly<{
  version: 1;
  records: readonly LocalVaultRecord[];
}>;

export type LocalVaultRecord = Readonly<{
  handle: Handle;
  label: string;
  kind: 'password';
  account?: string;
  canonicalOrigin: Origin;
  fieldRecipe: readonly FieldRole[];
  sealed: Readonly<{ nonce: string; ciphertext: string }>;
}>;

export const INVALID_LOCAL_VAULT_MESSAGE = 'Invalid local vault file';

const HANDLE_PATTERN = /^vh_[0-9a-f]{32}$/u;
const PADDED_STANDARD_BASE64_PATTERN
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const FIELD_ROLES = new Set<FieldRole>(['username', 'password', 'totp']);

export function encodeAdditionalData(
  handle: Handle,
  policy: Readonly<{ canonicalOrigin: Origin; fieldRecipe: readonly FieldRole[] }>,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    handle,
    policy.canonicalOrigin,
    policy.fieldRecipe,
  ]));
}

export function parseLocalVaultBytes(bytes: Uint8Array): LocalVaultFile {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return validateLocalVaultFile(JSON.parse(text));
}

export function validateLocalVaultFile(input: unknown): LocalVaultFile {
  if (!isObject(input)
    || !hasExactKeys(input, ['version', 'records'])
    || input.version !== 1
    || !Array.isArray(input.records)) return invalidVault();

  const handles = new Set<string>();
  const records = input.records.map((record) => validateRecord(record, handles));
  return Object.freeze({ version: 1, records: Object.freeze(records) });
}

function validateRecord(input: unknown, handles: Set<string>): LocalVaultRecord {
  if (!isObject(input)
    || !hasExactKeys(input, [
      'handle',
      'label',
      'kind',
      'canonicalOrigin',
      'fieldRecipe',
      'sealed',
    ], ['account'])
    || typeof input.handle !== 'string'
    || !HANDLE_PATTERN.test(input.handle)
    || handles.has(input.handle)
    || typeof input.label !== 'string'
    || input.kind !== 'password'
    || (Object.hasOwn(input, 'account') && typeof input.account !== 'string')
    || typeof input.canonicalOrigin !== 'string'
    || !Array.isArray(input.fieldRecipe)
    || input.fieldRecipe.length === 0
    || !input.fieldRecipe.every((role): role is FieldRole =>
      typeof role === 'string' && FIELD_ROLES.has(role as FieldRole))
    || new Set(input.fieldRecipe).size !== input.fieldRecipe.length
    || !isObject(input.sealed)
    || !hasExactKeys(input.sealed, ['nonce', 'ciphertext'])
    || typeof input.sealed.nonce !== 'string'
    || typeof input.sealed.ciphertext !== 'string') return invalidVault();

  let normalizedOrigin: Origin;
  try {
    normalizedOrigin = validateBareOrigin(input.canonicalOrigin);
  } catch {
    return invalidVault();
  }
  if (normalizedOrigin !== input.canonicalOrigin) return invalidVault();

  const nonce = decodeCanonicalBase64(input.sealed.nonce);
  const ciphertext = decodeCanonicalBase64(input.sealed.ciphertext);
  if (nonce.length !== LOCAL_NONCE_BYTES || ciphertext.length < LOCAL_TAG_BYTES) return invalidVault();

  handles.add(input.handle);
  const recipe = Object.freeze([...input.fieldRecipe]);
  const sealed = Object.freeze({
    nonce: input.sealed.nonce,
    ciphertext: input.sealed.ciphertext,
  });
  const record = {
    handle: input.handle,
    label: input.label,
    kind: 'password' as const,
    ...(Object.hasOwn(input, 'account') ? { account: input.account as string } : {}),
    canonicalOrigin: normalizedOrigin,
    fieldRecipe: recipe,
    sealed,
  };
  return Object.freeze(record);
}

export function decodeCanonicalBase64(value: string): Uint8Array {
  if (value.length === 0
    || !PADDED_STANDARD_BASE64_PATTERN.test(value)
    || value.length % 4 !== 0) return invalidVault();
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) return invalidVault();
  return decoded;
}

export function isValidLocalHandle(handle: Handle): boolean {
  return typeof handle === 'string' && HANDLE_PATTERN.test(handle);
}

export function policyFromRecord(record: LocalVaultRecord): CredentialPolicy {
  return Object.freeze({
    canonicalOrigin: record.canonicalOrigin,
    fieldRecipe: Object.freeze([...record.fieldRecipe]),
  }) as CredentialPolicy;
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  if (!required.every((key) => Object.hasOwn(value, key))) return false;
  const allowed = new Set([...required, ...optional]);
  return keys.every((key) => allowed.has(key));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidVault(): never {
  throw new Error(INVALID_LOCAL_VAULT_MESSAGE);
}
