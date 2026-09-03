import { describe, expect, it, vi } from 'vitest';

import { startFixtures, type LoginFixture } from '.';

describe('fixture-set partial-start cleanup', () => {
  it('closes every already-started fixture and rethrows a later startup failure', async () => {
    const close = vi.fn(async () => undefined);
    const fixture = { close } as unknown as LoginFixture;
    await expect(startFixtures('/unused', [
      ['benign-login', async () => fixture],
      ['lookalike-origin', async () => { throw new Error('second fixture failed'); }],
    ])).rejects.toThrow('second fixture failed');
    expect(close).toHaveBeenCalledOnce();
  });
});
