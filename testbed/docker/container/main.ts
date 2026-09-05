import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname } from 'node:path';
import { inspect } from 'node:util';
import { hostname } from 'node:os';
import type { FixtureTransport } from '../../fixtures/transport';
import { createControlServer, type ControlSession } from './control';
import { installStdoutTripwire } from './stdoutTripwire';
import { containerConfig, startContainerFixture, controlConfigForFixture } from './fixture';
import { containerTopology as topology } from './topology';

installStdoutTripwire(process, process.stderr, (code) => process.exit(code));
let fixture: FixtureTransport | undefined;
let session: ControlSession | undefined;
const server = createServer();
let closing = false;
async function shutdown(failed = false): Promise<void> {
  if (failed) process.exitCode = 1;
  if (closing) return;
  closing = true;
  process.stderr.write(`${topology.markers.SHUTDOWN_MARKER}\n${JSON.stringify(Buffer.from(topology.markers.SHUTDOWN_MARKER))}\n`);
  const deadline = setTimeout(() => process.exit(1), 4000);
  deadline.unref();
  session?.close();
  const results = await Promise.allSettled([
    new Promise<void>((resolve) => server.close(() => resolve())),
    Promise.resolve().then(() => fixture?.close()),
  ]);
  if (results.some((r) => r.status === 'rejected')) process.exitCode = 1;
  clearTimeout(deadline);
}
async function start(): Promise<void> {
  const config = containerConfig(process.env);
  fixture = await startContainerFixture(config, '/tmp/tinyvault/captures');
  if (closing) { await fixture.close(); return; }
  const accept = createControlServer(controlConfigForFixture(config, fixture, hostname(),
    (code) => process.stderr.write(`${code}\n`)));
  server.on('connection', (socket) => {
    if (session) process.stderr.write('control-second-connection\n');
    const accepted = accept({ input: socket, output: socket });
    if (accepted) session = accepted;
  });
  await mkdir(dirname(topology.controlSocket), { recursive: true, mode: 0o700 });
  if (closing) return;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(topology.controlSocket, () => { server.off('error', reject); resolve(); });
  });
  server.on('error', () => { void shutdown(true); });
  process.stderr.write(`${topology.markers.BOOT_MARKER}\n${inspect(Buffer.from(topology.markers.BOOT_MARKER))}\n`);
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
void start().catch(async () => {
  process.exitCode = 1;
  process.stderr.write('fixture-start-failed\n');
  await shutdown(true);
});
