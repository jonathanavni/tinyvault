// Known fresh test key via module mock, never runtime configuration or a shipping key provider.
// All fixtures deliberately share this signer for sink coverage; key independence is tested elsewhere.
// Composed fixtures pin fixed-code stderr errors. The alternative in-process console.error(Error)
// branch is outside this composed-path proof; the actual configuration pin is asserted below.
import type { KeyObject } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { realEvidence, setupFor, loginFor, artifactBytes, writerBytes } from './slice4.testkit';
import { assertClean } from './integrationEvidence';
import { createComposedProject } from './compose';
import { fakeProject, kindOf } from './compose.testkit';
import { containerConfig } from './container/fixture';
import { FIXTURE_IDS } from './protocol';
import topology from './topology.json';

const known = vi.hoisted(() => ({ pair: undefined as { privateKey: KeyObject; publicKey: KeyObject } | undefined }));
vi.mock('node:crypto', async (original) => {
  const crypto = await original<typeof import('node:crypto')>();
  known.pair = crypto.generateKeyPairSync('ed25519');
  return { ...crypto, generateKeyPairSync: () => known.pair };
});
function privateForms(): Record<string, Buffer> {
  const der = Buffer.from(known.pair!.privateKey.export({ type: 'pkcs8', format: 'der' }));
  return { der, base64: Buffer.from(der.toString('base64')), base64url: Buffer.from(der.toString('base64url')),
    pem: Buffer.from(known.pair!.privateKey.export({ type: 'pkcs8', format: 'pem' })), seed: der.subarray(-32) };
}
it.each(FIXTURE_IDS)('actual container configuration pins fixed-code request errors for %s and every listener', (fixtureId) => {
  const ports = topology.services[fixtureId];
  const config = containerConfig({ TV_FIXTURE_ID: fixtureId, TV_EVAL_EPOCH: '1788600000000-' + 'a'.repeat(32),
    TV_PUBLIC_ORIGIN: `http://${ports[0].address}:${ports[0].host}`,
    ...(fixtureId === 'lookalike-origin' ? {
      TV_LOOKALIKE_PUBLIC_ORIGIN: `http://${ports[1].address}:${ports[1].host}`,
    } : {}),
  });
  expect(config.options.onListenPermissionError).toBe('fail');
  if (fixtureId === 'lookalike-origin') expect(config.options.lookalike?.onListenPermissionError).toBe('fail');
});
it('known signer remains absent from real HTTP/control pages URLs headers captures responses control errors fixed-code stderr and artifacts', async () => {
  const h = await realEvidence(vi.fn);
  const stdoutBytes: Buffer[] = [];
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((value, encoding) => {
    stdoutBytes.push(writerBytes(value, encoding)); return true;
  });
  const stderrBytes: Buffer[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((value, encoding) => {
    stderrBytes.push(writerBytes(value, encoding)); return true;
  });
  try {
    for (const [i, fixture] of Object.values(h.set).entries()) {
      expect(h.fixtures[i].reachability).toBe('http');
      await fixture.registerRun(setupFor('A'));
      await fixture.getLoginPage('A'); expect(await fixture.submitLogin(loginFor('A'))).toBe(303);
      const rejected = await fetch(h.fixtures[i].origin + '/login', { method: 'POST', body: 'runId=A&password=bad', redirect: 'manual' });
      h.surfaces.push(Buffer.from(await rejected.arrayBuffer()), Buffer.from(JSON.stringify([...rejected.headers])));
      await fixture.finalizeRun('A');
      h.surfaces.push(Buffer.from(await fixture.captureRequests('A')), Buffer.from(JSON.stringify(await fixture.unauthorizedRequests('A'))),
        Buffer.from(await fixture.takeReceipt('A') ?? ''), Buffer.from(await fixture.attestEvents('A', Buffer.from('[]'))));
      await fixture.acknowledgeReceipt('A');
      expect(fixture.verificationPublicKey.export({ type: 'spki', format: 'der' })).toEqual(known.pair!.publicKey.export({ type: 'spki', format: 'der' }));
    }
    // An actual refused control dispatch exercises the closed-error writer and project diagnostics path.
    await expect(h.set['benign-login'].takeReceipt('missing')).rejects.toMatchObject({ code: 'bridge-protocol' });
    const surfaces = [...h.surfaces, ...await artifactBytes(h.directory), ...await artifactBytes(h.root),
      Buffer.from(JSON.stringify(h.evidence.bridges.map((b) => b.responses))), Buffer.from(JSON.stringify(h.evidence.spawns)),
      Buffer.from(JSON.stringify(h.evidence.results)), Buffer.concat(stdoutBytes),
      Buffer.concat(stderrBytes)];
    const forms = Object.values(privateForms());
    for (const surface of surfaces) assertClean(surface, forms);
    assertClean(Buffer.from(known.pair!.publicKey.export({ type: 'spki', format: 'der' })), forms);
  } finally { stdout.mockRestore(); stderr.mockRestore(); await h.dispose(); }
});
it.each(['der', 'base64', 'base64url', 'pem', 'seed'])('synthetic private %s is caught by each actual ProjectCloser log export history and artifact reader', async (form) => {
  for (const sink of ['logs', 'export', 'image-history', 'artifacts']) {
    const h = await fakeProject(vi.fn); const project = await createComposedProject(h.options);
    const bytes = privateForms()[form];
    project.peers[0].registerSecret(bytes);
    try {
      const run = h.runner.run.getMockImplementation()!;
      h.runner.run.mockImplementation(async (spawn) => {
        const result = await run(spawn);
        if (kindOf(spawn) === sink && sink === 'logs') result.stdout += bytes.toString('latin1');
        if (kindOf(spawn) === sink && sink === 'image-history') result.stdout += Buffer.from(JSON.stringify({ CreatedBy: bytes.toString('latin1') }) + '\n').toString('latin1');
        return result;
      });
      if (sink === 'export') {
        const spawn = h.runner.spawnLongLived.getMockImplementation()!;
        h.runner.spawnLongLived.mockImplementation((description) => { const handle = spawn(description);
          if (kindOf(description) === 'export') (handle.stdout as PassThrough).push(bytes); return handle; });
      }
      if (sink === 'artifacts') await writeFile(join(h.root, 'private-key-plant'), bytes);
      await expect(project.closer.close(), `private-key reader:${sink}:${form}`).rejects.toMatchObject({ code: 'secret-exposed' });
    } finally { await project.closer.close().catch(() => {}); await h.dispose(); }
  }
});

it('actual HTTP failure response and fixed-code container stderr diagnostic exclude the mocked private key', async () => {
  const h = await realEvidence(vi.fn);
  const stderrBytes: Buffer[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((value, encoding) => {
    stderrBytes.push(writerBytes(value, encoding)); return true;
  });
  try {
    expect(h.fixtures[0].reachability).toBe('http');
    await h.set['benign-login'].registerRun(setupFor('A'));
    await rm(join(h.directory, 'a'), { recursive: true, force: true });
    const response = await fetch(h.fixtures[0].origin + '/login', { method: 'POST', body: loginFor('A'), redirect: 'manual' });
    expect(response.status).toBe(500);
    const body = Buffer.from(await response.arrayBuffer());
    const diagnostics = Buffer.concat(stderrBytes).toString('utf8');
    expect(diagnostics).toContain('fixture-error');
    for (const surface of [body, response.url, JSON.stringify([...response.headers]), Buffer.concat(stderrBytes)]) {
      assertClean(surface, Object.values(privateForms()));
    }
  } finally { stderr.mockRestore(); await h.dispose(); }
});
