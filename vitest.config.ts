// Reviewed root of trust; default discovery and unconditional runtime guard.
import { configDefaults } from 'vitest/config';
export default {
  test: {
    setupFiles: ['./testbed/docker/no-docker.setup.ts'],
    exclude: [...configDefaults.exclude, 'testbed/docker/composed.docker.test.ts'],
  },
};
