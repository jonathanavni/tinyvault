import { mkdtemp, rm, open, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runAgentLoop } from './loop';
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

// These use real disk appends and the loop's actual failure/afterLoop path.
describe('durable transcript failure sequences', () => {
  it.each(['sync', 'close', 'writeFile'] as const)('keeps subsequent diagnostic sequences contiguous after %s failure', async failure => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-durable-sequence-'));
    const writer = await TranscriptWriter.create(join(directory, 'transcript.jsonl'), join(directory, 'events.json'));
    const handle = await open(writer.transcriptPath, 'a');
    const prototype = Object.getPrototypeOf(handle); await handle.close();
    const invoke = failure === 'close' ? undefined : vi.spyOn(prototype, failure).mockRejectedValueOnce(new Error(`injected ${failure}`));
    let closeSpy: ReturnType<typeof vi.spyOn> | undefined;
    if (failure === 'close') {
      // FileHandle.close is an own property. Intercept the acquired descriptor via its write method.
      const originalWrite = prototype.writeFile;
      closeSpy = vi.spyOn(prototype, 'writeFile').mockImplementationOnce(async function(this: any, ...args: any[]) {
        const result = await originalWrite.apply(this, args);
        const originalClose = this.close.bind(this);
        this.close = async () => { await originalClose(); throw new Error('injected close'); };
        return result;
      });
    }
    try {
      await expect(runAgentLoop({
        client: { nextTurn: async () => { await writer.appendDurable('sdk-request', '{"request":true}'); return {}; } },
        messages: [], executeTool: () => ({ result: null }), transcript: writer,
        afterLoop: async () => [{ channel: 'model-text', direction: 'internal', initiator: 'diagnostic', bytes: 'settled' }],
      })).rejects.toThrow(`injected ${failure}`);
      const records = (await readFile(writer.transcriptPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      expect(records.map(record => record.sequence)).toEqual(records.map((_, index) => index));
      expect(records.some(record => record.kind === 'sdk-request')).toBe(failure !== 'writeFile');
      expect(JSON.parse(records.at(-1).bytes)).toEqual({ event: 'post-loop-drain' });
      expect(await readFile(writer.eventsPath, 'utf8')).toContain('settled');
    } finally { invoke?.mockRestore(); closeSpy?.mockRestore(); await rm(directory, { recursive: true, force: true }); }
  });
});
