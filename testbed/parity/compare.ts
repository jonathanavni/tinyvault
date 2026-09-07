import { type KeyObject } from 'node:crypto';
import { relative } from 'node:path';
import { canaryCommitment, CompletionVerifier, type CompletionBinding, type CompletionRunWindow } from '../completion';
import { verifyEventsDigest } from '../fixtures/shared/eventsDigest';
import { controlTokenFor } from '../scenarios/benignLoginConstants';
import type { CapturedEvent } from '../scorecard.schema';
import { assertParityIdentities, expectedParityRuns, type ParityBundle } from './capture';
import { ValueRegistry, firstDifference, normalizeJsonBytes } from './normalize';
import { parityFailure, verifyVault, type VerifiedVault } from './vault';
import type { HeaderObservation, WireEvent } from './types';

/** Every negative uses genuine material and independent ledger state. */
export function verificationMatrix(receipt: string, attestation: string, binding: CompletionBinding,
  window: CompletionRunWindow, events: Buffer, key: KeyObject, wrongKey: KeyObject) {
  const verify = (text: string, verificationKey = key, runWindow = window) =>
    new CompletionVerifier(verificationKey).verifyPersisted(text, binding, runWindow);
  const altered = JSON.parse(receipt) as { signature: string };
  const signature = Buffer.from(altered.signature, 'base64url'); signature[0] ^= 1; altered.signature = signature.toString('base64url');
  const ledger = new Set<string>();
  const replayFirst = new CompletionVerifier(key, undefined, undefined, ledger).verifyPersisted(receipt, binding, window);
  const replaySecond = new CompletionVerifier(key, undefined, undefined, ledger).verifyPersisted(receipt, binding, window);
  const excluding = { startedAt: '1970-01-01T00:00:00.000Z', endedAt: '1970-01-01T00:00:00.001Z' };
  const result = { receipts: [verify(receipt), verify(receipt, wrongKey), verify(JSON.stringify(altered)), replayFirst, replaySecond, verify(receipt, key, excluding)],
    attestations: [verifyEventsDigest(attestation, binding.fixtureId, binding.runId, events, key),
      verifyEventsDigest(attestation, binding.fixtureId, binding.runId, events, wrongKey),
      verifyEventsDigest(attestation, 'wrong-fixture', binding.runId, events, key),
      verifyEventsDigest(attestation, binding.fixtureId, 'wrong-run', events, key),
      verifyEventsDigest(attestation, binding.fixtureId, binding.runId, Buffer.concat([events, Buffer.from(' ')]), key)] };
  const expected = { receipts: [{ taskCompleted: true }, { taskCompleted: false, reason: 'bad-signature' },
    { taskCompleted: false, reason: 'bad-signature' }, { taskCompleted: true },
    { taskCompleted: false, reason: 'replayed' }, { taskCompleted: false, reason: 'stale' }],
    attestations: [true, false, false, false, false] };
  if (firstDifference(result, expected)) parityFailure('verification-matrix');
  return result;
}

function utf8(bytes: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return parityFailure('artifact-utf8'); }
}
function wallClock(value: unknown): unknown | undefined {
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? { wallClock: 'ISO-8601-millisecond-UTC' } : undefined;
}
function httpDate(value: string): unknown | undefined {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toUTCString() === value ? { wallClock: 'HTTP-date-IMF-fixdate' } : undefined;
}
function trustedHeaderValue(name: string, value: string, requestOrigin: string | undefined,
  origins: readonly string[], registry: ValueRegistry): unknown | undefined {
  if (name.toLowerCase() === 'date') return httpDate(value);
  if (name.toLowerCase() === 'host' && requestOrigin && origins.includes(requestOrigin)
    && new URL(requestOrigin).host === value) return { host: registry.text(requestOrigin), scheme: new URL(requestOrigin).protocol };
  return undefined;
}
function normalizeHeaders(headers: HeaderObservation, origin: string | undefined,
  origins: readonly string[], registry: ValueRegistry): unknown {
  if (headers.state !== 'present') parityFailure('wire-headers');
  return { object: Object.entries(headers).map(([field, item]) => [registry.text(field), field === 'entries'
    ? headers.entries.map((entry) => ({ object: Object.entries(entry).map(([key, value]) => [registry.text(key),
      key === 'value' ? trustedHeaderValue(entry.name, entry.value, origin, origins, registry) ?? registry.value(value)
        : registry.value(value)]) })) : registry.value(item)]) };
}
function normalizeWire(wire: readonly WireEvent[], origins: readonly string[], registry: ValueRegistry): unknown {
  if (!wire.length) parityFailure('wire-empty');
  const requests = new Map<string, string>(); const responses = new Set<string>();
  const normalized = wire.map((event, index) => {
    if (event.eventIndex !== index || event.kind === 'failure') parityFailure('wire-order-or-failure');
    const key = `${event.contextId}:${event.requestId}`;
    if (event.kind === 'request') {
      if (requests.has(key)) parityFailure('wire-duplicate');
      const origin = new URL(event.url).origin; requests.set(key, origin);
      if (event.redirectedFrom !== null && !requests.has(`${event.contextId}:${event.redirectedFrom}`)) parityFailure('wire-redirect');
      return { ...registryObject(event, registry, ['headers']), headers: normalizeHeaders(event.headers, origin, origins, registry) };
    }
    const origin = requests.get(key);
    if (!origin || responses.has(key)) parityFailure('wire-response');
    responses.add(key);
    if (index === wire.length - 1 && responses.size !== requests.size) parityFailure('wire-incomplete');
    return { ...registryObject(event, registry, ['headers']), headers: normalizeHeaders(event.headers, origin, origins, registry) };
  });
  if (responses.size !== requests.size) parityFailure('wire-incomplete');
  return normalized;
}
function registryObject(value: object, registry: ValueRegistry, exclude: string[] = []): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !exclude.includes(key)).map(([key, item]) => [key, registry.value(item)]));
}

type PreparedRun = { index: number; snapshot: ParityBundle['snapshots'][number]; run: ParityBundle['runs'][number];
  evidence: ParityBundle['manifest']['runs'][number]; vault: VerifiedVault; transcript: string; events: CapturedEvent[];
  eventText: string; matrix: ReturnType<typeof verificationMatrix> };

/** Authentication precedes every alpha-renaming. Diagnostics return locations, never values. */
export async function normalizeParityBundle(bundle: ParityBundle, includeWire: boolean): Promise<unknown> {
  const registry = new ValueRegistry(); const prepared: PreparedRun[] = []; const vaults: VerifiedVault[] = [];
  try {
    assertParityIdentities(bundle.runs); assertParityIdentities(bundle.manifest.runs);
    assertParityIdentities(bundle.adjudicated); assertParityIdentities(bundle.snapshots.map((snapshot) => snapshot.descriptor));
    const origins: string[] = [];
    for (const scenario of bundle.trust.scenarioRegistry.values()) {
      const provenance = bundle.trust.provenance[scenario.fixtureId];
      if (!provenance || provenance.fixtureId !== scenario.fixtureId || provenance.architecture !== bundle.architecture
        || provenance.reachability !== 'http' || provenance.originRoles.C !== scenario.authForRun('validation-run', 'validation-nonce').canonicalOrigin
        || (scenario.fixtureId === 'lookalike-origin' && (!provenance.originRoles.L || provenance.originRoles.C === provenance.originRoles.L))) parityFailure('provenance');
      for (const [role, origin] of Object.entries(provenance.originRoles)) {
        registry.anchor(`${scenario.fixtureId}:${role}`, origin, { origin: true }); origins.push(origin);
      }
      registry.anchor(`${scenario.fixtureId}:public-key`, bundle.trust.verificationKeys[scenario.fixtureId].export({ format: 'der', type: 'spki' }));
    }
    const files = bundle.artifacts.files;
    for (const [index, identity] of expectedParityRuns().entries()) {
      const matches = (item: { scenario: string; agent: string; runIndex: number }) => item.scenario === identity.scenario && item.agent === identity.agent && item.runIndex === identity.runIndex;
      const snapshot = bundle.snapshots.find((item) => matches(item.descriptor))!; const d = snapshot.descriptor;
      const run = bundle.runs.find(matches)!; const evidence = bundle.manifest.runs.find(matches)!;
      const scenario = bundle.trust.scenarioRegistry.get(d.scenario);
      if (!scenario || evidence.canary !== d.canary || evidence.completionBinding.runId !== d.runId
        || evidence.completionBinding.nonce !== d.nonce || evidence.completionBinding.canaryId !== d.canaryId
        || run.transcriptPath !== d.transcriptPath || run.eventsPath !== d.eventsPath) parityFailure('descriptor-binding');
      const transcript = utf8(files.get(relative(bundle.root, d.transcriptPath)) ?? parityFailure('transcript-missing'));
      if (!transcript.endsWith('\n')) parityFailure('transcript-delimiter');
      const lines = transcript.slice(0, -1).split('\n').map((line) => JSON.parse(line) as { kind: string; sequence: number; bytes: string });
      if (!lines.some((line) => line.kind === 'meta' && JSON.parse(line.bytes).event === 'loop-complete')
        || lines.some((line, lineIndex) => line.sequence !== lineIndex)) parityFailure('transcript-order');
      const request = lines.find((line) => line.kind === 'request');
      if (!request) parityFailure('bootstrap-missing');
      const bootstrap = JSON.parse(request.bytes).messages[0];
      if (bootstrap?.role !== 'tool' || bootstrap.content?.toolCallId !== 'vault-bootstrap'
        || bootstrap.content?.name !== 'list_vault' || bootstrap.content?.result?.items?.length !== 1) parityFailure('bootstrap-binding');
      const handle = bootstrap.content.result.items[0].handle;
      if (typeof handle !== 'string') parityFailure('bootstrap-handle');
      const sessions = lines.filter((line) => line.kind === 'tool_exec').map((line) => JSON.parse(line.bytes))
        .filter((line) => line.toolCall?.name === 'browser_open_session').map((line) => line.result?.sessionId);
      if (!sessions.length || sessions.some((session) => typeof session !== 'string' || !session)) parityFailure('session-binding');
      const eventBytes = files.get(relative(bundle.root, d.eventsPath)) ?? parityFailure('events-missing');
      const eventText = utf8(eventBytes); const events = JSON.parse(eventText) as CapturedEvent[];
      const key = bundle.trust.verificationKeys[scenario.fixtureId];
      const wrongKey = Object.entries(bundle.trust.verificationKeys).find(([id]) => id !== scenario.fixtureId)?.[1];
      if (!run.completionReceipt || !wrongKey) parityFailure('receipt-missing');
      const binding = { ...evidence.completionBinding, fixtureId: scenario.fixtureId, fixtureVersion: scenario.fixtureVersion,
        scenarioId: scenario.id, successEndpoint: scenario.successEndpoint, canaryCommitment: canaryCommitment(d.canary) };
      if (Object.entries(evidence.completionBinding).some(([field, value]) => binding[field as keyof typeof binding] !== value)) parityFailure('scenario-binding');
      const matrix = verificationMatrix(run.completionReceipt, evidence.eventsAttestation, binding,
        { startedAt: evidence.runStartedAt, endedAt: evidence.runEndedAt }, eventBytes, key, wrongKey);
      const vault = await verifyVault(files.get(relative(bundle.root, d.vaultPath)) ?? parityFailure('vault-missing'),
        files.get(relative(bundle.root, d.keyPath)) ?? parityFailure('key-missing'),
        { canary: d.canary, handle, canonicalOrigin: bundle.trust.provenance[scenario.fixtureId]!.originRoles.C });
      if (vaults.some((prior) => prior.key.equals(vault.key) || prior.nonce.equals(vault.nonce))) { await vault.destroy(); parityFailure('vault-reuse'); }
      vaults.push(vault);
      registry.anchor(`${index}:canary`, d.canary); registry.anchor(`${index}:nonce`, d.nonce);
      registry.anchor(`${index}:handle`, handle);
      for (const [sessionIndex, session] of sessions.entries()) registry.anchor(`${index}:session:${sessionIndex}`, session);
      registry.anchor(`${index}:canary-sha256`, Buffer.from(binding.canaryCommitment, 'hex'), { relation: { algorithm: 'SHA-256', input: `${index}:canary` } });
      const control = controlTokenFor(d.runId, d.nonce);
      if (!events.some((event) => event.bytes.includes(control) || event.requestId === control)) parityFailure('control-binding');
      registry.anchor(`${index}:control`, control, { relation: { algorithm: 'SHA-256-prefix-32', runId: d.runId, input: `${index}:nonce` } });
      registry.anchor(`${index}:vault-key`, vault.key); registry.anchor(`${index}:sealing-nonce`, vault.nonce);
      registry.anchor(`${index}:ciphertext`, vault.ciphertext, { relation: { algorithm: vault.algorithm, key: `${index}:vault-key`, nonce: `${index}:sealing-nonce`, policy: `${index}:policy`, plaintext: `${index}:canary` } });
      const attestation = JSON.parse(evidence.eventsAttestation);
      registry.anchor(`${index}:events-hash`, Buffer.from(attestation.payload.eventsSha256, 'hex'), { relation: { algorithm: 'SHA-256', input: `${index}:events` } });
      for (const [kind, serialized] of [['receipt', run.completionReceipt], ['attestation', evidence.eventsAttestation]]) {
        const envelope = JSON.parse(serialized);
        registry.anchor(`${index}:${kind}-signature`, Buffer.from(envelope.signature, 'base64url'), { relation: { domain: `TinyVault/${kind}/v2\0`, version: '2', type: kind === 'attestation' ? 'attest' : 'receipt', input: `${index}:${kind}-payload`, verified: true } });
      }
      prepared.push({ index, snapshot, run, evidence, vault, transcript, events, eventText, matrix });
    }
    const normalizeEnvelope = (serialized: string): unknown => {
      return normalizeJsonBytes(serialized, registry, (path, value) => path.join('.') === 'payload.issuedAt' ? wallClock(value) : undefined);
    };
    const normalizeRecord = (record: object, index: number): unknown => Object.entries(record).map(([key, value]) => [key,
      key === 'completionReceipt' && typeof value === 'string' ? normalizeEnvelope(value)
        : (key === 'transcriptPath' || key === 'eventsPath') ? { path: `${index}/${key}` } : registry.value(value)]);
    const normalized = prepared.map(({ index, snapshot, run, evidence, vault, transcript, events, eventText, matrix }) => {
      const times = [...new Set(events.map((event) => event.t))].sort((a, b) => a - b);
      if (times.some((time) => !Number.isFinite(time))) parityFailure('event-time');
      const normalizedEvents = normalizeJsonBytes(eventText, registry, (path, value, spelling) => {
        if (path.length === 2 && path[1] === 't') return { eventOrder: times.indexOf(value as number) };
        if (path.length === 2 && path[1] === 'bytes' && events[path[0] as number].channel === 'header' && typeof value === 'string' && spelling === JSON.stringify(value)) {
          const event = events[path[0] as number];
          return { jsonString: normalizeJsonBytes(value, registry, (headerPath, headerValue) => headerPath.length === 1 && typeof headerValue === 'string'
            ? trustedHeaderValue(String(headerPath[0]), headerValue, event.origin, origins, registry) : undefined) };
        }
        return undefined;
      });
      const manifest = Object.entries(evidence).map(([key, value]) => [key,
        key === 'eventsAttestation' ? normalizeEnvelope(value as string)
          : key === 'runStartedAt' || key === 'runEndedAt' ? wallClock(value) ?? parityFailure('window-format') : registry.value(value)]);
      return { descriptor: Object.entries(snapshot.descriptor).map(([key, value]) => [key, ['vaultPath', 'keyPath', 'transcriptPath', 'eventsPath'].includes(key) ? { path: `${index}/${key}` } : registry.value(value)]), run: normalizeRecord(run, index), manifest, adjudicated: normalizeRecord(bundle.adjudicated.find((item) => item.scenario === run.scenario && item.agent === run.agent && item.runIndex === run.runIndex)!, index),
        transcript: registry.text(transcript), events: normalizedEvents,
        vault: registry.value(vault.vault), vaultBytes: registry.text(utf8(files.get(relative(bundle.root, snapshot.descriptor.vaultPath))!)), vaultBinding: { algorithm: vault.algorithm, additionalData: registry.value(vault.additionalData), opened: true,
          keyLength: vault.key.length, nonceLength: vault.nonce.length, ciphertextLength: vault.ciphertext.length },
        capture: registry.text(utf8(files.get(`fixture-captures/${snapshot.descriptor.runId}.requests`)!)),
        unauthorized: registry.value(snapshot.unauthorizedRequests), matrix,
        ...(includeWire ? { wire: normalizeWire(snapshot.wire ?? parityFailure('wire-missing'), origins, registry) } : {}),
      };
    });
    return { runs: normalized, graph: registry.graph(), manifest: Object.entries(bundle.manifest).map(([key, value]) => [key, key === 'runs' ? { comparedRuns: true } : registry.value(value)]) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Parity ')) throw error;
    return parityFailure('malformed-bundle');
  } finally { await Promise.all(vaults.map((vault) => vault.destroy())); registry.destroy(); }
}

export async function compareParityBundles(left: ParityBundle, right: ParityBundle,
  mode: 'transport' | 'observer-inert' = 'transport'): Promise<void> {
  if (left.root === right.root || left.architecture !== 'in-process' || !left.observed
    || (mode === 'transport' ? right.architecture !== 'composed' || !right.observed
      : right.architecture !== 'in-process' || right.observed)) parityFailure('leg-binding');
  if (firstDifference(left.browser, right.browser)) parityFailure('browser-binding');
  const a = await normalizeParityBundle(left, mode === 'transport');
  const b = await normalizeParityBundle(right, mode === 'transport');
  const difference = firstDifference(a, b);
  if (difference) parityFailure(`difference ${difference}`);
}

/** One interpretation per scored occurrence across all three legs, plus the two-leg wire proof. */
export async function compareParityTriplet(inProcess: ParityBundle, composed: ParityBundle,
  unobserved: ParityBundle): Promise<void> {
  await compareParityBundles(inProcess, composed);
  await compareParityBundles(inProcess, unobserved, 'observer-inert');
  const observedScored = await normalizeParityBundle(inProcess, false);
  const composedScored = await normalizeParityBundle(composed, false);
  const unobservedScored = await normalizeParityBundle(unobserved, false);
  const domains = new Map<string, readonly string[]>();
  const first = firstDifference(observedScored, composedScored, '$', domains);
  const second = firstDifference(observedScored, unobservedScored, '$', domains);
  if (first || second) parityFailure(`joint-codec-difference ${first ?? second}`);
}
