import { markClosedProject } from '../evidenceOversize';
// Private administrative capabilities stay within this trusted client and its exposure registry.
import { CompletionVerifier } from '../completion';
import type { FixtureSet } from '../fixtures';
import type { FixtureRunSetup, FixtureTransport } from '../fixtures/transport';
import { ComposedConstructionError, createComposedProject, preferConstructionCode, type ComposedPeer, type ProjectOptions } from './compose';
import { parseUnauthorizedCapture, receiveCapture } from './captureTransfer';
import { decodeBase64url, validateBody } from './handshake';
import { BridgeError, CAPABILITY_OPS, MAX_EVENTS_BYTES, RUN_ID_PATTERN,
  type Body, type CapabilityOp, type CaptureKind } from './protocol';

export async function probeHttpOrigin(origin: string): Promise<boolean> {
  const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
  await response.body?.cancel();
  return response.status >= 200 && response.status < 400;
}
function transport(peer: ComposedPeer, closeProject: () => Promise<void>, http: typeof fetch): FixtureTransport {
  const verifier = new CompletionVerifier(peer.publicKey);
  const runs = new Map<string, Record<CapabilityOp, string>>();
  let queue = Promise.resolve();
  let closed = false;
  const close = async () => { closed = true; runs.clear(); await closeProject(); };
  const administrative = <T>(work: () => Promise<T>): Promise<T> => {
    const task = queue.then(async () => {
      try {
        if (closed || peer.bridge.closed) throw new BridgeError('bridge-closed');
        return await work();
      } catch (error) {
        const cause = error instanceof ComposedConstructionError ? error : new ComposedConstructionError(
          error instanceof BridgeError && error.code === 'bridge-closed' ? 'bridge-closed' : 'bridge-protocol');
        try { await close(); }
        catch (teardown) { cause.teardownCode = preferConstructionCode(cause.teardownCode,
          teardown instanceof ComposedConstructionError ? teardown.code : 'compose-down'); }
        markClosedProject(cause);
        throw cause;
      }
    });
    queue = task.then(() => undefined, () => undefined);
    return task;
  };
  const operation = async (op: CapabilityOp, runId: string, extra: Body = {}) => {
    if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId) || !runs.has(runId)) {
      throw new BridgeError('capability-refused');
    }
    const response = await peer.bridge.request(op, { epoch: peer.epoch, fixtureId: peer.fixtureId,
      runId, capability: runs.get(runId)![op], ...extra });
    validateBody(op, 'res', response);
    return response;
  };
  const capture = (runId: string, kind: CaptureKind) => receiveCapture((offset) => operation('capture', runId, { kind, offset }));
  const request: typeof fetch = async (input, init) => {
    if (closed || peer.bridge.closed) throw new ComposedConstructionError('bridge-closed');
    try { return await http(input, init); }
    catch { throw new ComposedConstructionError('origin-unreachable'); }
  };
  return {
    originRoles: Object.freeze({ ...peer.originRoles }),
    origin: peer.origin, architecture: 'composed', reachability: 'http', verificationPublicKey: peer.publicKey,
    registerRun: (setup: FixtureRunSetup) => {
      // Copy at invocation, including when another registration is still in flight.
      let body: Body | undefined;
      try {
        body = { epoch: peer.epoch, fixtureId: peer.fixtureId, scenarioId: setup.scenarioId, runId: setup.runId,
          nonce: setup.nonce, canaryId: setup.canaryId, canary: setup.canary };
        validateBody('register', 'req', body);
      } catch { body = undefined; }
      const copied = body;
      return administrative(async () => {
        if (!copied) throw new BridgeError('body-shape');
        const runId = copied.runId as string;
        if (runs.has(runId)) throw new BridgeError('run-state');
        const response = await peer.bridge.request('register', copied);
        validateBody('register', 'res', response);
        const tokens = {} as Record<CapabilityOp, string>;
        // All six observations finish synchronously before any dependent request can enter the bridge.
        for (const op of CAPABILITY_OPS) {
          const token = decodeBase64url(response[op] as string, 32, 'capability-refused');
          try { peer.registerSecret(token); } finally { token.fill(0); }
          tokens[op] = response[op] as string;
        }
        runs.set(runId, tokens);
        const key = await operation('key', runId);
        if (key.publicKey !== peer.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url')) {
          throw new BridgeError('key-mismatch');
        }
      });
    },
    takeReceipt: (runId) => administrative(async () => (await operation('receipt', runId)).receipt as string || undefined),
    finalizeRun: (runId) => administrative(async () => { await operation('finalize', runId); }),
    acknowledgeReceipt: (runId) => administrative(async () => { await operation('ack', runId); }),
    attestEvents: (runId, events) => {
      let bytes: Buffer | undefined;
      if (events instanceof Uint8Array && events.byteLength <= MAX_EVENTS_BYTES) bytes = Buffer.from(events);
      return administrative(async () => {
        if (!bytes) throw new BridgeError('control-limit');
        return (await operation('attest', runId, { events: bytes.toString('base64url') })).attestation as string;
      });
    },
    captureRequests: (runId) => administrative(() => capture(runId, 'requests')),
    unauthorizedRequests: (runId) => administrative(async () => parseUnauthorizedCapture(await capture(runId, 'unauthorized'))),
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
