import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type { SupervisedHost } from '../../supervisor/host';
import { matchesSchema } from '../../agents/loop';
import { createProtocol, type Protocol, type ServeReason } from './protocol';
import { callTool, TOOLS } from './tools';

export function createServer(host: SupervisedHost, options: {
  version: string; onInternalError?: () => void; onOutputError?: () => void;
} = { version: JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version }): Protocol {
  const onInternalError = options.onInternalError ?? (() => undefined);
  return createProtocol({ ...options, tools: TOOLS, matchesSchema,
    dispatch: (name, args) => callTool(host, name, args, onInternalError), onInternalError });
}

export function serve(server: Protocol, input: Readable, output: Writable): Promise<ServeReason> {
  return server.serve(input, output);
}
