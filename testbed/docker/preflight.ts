import {
  BUILT_IN_DEFAULT_ENDPOINT, resolveSources, type DockerEnvironment, type FileReader,
} from './context';
import { hasEdgeWhitespace, parseUnixEndpoint } from './endpoint';

export class DockerPreflightError extends Error {
  constructor(readonly code: string, message: string = code) {
    super(message);
    this.name = 'DockerPreflightError';
  }
}

const pins = new WeakSet<object>();
let mintPin: (socketPath: string) => PinnedDockerEndpoint;

export class PinnedDockerEndpoint {
  readonly #socketPath: string;

  private constructor(socketPath: string) {
    this.#socketPath = socketPath;
    Object.freeze(this);
  }

  static {
    // Only this module-local closure records provenance; even calling the constructor cannot mint a pin.
    mintPin = (socketPath) => {
      const pin = new PinnedDockerEndpoint(socketPath);
      pins.add(pin);
      return pin;
    };
  }

  get dockerHost(): string { return `unix://${this.#socketPath}`; }
  get socketPath(): string { return this.#socketPath; }
}

Object.freeze(PinnedDockerEndpoint.prototype);

export function assertPinned(value: unknown): asserts value is PinnedDockerEndpoint {
  if (typeof value !== 'object' || value === null || !pins.has(value)) {
    throw new DockerPreflightError('unpinned', 'Docker endpoint was not minted by preflight.');
  }
}

export type PreflightDeps = Readonly<{
  env: DockerEnvironment; files: FileReader;
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ isSocket(): boolean }>;
}>;

function socketPath(raw: string): string {
  const parsed = parseUnixEndpoint(raw);
  if (!parsed.ok) throw new DockerPreflightError(`endpoint-${parsed.reason}`, parsed.detail);
  return parsed.socketPath;
}

async function canonicalPath(path: string, deps: PreflightDeps): Promise<string> {
  let resolved: string;
  try { resolved = await deps.realpath(path); }
  catch { throw new DockerPreflightError('realpath-failed', 'Cannot resolve the socket path.'); }
  if (hasEdgeWhitespace(resolved)) {
    throw new DockerPreflightError('endpoint-edge-whitespace', 'Resolved socket path has edge whitespace.');
  }
  return resolved;
}

async function requireSocket(path: string, deps: PreflightDeps): Promise<void> {
  let isSocket: boolean;
  try { isSocket = (await deps.stat(path)).isSocket(); }
  catch { throw new DockerPreflightError('stat-failed', 'Cannot stat the resolved socket path.'); }
  if (!isSocket) throw new DockerPreflightError('not-socket', 'The resolved path must be a Unix socket.');
  // B5a: S_ISSOCK does not establish a live listener; liveness failure is deferred to slice 3.
}

// The pin certifies preflight provenance, not filesystem truth: trusted harness modules can
// inject realpath/stat to mint a genuine pin for an arbitrary path.
export async function dockerPreflight(deps: PreflightDeps): Promise<PinnedDockerEndpoint> {
  const sources = await resolveSources(deps.env, deps.files);
  if (!sources.ok) throw new DockerPreflightError(`source-${sources.reason}`);
  const paths = sources.usedBuiltInDefault
    ? [socketPath(BUILT_IN_DEFAULT_ENDPOINT)]
    : sources.explicit.map(({ raw }) => socketPath(raw));
  const resolved: string[] = [];
  for (const path of paths) resolved.push(await canonicalPath(path, deps));
  if (new Set(resolved).size > 1) {
    throw new DockerPreflightError('ambiguous', 'Explicit Docker sources resolve to different paths.');
  }
  await requireSocket(resolved[0], deps);
  return mintPin(resolved[0]);
}
