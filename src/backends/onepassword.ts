import { randomBytes } from 'node:crypto';
import { Secret } from '../core/redaction';
import type { CredentialPolicy, Handle, ItemMeta } from '../core/types';
import { BackendError, type BackendStatus, type CredentialBackend } from './backend';
import { readServiceToken, validateOnePasswordConfig } from './onepasswordConfig';
import { parseDetail, parseList, parseProbe, parseVersion } from './onepasswordMetadata';
import { createOnePasswordProcess, type Operation, type Command } from './onepasswordProcess';

type Entry = Readonly<{ itemId: string; label: string; handle: Handle }>;
type Snapshot = Readonly<{ items: readonly ItemMeta[]; policies: Map<Handle, CredentialPolicy> }>;

/** Single immutable record map and first successful discovery snapshot; no credential cache. */
export function createOnePasswordBackend(options: unknown): CredentialBackend {
  if (Object.hasOwn(process.env, 'OP_SERVICE_ACCOUNT_TOKEN')) throw new BackendError('unavailable');
  const config = validateOnePasswordConfig(options);
  const runner = createOnePasswordProcess(config);
  const entries = new Map<Handle, Entry>();
  for (const item of config.items) {
    let handle: Handle;
    do { handle = `vh_${randomBytes(24).toString('base64url')}`; } while (entries.has(handle));
    entries.set(handle, Object.freeze({ ...item, handle }));
  }
  let fingerprint: string | undefined;
  let authChanged = false;
  let versionChecked = false;
  let versionPending: Promise<void> | undefined;
  let discoveryPending: Promise<void> | undefined;
  let snapshot: Snapshot | undefined;
  let closed = false;
  async function version(operation: Operation): Promise<void> {
    if (versionChecked) return;
    if (versionPending === undefined) {
      versionPending = (async () => {
        let bytes: Buffer | undefined;
        try {
          bytes = await runner.run(operation, 'version');
          operation.check();
          parseVersion(bytes);
          versionChecked = true;
        } finally { bytes?.fill(0); }
      })();
    }
    try { await versionPending; operation.check(); }
    finally { versionPending = undefined; }
  }
  async function authenticated<T>(operation: Operation, command: Command, use: (bytes: Buffer) => T, itemId?: string): Promise<T> {
    operation.check();
    if (authChanged) throw new BackendError('locked');
    let authentication: Awaited<ReturnType<typeof readServiceToken>> | undefined;
    let bytes: Buffer | undefined;
    try {
      authentication = await readServiceToken(config.tokenPath);
      operation.check();
      if (authChanged) throw new BackendError('locked');
      if (fingerprint === undefined) fingerprint = authentication.fingerprint;
      else if (fingerprint !== authentication.fingerprint) {
        authChanged = true;
        throw new BackendError('locked');
      }
      await version(operation);
      operation.check();
      bytes = await runner.run(operation, command, authentication.token, itemId);
      operation.check();
      return use(bytes);
    } finally {
      bytes?.fill(0);
      bytes = undefined;
      authentication = undefined;
    }
  }
  async function discover(operation: Operation): Promise<void> {
    if (snapshot !== undefined) return;
    if (discoveryPending === undefined) {
      discoveryPending = authenticated(operation, 'list', (bytes) => {
        const origins = parseList(bytes, config.vaultId, config.items.map((item) => item.itemId));
        const policies = new Map<Handle, CredentialPolicy>();
        const items: ItemMeta[] = [];
        for (const entry of entries.values()) {
          const canonicalOrigin = origins.get(entry.itemId);
          if (canonicalOrigin === undefined) continue;
          const fieldRecipe: CredentialPolicy['fieldRecipe'] = ['password'];
          Object.freeze(fieldRecipe);
          policies.set(entry.handle, Object.freeze({ canonicalOrigin, fieldRecipe }));
          items.push(Object.freeze({ handle: entry.handle, label: entry.label, kind: 'password', available: true }));
        }
        operation.check();
        snapshot = Object.freeze({ items: Object.freeze(items), policies });
      });
    }
    try { await discoveryPending; operation.check(); }
    finally { discoveryPending = undefined; }
  }
  function entryFor(handle: Handle): Entry {
    const entry = entries.get(handle);
    if (entry === undefined) throw new BackendError('not-found');
    return entry;
  }
  function policyFor(handle: Handle): CredentialPolicy {
    const policy = snapshot?.policies.get(handle);
    if (policy === undefined) throw new BackendError('not-found');
    return policy;
  }
  async function probeAvailability(): Promise<BackendStatus> {
    try {
      return await runner.method(async (operation) => {
        if (await runner.executable() === 'missing') return Object.freeze({ available: false, reason: 'not_installed' });
        operation.check();
        await authenticated(operation, 'probe', parseProbe);
        return Object.freeze({ available: true });
      });
    } catch (error) {
      return Object.freeze({ available: false, reason: error instanceof BackendError && error.kind === 'locked'
        ? 'not_authenticated' : 'error' });
    }
  }
  async function listItems(): Promise<readonly ItemMeta[]> {
    return runner.method(async (operation) => {
      await discover(operation);
      operation.check();
      return snapshot!.items;
    });
  }
  async function resolvePolicy(handle: Handle): Promise<CredentialPolicy> {
    return runner.method(async (operation) => {
      entryFor(handle);
      await discover(operation);
      operation.check();
      return policyFor(handle);
    });
  }
  async function resolveSecret(handle: Handle, authorizedPolicy: CredentialPolicy): Promise<Secret> {
    return runner.method(async (operation) => {
      const entry = entryFor(handle);
      const policy = policyFor(handle);
      if (!samePolicy(policy, authorizedPolicy)) throw new BackendError('integrity');
      return authenticated(operation, 'detail', (bytes) => {
        let value: string | undefined;
        try {
          value = parseDetail(bytes, config.vaultId, entry.itemId, policy);
          operation.check();
          return new Secret(value);
        } finally { value = undefined; }
      }, entry.itemId);
    });
  }
  async function dispose(): Promise<void> {
    if (!closed) {
      closed = true;
      entries.clear();
      snapshot = undefined;
      fingerprint = undefined;
      discoveryPending = undefined;
      versionPending = undefined;
    }
    await runner.dispose();
  }
  return Object.freeze({ probeAvailability, listItems, resolvePolicy, resolveSecret, dispose });
}

function samePolicy(expected: CredentialPolicy, actual: CredentialPolicy): boolean {
  try {
    return actual.canonicalOrigin === expected.canonicalOrigin && Array.isArray(actual.fieldRecipe)
      && actual.fieldRecipe.length === 1 && actual.fieldRecipe[0] === 'password';
  } catch { return false; }
}
