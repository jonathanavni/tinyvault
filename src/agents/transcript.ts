import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { CapturedEvent } from '../../testbed/scorecard.schema';

export type TranscriptKind = 'request' | 'response' | 'tool_exec' | 'meta';

export type TranscriptRecord = {
  sequence: number;
  kind: TranscriptKind;
  /** Exact JSON bytes of the request/response/tool execution/meta payload. */
  bytes: string;
};

export type CapturedEventInput = Omit<CapturedEvent, 't'> & { t?: number };

export type EventIdentity = Pick<CapturedEvent, 'channel' | 'direction'> & Partial<Pick<
  CapturedEvent,
  'initiator' | 'frameId' | 'documentId' | 'requestId'
>>;

export function eventIdentityMatches(
  event: CapturedEventInput,
  expected: EventIdentity,
): boolean {
  return event.channel === expected.channel
    && event.direction === expected.direction
    && optionalMatches(event.initiator, expected.initiator)
    && optionalMatches(event.frameId, expected.frameId)
    && optionalMatches(event.documentId, expected.documentId)
    && optionalMatches(event.requestId, expected.requestId);
}

export function serializeExact(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Transcript values must be JSON-serializable');
  }
  return serialized;
}

export function serializeToolCallEnvelope(call: {
  id: string;
  name: string;
  input: unknown;
}): string {
  return serializeExact({ id: call.id, name: call.name, input: call.input });
}

export function serializeModelResponseEnvelope(response: unknown): string {
  return serializeExact(response);
}

/**
 * Append-only within a run. `create` owns fresh per-run paths; after creation no
 * transcript byte is rewritten. The future Anthropic client uses this same sink.
 */
export class TranscriptWriter {
  private readonly events: CapturedEvent[] = [];
  private sequence = 0;
  private closed = false;

  private constructor(
    readonly transcriptPath: string,
    readonly eventsPath: string,
  ) {}

  static async create(transcriptPath: string, eventsPath: string): Promise<TranscriptWriter> {
    await Promise.all([
      mkdir(dirname(transcriptPath), { recursive: true }),
      mkdir(dirname(eventsPath), { recursive: true }),
    ]);
    await Promise.all([writeFile(transcriptPath, ''), writeFile(eventsPath, '[]\n')]);
    return new TranscriptWriter(transcriptPath, eventsPath);
  }

  async append(
    kind: TranscriptKind,
    value: unknown,
    captured: CapturedEventInput[] = [],
  ): Promise<string> {
    return this.appendSerialized(kind, serializeExact(value), captured);
  }

  async appendSerialized(
    kind: TranscriptKind,
    bytes: string,
    captured: CapturedEventInput[] = [],
  ): Promise<string> {
    this.assertOpen();
    const record: TranscriptRecord = { sequence: this.sequence, kind, bytes };
    this.sequence += 1;
    await appendFile(this.transcriptPath, `${JSON.stringify(record)}\n`);
    for (const event of captured) this.capture(event);
    return bytes;
  }

  capture(event: CapturedEventInput): void {
    this.assertOpen();
    this.events.push({ ...event, t: event.t ?? this.events.length });
  }

  #snapshotEvents(): CapturedEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  async close(): Promise<CapturedEvent[]> {
    this.assertOpen();
    this.closed = true;
    const snapshot = this.#snapshotEvents();
    await writeFile(this.eventsPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    return snapshot;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('TranscriptWriter is closed');
  }
}

function optionalMatches(actual: string | undefined, expected: string | undefined): boolean {
  return expected === undefined || actual === expected;
}
