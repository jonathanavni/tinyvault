import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TranscriptWriter } from './transcript';

describe('TranscriptWriter surface', () => {
  it('does not expose the #snapshotEvents capability on the instance or prototype', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-transcript-surface-'));
    try {
      const writer = await TranscriptWriter.create(
        join(directory, 'transcript.jsonl'),
        join(directory, 'events.json'),
      );
      expect(Reflect.ownKeys(writer)).not.toContain('snapshotEvents');
      expect(Reflect.ownKeys(Object.getPrototypeOf(writer))).not.toContain('snapshotEvents');
      // @ts-expect-error snapshotEvents is an ECMAScript-private method, not a TypeScript-private property.
      expect(writer.snapshotEvents).toBeUndefined();
      await writer.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
