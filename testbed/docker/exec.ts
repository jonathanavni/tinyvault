import { assertPinned, DockerPreflightError, type PinnedDockerEndpoint } from './preflight';

// Slice-3 scaffolding: this module has no production importer yet.

export type DockerCommand = never;
export type DockerSpawn = Readonly<{
  file: string; args: readonly string[]; env: Readonly<Record<string, string>>;
}>;

export function buildDockerSpawn(pin: PinnedDockerEndpoint, command: DockerCommand): DockerSpawn {
  assertPinned(pin);
  // Slice 2 has no executable variants. This inert description never consumes caller argv.
  // Slice 3 must construct arguments here from its closed command variants.
  void command;
  const args: string[] = [];
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.DOCKER_HOST = pin.dockerHost;
  delete env.DOCKER_CONTEXT;
  delete env.DOCKER_CONFIG;
  // NOT gated in slice 2: zero executable variants can reach this assertion with a
  // selecting token. Its deletion mutant is deferred to slice 3 (R2-4).
  if (args.some((arg) => /^(?:-H|-c|--host(?:=|$)|--context(?:=|$))/.test(arg))) {
    throw new DockerPreflightError('endpoint-argument', 'Docker argv cannot select an endpoint.');
  }
  return Object.freeze({ file: 'docker', args: Object.freeze(args), env: Object.freeze(env) });
}

export async function runDockerCommand(pin: PinnedDockerEndpoint, command: DockerCommand): Promise<never> {
  assertPinned(pin);
  void command;
  throw new DockerPreflightError('not-implemented', 'Docker execution is not implemented until slice 3.');
}
