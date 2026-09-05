// Three authenticated composed transports, returned only as a complete set. The origin probe proves
// HTTP reachability; control operations remain unavailable until slice 4. Deployment assumptions still apply.
import { CompletionVerifier } from '../completion';
import type { FixtureSet } from '../fixtures';
import type { FixtureTransport } from '../fixtures/transport';
import { ComposedConstructionError, createComposedProject, preferConstructionCode, type ComposedPeer, type ProjectOptions } from './compose';

export class ComposedNotImplementedError extends Error {
  readonly code = 'slice-4';
  constructor(_code: 'slice-4') { super('slice-4'); this.name = 'ComposedNotImplementedError'; }
}
const unavailable = async (): Promise<never> => { throw new ComposedNotImplementedError('slice-4'); };
export async function probeHttpOrigin(origin: string): Promise<boolean> {
  const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
  await response.body?.cancel();
  return response.status >= 200 && response.status < 400;
}
function transport(peer: ComposedPeer, close: () => Promise<void>, http: typeof fetch): FixtureTransport {
  const verifier = new CompletionVerifier(peer.publicKey);
  const request: typeof fetch = async (input, init) => {
    if (peer.bridge.closed) throw new ComposedConstructionError('bridge-closed');
    try { return await http(input, init); }
    catch { throw new ComposedConstructionError('origin-unreachable'); }
  };
  return {
    origin: peer.origin, architecture: 'composed', reachability: 'http', verificationPublicKey: peer.publicKey,
    registerRun: unavailable, takeReceipt: unavailable, attestEvents: unavailable,
    captureRequests: unavailable, unauthorizedRequests: unavailable,
    getLoginPage: async (runId) => {
      try { return await (await request(`${peer.origin}/?runId=${encodeURIComponent(runId)}`)).text(); }
      catch (error) {
        if (error instanceof ComposedConstructionError) throw error;
        throw new ComposedConstructionError('origin-unreachable');
      }
    },
    submitLogin: async (body) => (await request(`${peer.origin}/login`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual',
    })).status,
    verifyCompletion: (receipt, expected, nowMs) => verifier.verify(receipt, expected, nowMs), close,
  };
}
export async function startComposedFixtureSet(options: ProjectOptions & { fetch?: typeof fetch }): Promise<FixtureSet> {
  const project = await createComposedProject(options);
  try {
    return Object.fromEntries(project.peers.map((peer) =>
      [peer.fixtureId, transport(peer, () => project.closer.close(), options.fetch ?? globalThis.fetch)]));
  } catch (error) {
    const cause = error instanceof ComposedConstructionError ? error : new ComposedConstructionError('handshake-rejected');
    try { await project.closer.close(); }
    catch (teardown) { cause.teardownCode = preferConstructionCode(cause.teardownCode,
      teardown instanceof ComposedConstructionError ? teardown.code : 'compose-down'); }
    throw cause;
  }
}
