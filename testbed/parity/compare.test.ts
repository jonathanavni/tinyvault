import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sodium from 'libsodium-wrappers';
import { describe, expect, it } from 'vitest';
import { compareParityBundles, compareParityTriplet, normalizeParityBundle } from './compare';
import { expectedParityRuns, type ParityBundle } from './capture';
import { readArtifactInventory } from './vault';
import { createScenarioRegistry, type FixtureOrigins } from '../scenarios';
import { canaryCommitment, signCompletionReceipt } from '../completion';
import { signEventsDigest } from '../fixtures/shared/eventsDigest';
import { controlTokenFor } from '../scenarios/benignLoginConstants';
import type { ParityRunSnapshot, ParityProvenance } from './types';
import type { RunRecord, CapturedEvent } from '../scorecard.schema';
import type { OfflineEvidenceManifest } from '../checkers/offline';

/** Independently authored persisted vectors: real Ed25519 envelopes and libsodium AEAD. */
async function vector(architecture: 'in-process' | 'composed', observed = true, firstNonce?: Buffer, reuse?: 'key' | 'nonce', eventOrder?: 'reverse' | 'invert-time'): Promise<ParityBundle> {
  await sodium.ready;
  const root = await realpath(await mkdtemp(join(tmpdir(), 'parity-caller-vector-')));
  const base = architecture === 'in-process' ? 'left' : 'rght';
  const origins: FixtureOrigins = { 'benign-login': `http://${base}-a.invalid`, 'lookalike-origin': `http://${base}-b.invalid`, 'dom-hidden-injection': `http://${base}-c.invalid`, 'secret-echo': `http://${base}-d.invalid`, 'fake-reauth': `http://${base}-e.invalid` };
  const pairs = Object.fromEntries(Object.keys(origins).map((id) => [id, generateKeyPairSync('ed25519')]));
  const scenarioRegistry = createScenarioRegistry(origins);
  const verificationKeys = Object.fromEntries(Object.keys(origins).map((id) => [id, pairs[id].publicKey])) as ParityBundle['trust']['verificationKeys'];
  const provenance = Object.fromEntries(Object.entries(origins).map(([fixtureId, C]) => [fixtureId, { fixtureId, architecture, reachability: 'http',
    originRoles: { C, ...(fixtureId === 'lookalike-origin' ? { L: `http://${base}-l.invalid` } : {}) } }])) as ParityProvenance;
  const snapshots: ParityRunSnapshot[] = []; const runs: RunRecord[] = []; const manifest: OfflineEvidenceManifest = { runs: [] };
  await mkdir(join(root, 'fixture-captures'));
  for (const [index, identity] of expectedParityRuns().entries()) {
    const scenario = scenarioRegistry.get(identity.scenario)!;
    const runId = `${identity.scenario}-stub-${identity.runIndex.toString().padStart(2, '0')}`;
    const nonce = randomBytes(24).toString('base64url'); const canary = 'synthetic-' + randomBytes(12).toString('hex');
    const handle = 'vh_' + randomBytes(16).toString('hex'); const sessionId = randomBytes(16).toString('hex');
    const dir = join(root, 'runs', runId); await mkdir(dir, { recursive: true });
    const descriptor = { ...identity, runId, nonce, canary, canaryId: `canary-${runId}`, vaultPath: join(dir, `vault-${nonce}.json`),
      keyPath: join(dir, `vault-${nonce}.key`), transcriptPath: join(dir, 'transcript.jsonl'), eventsPath: join(dir, 'events.json') };
    const origin = origins[scenario.fixtureId];
    const key = reuse === 'key' && index < 2 ? Buffer.alloc(32, 17) : randomBytes(32);
    const sealingNonce = reuse === 'nonce' && index < 2 ? Buffer.alloc(24, 23) : index === 0 && firstNonce ? firstNonce : randomBytes(24);
    const ad = Buffer.from(JSON.stringify([handle, origin, ['password']]));
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(Buffer.from(canary), ad, null, sealingNonce, key);
    await writeFile(descriptor.keyPath, key);
    await writeFile(descriptor.vaultPath, JSON.stringify({ version: 1, records: [{ handle, label: 'vector', kind: 'password', canonicalOrigin: origin,
      fieldRecipe: ['password'], sealed: { nonce: sealingNonce.toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') } }] }));
    key.fill(0);
    const transcript = [
      { kind: 'request', bytes: JSON.stringify({ messages: [{ role: 'tool', content: { toolCallId: 'vault-bootstrap', name: 'list_vault', result: { items: [{ handle, label: 'vector', kind: 'password', available: true }] } } }] }) },
      { kind: 'tool_exec', bytes: JSON.stringify({ toolCall: { id: 'open-1', name: 'browser_open_session', input: {} }, result: { sessionId } }) },
      { kind: 'meta', bytes: '{"event":"loop-complete","turns":2}' },
    ].map((record, sequence) => JSON.stringify({ sequence, ...record }) + '\n').join('');
    await writeFile(descriptor.transcriptPath, transcript);
    const events: CapturedEvent[] = [{ t: 0, channel: 'network-body', direction: 'outbound', origin, method: 'POST', route: '/login', bytes: canary },
      { t: 1, channel: 'dom-fill', direction: 'outbound', origin, frameId: 'top', documentId: runId, requestId: controlTokenFor(runId, nonce), initiator: 'fill-service', bytes: canary }];
    if (eventOrder === 'reverse') events.reverse();
    if (eventOrder === 'invert-time') events[1].t = -1;
    const eventBytes = Buffer.from(JSON.stringify(events, null, 2) + '\n'); await writeFile(descriptor.eventsPath, eventBytes);
    await writeFile(join(root, 'fixture-captures', `${runId}.requests`), canary + '\n');
    if (architecture === 'in-process') await writeFile(join(root, 'fixture-captures', `${runId}.unauthorized.requests`), '');
    snapshots.push({ descriptor, unauthorizedRequests: [], ...(observed ? { wire: [
      { eventIndex: 0, contextId: 0, requestId: 0, kind: 'request', url: origin + '/login', method: 'POST', redirectedFrom: null,
        headers: { state: 'present', entries: [{ name: 'Host', value: new URL(origin).host }, { name: 'Referer', value: origin + '/?q=1' }] } },
      { eventIndex: 1, contextId: 0, requestId: 0, kind: 'response', status: 200,
        headers: { state: 'present', entries: [{ name: 'Date', value: 'Sun, 06 Sep 2026 12:00:00 GMT' }, { name: 'X-duplicate', value: 'first' }, { name: 'X-duplicate', value: canary }] } },
    ] as const } : {}) });
    const binding = { fixtureId: scenario.fixtureId, fixtureVersion: scenario.fixtureVersion, scenarioId: scenario.id,
      runId, nonce, canaryId: descriptor.canaryId, successEndpoint: scenario.successEndpoint };
    runs.push({ ...identity, attackClass: scenario.attackClass, model: 'stub-scripted-v1', sdkVersion: 'none-offline-stub',
      transcriptPath: descriptor.transcriptPath, eventsPath: descriptor.eventsPath, checkerVersion: '1', completionOracleVersion: '2',
      completionReceipt: signCompletionReceipt({ ...binding, canaryCommitment: canaryCommitment(canary), issuedAt: '2026-09-06T12:00:00.000Z' }, pairs[scenario.fixtureId].privateKey),
      outcome: { secretLeaked: false, wrongOriginFillAttempted: false, wrongOriginFillBlocked: false, unobserved: 0, scanTruncated: 0, bodiesUnobserved: 0, approvalBypassed: false, taskCompleted: true } });
    manifest.runs.push({ ...identity, canary, completionBinding: binding,
      eventsAttestation: signEventsDigest(scenario.fixtureId, runId, eventBytes, pairs[scenario.fixtureId].privateKey),
      runStartedAt: '2026-09-06T11:59:59.000Z', runEndedAt: '2026-09-06T12:00:01.000Z' });
  }
  if (architecture === 'in-process') await writeFile(join(root, 'fixture-captures/lookalike.requests'), '');
  else { await mkdir(join(root, 'composed-scan')); await writeFile(join(root, 'composed-scan/close.marker'), 'vector-marker'); }
  await writeFile(join(root, 'runs.captured.json'), JSON.stringify(runs));
  await writeFile(join(root, 'offline-evidence.json'), JSON.stringify(manifest));
  const artifacts = await readArtifactInventory(root, snapshots, architecture);
  return { root, architecture, observed, trust: { scenarioRegistry, verificationKeys, provenance }, snapshots, runs, manifest, adjudicated: structuredClone(runs), artifacts,
    timing: { captureMs: 1, totalMs: 1 }, browser: { version: 'vector-browser', options: { headless: true, args: ['--disable-back-forward-cache'] } },
    async destroy() { for (const bytes of artifacts.files.values()) bytes.fill(0); await rm(root, { recursive: true, force: true }); } };
}

async function pair(action: (left: ParityBundle, right: ParityBundle) => Promise<void>) {
  const left = await vector('in-process'); const right = await vector('composed');
  try { await action(left, right); } finally { await left.destroy(); await right.destroy(); }
}
describe('canonical comparator caller', () => {
  it.each(['transcript', 'capture'] as const)('K-evidence rejects a leading BOM in one leg %s', async (kind) => {
    await pair(async (left, right) => {
      await compareParityBundles(left, right);
      const runId = right.snapshots[0].descriptor.runId;
      const path = kind === 'transcript' ? `runs/${runId}/transcript.jsonl` : `fixture-captures/${runId}.requests`;
      const files = right.artifacts.files as Map<string, Buffer>;
      files.set(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), files.get(path)!]));
      // A transcript BOM is invalid JSON; a capture BOM remains a literal byte difference.
      await expect(compareParityBundles(left, right)).rejects.toThrow(kind === 'transcript' ? 'Parity malformed-bundle' : 'Parity difference');
    });
  });
  it('K-vault-caller compares independently sealed genuine two-leg vectors', async () => {
    await pair(async (left, right) => { await compareParityBundles(left, right); });
  });
  it('K-observer-inert compares scored artifacts in independent observed and unobserved vectors', async () => {
    const left = await vector('in-process'); const right = await vector('in-process', false);
    try { await compareParityBundles(left, right, 'observer-inert'); }
    finally { await left.destroy(); await right.destroy(); }
  });
  it.each(['same-root', 'same-transport', 'wrong-provenance', 'browser-version', 'drop-run', 'missing-wire', 'raw-hash', 'stored-outcome', 'manifest-unknown'])(
    'K-leg caller rejects %s', async (mutation) => {
      await pair(async (left, right) => {
        let changed = right;
        if (mutation === 'same-root') changed = { ...right, root: left.root };
        if (mutation === 'same-transport') changed = { ...right, architecture: 'in-process' };
        if (mutation === 'browser-version') changed = { ...right, browser: { ...right.browser, version: 'other' } };
        if (mutation === 'wrong-provenance') (right.trust.provenance['benign-login'] as { architecture: string }).architecture = 'in-process';
        if (mutation === 'drop-run') right.runs.pop();
        if (mutation === 'missing-wire') delete (right.snapshots[0] as { wire?: unknown }).wire;
        if (mutation === 'raw-hash') (right.artifacts.files as Map<string, Buffer>).set(`runs/${right.snapshots[0].descriptor.runId}/events.json`, Buffer.concat([right.artifacts.files.get(`runs/${right.snapshots[0].descriptor.runId}/events.json`)!, Buffer.from(' ')]));
        if (mutation === 'stored-outcome') right.runs[0].outcome.bodiesUnobserved++;
        if (mutation === 'manifest-unknown') (right.manifest as unknown as { unknown: string }).unknown = 'kept-literal';
        const category = { 'same-root': 'leg-binding', 'same-transport': 'leg-binding', 'wrong-provenance': 'provenance', 'browser-version': 'browser-binding', 'drop-run': 'run-inventory', 'missing-wire': 'wire-missing', 'raw-hash': 'verification-matrix', 'stored-outcome': 'difference', 'manifest-unknown': 'difference' }[mutation];
        await expect(compareParityBundles(left, changed)).rejects.toThrow(`Parity ${category}`);
      });
    });
  it.each(['vault-read', 'key-read', 'swap-key', 'ciphertext-byte', 'nonce-byte', 'canary-binding', 'handle-binding', 'label', 'account-presence', 'vault-whitespace'])(
    'K-vault-caller rejects %s', async (mutation) => {
      await pair(async (left, right) => {
        const d = right.snapshots[0].descriptor; const files = right.artifacts.files as Map<string, Buffer>;
        const vaultPath = `runs/${d.runId}/vault-${d.nonce}.json`; const keyPath = `runs/${d.runId}/vault-${d.nonce}.key`;
        if (mutation === 'vault-read') files.delete(vaultPath);
        if (mutation === 'key-read') files.delete(keyPath);
        if (mutation === 'vault-whitespace') files.set(vaultPath, Buffer.concat([Buffer.from(' '), files.get(vaultPath)!]));
        if (mutation === 'swap-key') files.set(keyPath, Buffer.from(files.get(`runs/${right.snapshots[1].descriptor.runId}/vault-${right.snapshots[1].descriptor.nonce}.key`)!));
        if (['ciphertext-byte', 'nonce-byte', 'label', 'account-presence'].includes(mutation)) {
          const vault = JSON.parse(files.get(vaultPath)!.toString());
          if (mutation === 'label') vault.records[0].label = 'changed';
          else if (mutation === 'account-presence') vault.records[0].account = '';
          else { const field = mutation === 'nonce-byte' ? 'nonce' : 'ciphertext'; const bytes = Buffer.from(vault.records[0].sealed[field], 'base64'); bytes[0] ^= 1; vault.records[0].sealed[field] = bytes.toString('base64'); }
          files.set(vaultPath, Buffer.from(JSON.stringify(vault)));
        }
        if (mutation === 'canary-binding') (d as { canary: string }).canary = 'changed';
        if (mutation === 'handle-binding') {
          const path = `runs/${d.runId}/transcript.jsonl`; const raw = files.get(path)!.toString();
          const lines = raw.trimEnd().split('\n').map((line) => JSON.parse(line)); const first = JSON.parse(lines[0].bytes);
          first.messages[0].content.result.items[0].handle = 'vh_' + 'f'.repeat(32); lines[0].bytes = JSON.stringify(first);
          files.set(path, Buffer.from(lines.map((line) => JSON.stringify(line) + '\n').join('')));
        }
        const category = { 'vault-read': 'vault-missing', 'key-read': 'key-missing', 'swap-key': 'vault-opening', 'ciphertext-byte': 'vault-opening', 'nonce-byte': 'vault-opening', 'canary-binding': 'descriptor-binding', 'handle-binding': 'vault-policy', label: 'difference', 'account-presence': 'difference', 'vault-whitespace': 'difference' }[mutation];
        await expect(compareParityBundles(left, right)).rejects.toThrow(`Parity ${category}`);
      });
    });
  it.each(['reverse', 'invert-time'] as const)('K-order retains genuinely attested %s events', async (kind) => {
    const left = await vector('in-process'); const right = await vector('composed', true, undefined, undefined, kind);
    try { await expect(compareParityBundles(left, right)).rejects.toThrow('Parity difference'); }
    finally { await left.destroy(); await right.destroy(); }
  });
  it('K-evidence unknown descriptor Path fields remain literal', async () => {
    await pair(async (left, right) => {
      (left.snapshots[0].descriptor as unknown as { unknownPath: string }).unknownPath = '/left/unknown';
      (right.snapshots[0].descriptor as unknown as { unknownPath: string }).unknownPath = '/rght/unknown';
      await expect(compareParityBundles(left, right)).rejects.toThrow('Parity difference');
    });
  });
  it.each(['key', 'nonce'] as const)('K-vault-caller rejects genuinely sealed cross-run %s reuse', async (kind) => {
    const bundle = await vector('in-process', true, undefined, kind);
    try { await expect(normalizeParityBundle(bundle, true)).rejects.toThrow('Parity vault-reuse'); }
    finally { await bundle.destroy(); }
  });
  it('K-crypto triplet caller rejects pairwise-compatible contradictory codecs', async () => {
    const left = await vector('in-process', true, Buffer.from('abcdefghijklmnopqrstuvwx'));
    const right = await vector('composed', true, Buffer.alloc(24, 255));
    const control = await vector('in-process', false, Buffer.alloc(24, 251));
    try {
      for (const bundle of [left, right, control]) {
        const d = bundle.snapshots[0].descriptor;
        const doc = JSON.parse(bundle.artifacts.files.get(`runs/${d.runId}/vault-${d.nonce}.json`)!.toString());
        const spelling = bundle === control ? Buffer.from(doc.records[0].sealed.nonce, 'base64').toString('base64url') : doc.records[0].sealed.nonce;
        (bundle.manifest as unknown as { codecProbe: string }).codecProbe = spelling;
      }
      await compareParityBundles(left, right); await compareParityBundles(left, control, 'observer-inert');
      await expect(compareParityTriplet(left, right, control)).rejects.toThrow('Parity joint-codec-difference');
    } finally { await left.destroy(); await right.destroy(); await control.destroy(); }
  });
  it('K-absence two absent bundles never count as parity', async () => {
    await expect(normalizeParityBundle({ runs: [], manifest: { runs: [] } } as unknown as ParityBundle, true)).rejects.toThrow('Parity run-inventory');
  });
});
