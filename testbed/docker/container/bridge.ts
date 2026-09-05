// Byte forwarding uses only the tripwire's bound writer. Prototype/raw-fd bypasses are the
// declared stdoutTripwire residue; exact frames are checked on the built Docker execution path.
import { createConnection } from 'node:net';
import process from 'node:process';
import { installStdoutTripwire } from './stdoutTripwire';

const write = installStdoutTripwire(process, process.stderr, (code) => process.exit(code));
// The build embeds this object directly from topology.json; no filesystem import enters this bridge.
const topology = TV_CONTAINER_TOPOLOGY;
process.stderr.write(`${topology.markers.BRIDGE_MARKER}\n`);
const socket = createConnection(topology.controlSocket);
let closing = false;
function close(code = 0): void {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  process.stdin.destroy();
  socket.destroy();
}
function failed(): void { process.stderr.write('bridge-closed\n'); close(1); }
socket.once('connect', () => { process.stdin.pipe(socket); });
socket.on('data', (chunk: Buffer) => {
  if (!write(chunk, (error) => { if (error) failed(); })) socket.pause();
});
process.stdout.on('drain', () => socket.resume());
process.stdout.on('error', failed);
process.stdin.on('error', failed);
process.stdin.on('end', () => close());
process.stdin.on('close', () => close());
socket.on('error', failed);
socket.on('end', () => close());
socket.on('close', () => close());
