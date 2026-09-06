// Exact bounded snapshots and harness-chosen persistence; no remote path enters filesystem operations.
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { UnauthorizedRequest } from '../fixtures/transport';
import { ComposedConstructionError } from './exec';
import { canonicalInteger, decodeBase64url, validateBody } from './handshake';
import { BridgeError, MAX_CAPTURE_BYTES, RUN_ID_PATTERN, type Body } from './protocol';

export async function receiveCapture(read: (offset: string) => Promise<Body>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let offset = 0;
  let total: number | undefined;
  do {
    const body = await read(String(offset));
    validateBody('capture', 'res', body);
    const bytes = decodeBase64url(body.bytes as string, undefined, 'body-shape');
    const size = canonicalInteger(body.total as string);
    const next = canonicalInteger(body.next as string);
    if ((total !== undefined && total !== size) || next !== offset + bytes.length
      || next > size || (bytes.length === 0 && offset !== size)) throw new BridgeError('body-shape');
    total = size;
    chunks.push(bytes);
    offset = next;
  } while (offset !== total);
  return Buffer.concat(chunks, total);
}

export function parseUnauthorizedCapture(bytes: Uint8Array): readonly UnauthorizedRequest[] {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!text) return [];
    if (!text.endsWith('\n')) throw new Error();
    return text.slice(0, -1).split('\n').map((line) => {
      const record: unknown = JSON.parse(line);
      if (!record || typeof record !== 'object' || Array.isArray(record)
        || Object.keys(record).length !== 2 || !Object.hasOwn(record, 'route') || !Object.hasOwn(record, 'body')
        || typeof (record as UnauthorizedRequest).route !== 'string'
        || typeof (record as UnauthorizedRequest).body !== 'string'
        || JSON.stringify(record) !== line) throw new Error();
      const { route, body } = record as UnauthorizedRequest;
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(route) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(body)) throw new Error();
      return { route, body };
    });
  } catch { throw new BridgeError('body-shape'); }
}

async function refuseDestination(path: string): Promise<void> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export async function persistFixtureCapture(artifactRoot: string, runId: string, capture: Uint8Array): Promise<void> {
  let temporary: string | undefined;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)
      || !(capture instanceof Uint8Array) || capture.byteLength > MAX_CAPTURE_BYTES) throw new Error();
    const bytes = Buffer.from(capture);
    const directory = join(artifactRoot, 'fixture-captures');
    await mkdir(directory, { recursive: true });
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error();
    const destination = join(directory, `${runId}.requests`);
    await refuseDestination(destination);
    const candidate = join(directory, `.${runId}-${randomBytes(16).toString('hex')}.tmp`);
    handle = await open(candidate, 'wx', 0o600);
    temporary = candidate;
    let written = 0;
    while (written < bytes.length) {
      const result = await handle.write(bytes, written, bytes.length - written, written);
      if (result.bytesWritten <= 0 || result.bytesWritten > bytes.length - written) throw new Error();
      written += result.bytesWritten;
    }
    await handle.close(); handle = undefined;
    await refuseDestination(destination);
    await rename(temporary, destination);
    temporary = undefined;
  } catch { throw new ComposedConstructionError('capture-write'); }
  finally {
    await handle?.close().catch(() => {});
    if (temporary) await unlink(temporary).catch(() => {});
  }
}
