// Reviewed root of trust; the deliberate Docker-required exception, never used by make test.
export default {
  test: { include: ['testbed/docker/composed.docker.test.ts'] },
};
