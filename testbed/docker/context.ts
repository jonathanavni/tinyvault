import { createHash } from 'node:crypto';
import { join } from 'node:path';

export type DockerEnvironment = Readonly<Partial<Record<'DOCKER_HOST'|'DOCKER_CONTEXT'|'DOCKER_CONFIG'|'HOME', string>>>;
export type FileReader = Readonly<{ readFile(path: string): Promise<string | undefined> }>;
export type EndpointSource = 'DOCKER_HOST' | 'DOCKER_CONTEXT' | 'active-context';
export type ResolvedSource = Readonly<{ source: EndpointSource; raw: string }>;
export type SourceResolution =
  | { readonly ok: true; readonly explicit: readonly ResolvedSource[]; readonly usedBuiltInDefault: boolean }
  | { readonly ok: false; readonly reason: string };
export const BUILT_IN_DEFAULT_ENDPOINT = 'unix:///var/run/docker.sock';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(files: FileReader, path: string, kind: 'config' | 'context') {
  let text: string | undefined;
  try { text = await files.readFile(path); }
  catch { throw new Error(`${kind}-read`); }
  if (text === undefined) return undefined;
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${kind}-json`); }
  if (!isRecord(value)) throw new Error(`${kind}-shape`);
  return value;
}

async function activeContext(root: string | undefined, files: FileReader): Promise<string | undefined> {
  if (!root) return undefined;
  const config = await readJson(files, join(root, 'config.json'), 'config');
  if (!config || !Object.hasOwn(config, 'currentContext')) return undefined;
  if (typeof config.currentContext !== 'string') throw new Error('config-current-context');
  return config.currentContext || undefined;
}

async function contextEndpoint(name: string, root: string | undefined, files: FileReader): Promise<string> {
  if (name === 'default') return BUILT_IN_DEFAULT_ENDPOINT;
  if (!root) throw new Error('context-directory');
  const digest = createHash('sha256').update(name).digest('hex');
  const meta = await readJson(files, join(root, 'contexts', 'meta', digest, 'meta.json'), 'context');
  if (!meta) throw new Error('context-missing');
  const endpoints = meta.Endpoints;
  const docker = isRecord(endpoints) ? endpoints.docker : undefined;
  const host = isRecord(docker) ? docker.Host : undefined;
  if (typeof host !== 'string' || host === '') throw new Error('context-host');
  return host;
}

export async function resolveSources(env: DockerEnvironment, files: FileReader): Promise<SourceResolution> {
  const { DOCKER_HOST: host, DOCKER_CONTEXT: context, DOCKER_CONFIG: config, HOME: home } = env;
  const root = config || (home ? join(home, '.docker') : undefined);
  const explicit: ResolvedSource[] = [];
  try {
    if (host) explicit.push({ source: 'DOCKER_HOST', raw: host });
    if (context) explicit.push({ source: 'DOCKER_CONTEXT', raw: await contextEndpoint(context, root, files) });
    const active = await activeContext(root, files);
    if (active) explicit.push({ source: 'active-context', raw: await contextEndpoint(active, root, files) });
    return { ok: true, explicit, usedBuiltInDefault: explicit.length === 0 };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'source-resolution' };
  }
}
