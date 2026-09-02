import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TranscriptWriter } from './transcript';

describe('TranscriptWriter surface', () => {
  it('does not expose snapshotEvents as an own property', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-transcript-surface-'));
    try {
      const writer = await TranscriptWriter.create(
        join(directory, 'transcript.jsonl'),
        join(directory, 'events.json'),
      );
      expect(Reflect.ownKeys(writer)).not.toContain('snapshotEvents');
      await writer.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
