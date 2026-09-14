import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { BackendError } from './backend';

export type OnePasswordConfig = Readonly<{
  opPath: string;
  tokenPath: string;
  vaultId: string;
  items: readonly Readonly<{ itemId: string; label: string }>[];
}>;

export function isRecordId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{26}$/u.test(value);
}

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function validateOnePasswordConfig(value: unknown): OnePasswordConfig {
  try {
    if (!exactKeys(value, ['opPath', 'tokenPath', 'vaultId', 'items'])) throw new Error();
    const { opPath, tokenPath, vaultId, items } = value;
    if (typeof opPath !== 'string' || !isAbsolute(opPath) || opPath.includes('\0')
      || typeof tokenPath !== 'string' || !isAbsolute(tokenPath) || tokenPath.includes('\0')
      || !isRecordId(vaultId) || !Array.isArray(items) || items.length < 1 || items.length > 64) {
      throw new Error();
    }
    const seen = new Set<string>();
    const entries = items.map((item: unknown) => {
      if (!exactKeys(item, ['itemId', 'label']) || !isRecordId(item.itemId)
        || typeof item.label !== 'string' || item.label.length < 1 || item.label.length > 128
        || /[\u0000-\u001f\u007f-\u009f]/u.test(item.label) || seen.has(item.itemId)) throw new Error();
      seen.add(item.itemId);
      return Object.freeze({ itemId: item.itemId, label: item.label });
    });
    return Object.freeze({ opPath, tokenPath, vaultId, items: Object.freeze(entries) });
  } catch {
    throw new BackendError('unavailable');
  }
}

/** Operation-owned only. The caller drops the string after its authenticated operation. */
export async function readServiceToken(tokenPath: string): Promise<{ token: string; fingerprint: string }> {
  let bytes: Buffer | undefined;
  let descriptor: Awaited<ReturnType<typeof open>> | undefined;
  try {
    try {
      descriptor = await open(tokenPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        throw new BackendError('locked');
      }
      throw new BackendError('unavailable');
    }
    const info = await descriptor.stat();
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0
      || info.size > 16_384) throw new BackendError('unavailable');
    bytes = Buffer.alloc(16_385);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await descriptor.read(bytes, used, bytes.length - used, null);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used === 0) throw new BackendError('locked');
    if (used > 16_384) throw new BackendError('unavailable');
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new BackendError('unavailable');
    let token = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used));
    if (token.endsWith('\n')) token = token.slice(0, -1);
    if (token.length === 0) throw new BackendError('locked');
    if (/\s|\p{Cc}/u.test(token)) throw new BackendError('unavailable');
    return { token, fingerprint: createHash('sha256').update(token).digest('hex') };
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError('unavailable');
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) {
      try { await descriptor.close(); } catch { throw new BackendError('unavailable'); }
    }
  }
}
