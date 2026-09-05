// One instance writer tripwire for trusted fixture hygiene. Declared limits:
// prototype-dispatched calls (`Writable.prototype.write.call(process.stdout, …)`, `_write`), `net.Socket({fd: 1})`,
// and raw-fd writes (`fs.writeSync(1, …)`) bypass instance patching; for those the only signal is the Docker suite's
// exact-frames assertion on the executed path.
import type { Writable } from 'node:stream';

export type TripwireProcess = { stdout: Pick<Writable, 'write' | 'end'>; console?: object };
export function installStdoutTripwire(
  processLike: TripwireProcess, stderrLike: Pick<Writable, 'write'>, exit: (code: number) => void,
): Writable['write'] {
  const writer = processLike.stdout.write.bind(processLike.stdout);
  const diagnostic = stderrLike.write.bind(stderrLike);
  const trip = (): never => {
    try { diagnostic('bridge-closed\n'); }
    finally { exit(1); }
    // A test exit sink may return; do not allow the attempted write to continue.
    throw new Error('bridge-closed');
  };
  processLike.stdout.write = trip;
  processLike.stdout.end = trip;
  const target = processLike.console ?? console;
  let owner: object | null = target;
  while (owner && owner !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(owner)) {
      if (name !== 'constructor' && typeof Reflect.get(target, name) === 'function') {
        Reflect.set(target, name, trip);
      }
    }
    owner = Object.getPrototypeOf(owner);
  }
  return writer;
}
