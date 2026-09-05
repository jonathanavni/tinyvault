// Daemon-returned image values must fail at image inspection, before container creation or exec.
import { expect, it, vi } from 'vitest';
import { createComposedProject } from './compose';
import { fakeProject, imageDocument, kindOf } from './compose.testkit';
it.each(['-H', 'sha256:' + 'F'.repeat(64), 'sha256:' + 'f'.repeat(64) + '\n'])(
  'rejects malformed image id %j with otherwise valid image fields', async (Id) => {
    const h = await fakeProject(vi.fn, { result: (kind) => kind === 'image-inspect'
      ? { stdout: JSON.stringify([{ ...imageDocument, Id }]), stderr: '', exitCode: 0 } : undefined });
    try {
      await expect(createComposedProject(h.options)).rejects.toMatchObject({ code: 'image-inspect' });
      expect(h.spawns.some((spawn) => kindOf(spawn) === 'compose-up')).toBe(false);
      expect(h.spawns.some((spawn) => kindOf(spawn) === 'exec-bridge')).toBe(false);
      expect(h.spawns.filter((spawn) => kindOf(spawn) === 'compose-down')).toHaveLength(1);
    } finally { await h.dispose(); }
  },
);
