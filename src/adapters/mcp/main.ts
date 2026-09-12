import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { createLocalFileBackend } from '../../backends/localFile';
import { createSupervisedHost, type SupervisedHost } from '../../supervisor/host';
import { createServer, serve } from './server';
import type { Protocol } from './protocol';

export const SHUTDOWN_HANDLER_DEADLINE_MS = 30_000;
type Runtime = {
  env: NodeJS.ProcessEnv; stdin: Readable; stdout: Writable; stderr: Writable;
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
  exit(code: number): unknown;
};
const priority = [0, 5, 3, 6, 4];

/** One invocation is one process lifetime. Tests inject streams and process events. */
export async function start(runtime: Runtime = process): Promise<number> {
  let host: SupervisedHost | undefined;
  let server: Protocol | undefined;
  let code = 0;
  let stopping = false;
  let exited = false;
  let aborting = false;
  let finalizing: Promise<void> | undefined;
  let releaseAbort!: () => void;
  const aborted = new Promise<void>(resolveAbort => { releaseAbort = resolveAbort; });
  let finish!: () => void;
  const done = new Promise<void>(resolveDone => { finish = resolveDone; });
  const observe = (next: number) => { if (priority.indexOf(next) > priority.indexOf(code)) code = next; };
  const diagnostic = () => { try { runtime.stderr.write('tinyvault-mcp: internal error\n'); } catch { /* Closed stderr. */ } };
  const abort = () => {
    aborting = true; releaseAbort();
    server?.cancelHandler();
    try { host?.abort(); } catch { observe(3); }
  };
  const finalize = async () => {
    try {
      server?.stopAdmission();
      if (!aborting && server && !await Promise.race([server.drainHandler(SHUTDOWN_HANDLER_DEADLINE_MS), aborted.then(() => false)])) {
        observe(3); abort();
      }
      if (!aborting) {
        const settleAndDrain = async () => { await host!.settleEvidence(); host!.drainEvidence(); };
        await host!.quiesceEvidenceProducers!({ beforeClose: settleAndDrain,
          afterClose: settleAndDrain, settleTimeoutMs: 0 });
        if (!aborting) host!.finish();
      }
    } catch { observe(3); abort(); }
    finally {
      try { await host!.closeAll(); } catch { observe(3); abort(); }
      if (!aborting) await Promise.race([server?.flush(), aborted]);
      if (server?.outputFailed) observe(6);
      finish();
    }
  };
  const shutdown = () => {
    stopping = true;
    server?.stopAdmission();
    if (host) finalizing ??= finalize();
  };
  const uncaught = () => {
    diagnostic(); observe(host ? 3 : 4); abort(); shutdown();
    if (!host) { finish(); exited = true; runtime.exit(4); }
  };
  const outputError = () => { observe(6); abort(); shutdown(); };
  const events = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  runtime.on('uncaughtException', uncaught);
  runtime.on('unhandledRejection', uncaught);
  for (const event of events) runtime.on(event, shutdown);
  // Before serve: reject an unterminated EOF fragment after admission closes.
  runtime.stdin.on('end', shutdown);
  runtime.stdout.on('error', outputError);
  // Detect an early EOF without starting the protocol reader before the host exists.
  const earlyReadable = () => { runtime.stdin.read(0); if (runtime.stdin.readableEnded) shutdown(); };
  runtime.stdin.on('readable', earlyReadable);
  try {
    const vaultPath = runtime.env.TINYVAULT_VAULT_PATH;
    const keyPath = runtime.env.TINYVAULT_KEY_PATH;
    const override = runtime.env.TINYVAULT_TRIPWIRE_CANARY;
    if (!vaultPath || !keyPath || override === '') throw new Error('tinyvault-mcp: internal error');
    const canary = override ?? randomBytes(32).toString('base64url');
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version as string;
    host = await createSupervisedHost({ backend, canary, handleSignals: false });
    if (aborting) abort();
    server = createServer(host, { version, onInternalError: diagnostic, onOutputError: outputError });
    if (typeof host.quiesceEvidenceProducers !== 'function') { observe(4); abort(); shutdown(); }
    else if (stopping) shutdown();
    else {
      runtime.stdin.off('readable', earlyReadable);
      void serve(server, runtime.stdin, runtime.stdout).then(reason => {
        if (reason === 'framing') {
          observe(5);
          try { runtime.stderr.write('tinyvault-mcp: framing error\n'); } catch { /* Closed stderr. */ }
        }
        if (reason === 'output-error') outputError();
        shutdown();
      }).catch(uncaught);
      if (runtime.stdin.readableEnded) shutdown();
    }
  } catch { diagnostic(); observe(4); if (host) { abort(); shutdown(); } else finish(); }
  await done;
  await finalizing;
  runtime.stdin.off('end', shutdown);
  runtime.stdin.off('readable', earlyReadable);
  runtime.stdout.off('error', outputError);
  for (const event of events) runtime.off(event, shutdown);
  runtime.off('uncaughtException', uncaught);
  runtime.off('unhandledRejection', uncaught);
  if (!exited) runtime.exit(code);
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void start();
}
