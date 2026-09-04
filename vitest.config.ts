// Keep Vitest's default discovery and CLI exclusions; register only the runtime guard.
export default {
  test: { setupFiles: ['./testbed/docker/no-docker.setup.ts'] },
};
