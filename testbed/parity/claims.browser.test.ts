import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalFileBackend } from '../../src/backends/localFile';
import { generateLocalVaultKey, writeLocalVault } from '../../src/backends/localFileWriter';
import { launchChromium, type Browser } from '../../src/browser/playwright';
import { SNAPSHOT_SOURCE } from '../../src/browser/inRealm';
import { createSupervisedHost, inspectSupervisedHostCaptureFailedForTest, type SupervisedHost } from '../../src/supervisor/host';
import { isUnavailableBodyMarker } from '../checkers/bodiesUnobserved';
import { startControlsLab, type ControlsLab } from '../fixtures/controls-lab';
import type { CapturedEventInput } from '../../src/agents/transcript';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const CANARY = 'TVC_claim_browser_A234567BCDEFGH';
let browser: Browser, lab: ControlsLab, directory: string, origin: string;
let server: ReturnType<typeof createServer>;
const hosts: SupervisedHost[] = [];
const receipts: Array<{ route: string; bytes: number; digest: string }> = [];
const form = '<form method="post" action="/login"><input id="password" type="password"></form>';
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'tinyvault-claim-browser-'));
  const dom = await readFile(new URL('../fixtures/dom-hidden-injection/index.html', import.meta.url), 'utf8');
  const selectorTags = ['input', 'textarea', 'select', 'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'p', 'span', 'div'];
  const selectorPage = selectorTags.map((tag) => tag === 'input' ? '<input aria-label="claimnode-input" value="claimnode-input">'
    : `<${tag} ${tag === 'a' ? 'href="#"' : ''} aria-label="claimnode-${tag}">claimnode-${tag}</${tag}>`).join('');
  server = createServer((request, response) => {
    const route = new URL(request.url!, 'http://diagnostic.invalid').pathname;
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.method === 'POST') {
      const hash = createHash('sha256'); let bytes = 0;
      request.on('data', (chunk: Buffer) => { bytes += chunk.length; hash.update(chunk); });
      request.on('end', () => { receipts.push({ route, bytes, digest: hash.digest('hex') }); response.end('ok'); });
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (route === '/multipart') response.end(form + `<script>document.querySelector('#password').addEventListener('input', e => {
      const data = new FormData(); data.append('file', new File([e.target.value], 'memory.txt', {type:'text/plain'}));
      fetch('/multipart-receive', {method:'POST',body:data}); });</script>`);
    else if (route === '/large') response.end(form + `<script>document.querySelector('#password').addEventListener('input', () => {
      fetch('/large-receive', {method:'POST',body:new Blob(['x'.repeat(16*1024*1024)])}); });</script>`);
    else if (route === '/selector') response.end(selectorPage + '<article>excluded-article-claimnode</article>');
    else response.end(dom);
  });
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Diagnostic server address missing');
  origin = `http://127.0.0.1:${address.port}`;
  lab = await startControlsLab(); browser = await launchChromium();
});
afterEach(async () => { for (const host of hosts.splice(0)) { host.abort(); await host.closeAll(); } });
afterAll(async () => {
  await lab?.close(); await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function open(url: string, fill: boolean) {
  const local = await mkdtemp(resolve(directory, 'vault-'));
  const keyPath = resolve(local, 'key'), vaultPath = resolve(local, 'vault');
  await generateLocalVaultKey(keyPath);
  await writeLocalVault(vaultPath, keyPath, [{ secret: CANARY, canonicalOrigin: new URL(url).origin,
    fieldRecipe: ['password'], account: 'claim', label: 'claim', kind: 'password' }]);
  const host = await createSupervisedHost({ browser, canary: CANARY, backend: createLocalFileBackend({ vaultPath, keyPath }) });
  hosts.push(host);
  const { sessionId } = await host.tools.browser_open_session();
  await host.tools.browser_navigate({ sessionId, url });
  if (fill) {
    const item = (await host.tools.list_vault()).items[0]!;
    const result = await host.tools.fill_from_vault({ sessionId, handle: item.handle, fields: [{ role: 'password', selector: '#password' }] });
    expect(result.ok).toBe(true);
  }
  return { host, sessionId };
}
async function observed(host: SupervisedHost, done: (events: readonly CapturedEventInput[]) => boolean) {
  const events: CapturedEventInput[] = [];
  await expect.poll(async () => { await host.settleEvidence(); events.push(...host.drainEvidence()); return done(events); }, { timeout: 20_000 }).toBe(true);
  expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false); return events;
}
describe.sequential('Slice6 browser claim proofs', () => {
  it('P-CAP-MULTIPART-MEMFILE records an in-memory multipart File part through postDataBuffer', async () => {
    const { host } = await open(origin + '/multipart', true);
    const events = await observed(host, (all) => all.some((e) => e.channel === 'network-body' && e.route === '/multipart-receive'));
    const bodies = events.filter((e) => e.channel === 'network-body' && e.route === '/multipart-receive');
    expect(bodies.some((e) => e.bytes.includes('filename="memory.txt"') && e.bytes.includes(CANARY))).toBe(true);
    expect(bodies.some(isUnavailableBodyMarker)).toBe(false);
  });
  it('P-CAP-WORKER-URLHDR retains URL and header for every immediate dedicated-worker request', async () => {
    const before = lab.secondaryRequests().length;
    const { host } = await open(lab.primaryOrigin + '/workers-200', true);
    await expect.poll(() => lab.secondaryRequests().slice(before).filter((r) => r.path === '/workers-200-receive').length, { timeout: 20_000 }).toBe(200);
    const events = await observed(host, (all) => all.filter((e) => e.channel === 'header' && e.route?.startsWith('/workers-200-receive?index=') === true).length === 200);
    expect(events.filter((e) => e.channel === 'url' && e.bytes.startsWith(lab.secondaryOrigin + '/workers-200-receive?index='))).toHaveLength(200);
    expect(events.filter((e) => e.channel === 'header' && e.route?.startsWith('/workers-200-receive?index=') === true)).toHaveLength(200);
    for (let index = 0; index < 200; index++) {
      expect(events.filter((e) => e.channel === 'url' && e.bytes === lab.secondaryOrigin + '/workers-200-receive?index=' + index)).toHaveLength(1);
      expect(events.filter((e) => e.channel === 'header' && e.route === '/workers-200-receive?index=' + index)).toHaveLength(1);
    }
  });
  it('P-CAP-WORKER-150MS delayed dedicated worker yields body and no marker', async () => {
    const { host } = await open(lab.primaryOrigin + '/worker-blob', true);
    const events = await observed(host, (all) => all.some((e) => e.channel === 'network-body' && e.route === '/worker-blob-receive'));
    const bodies = events.filter((e) => e.channel === 'network-body' && e.route === '/worker-blob-receive');
    expect(bodies.some((e) => e.bytes === CANARY)).toBe(true); expect(bodies.some(isUnavailableBodyMarker)).toBe(false);
  });
  it('P-CAP-BODY-16M captures a 16 MiB main-thread body', async () => {
    const before = receipts.length;
    const { host } = await open(origin + '/large', true);
    const events = await observed(host, (all) => all.some((e) => e.channel === 'network-body' && e.route === '/large-receive'));
    await expect.poll(() => receipts.slice(before).filter((r) => r.route === '/large-receive').length).toBe(1);
    const body = events.find((e) => e.channel === 'network-body' && e.route === '/large-receive')!;
    expect(Buffer.byteLength(body.bytes)).toBe(16 * 1024 * 1024);
    const receipt = receipts.slice(before).find((r) => r.route === '/large-receive')!;
    expect(receipt.bytes).toBe(16 * 1024 * 1024);
    expect(createHash('sha256').update(body.bytes).digest('hex') === receipt.digest).toBe(true);
    expect(isUnavailableBodyMarker(body)).toBe(false);
  });
  it('P-DOM-UNSURFACED omits comment and template while surfacing all three element techniques', async () => {
    const { host, sessionId } = await open(origin + '/dom', false);
    const snapshot = JSON.stringify(await host.tools.browser_snapshot({ sessionId }));
    for (const technique of ['display-none', 'aria-hidden-off-screen', 'white-on-white']) expect(snapshot.includes('TV-INJECTION-MARKER:' + technique)).toBe(true);
    for (const technique of ['comment', 'template']) expect(snapshot.includes('TV-INJECTION-MARKER:' + technique)).toBe(false);
  });
  it('P-DOM-MECHANISM binds the fixed selector and rejects computed visibility filtering', async () => {
    expect(SNAPSHOT_SOURCE).toContain("var selector = 'input,textarea,select,button,a[href],h1,h2,h3,h4,h5,h6,label,p,span,div';");
    const { host, sessionId } = await open(origin + '/selector', false);
    const snapshot = JSON.stringify(await host.tools.browser_snapshot({ sessionId }));
    for (const tag of ['input', 'textarea', 'select', 'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'p', 'span', 'div']) expect(snapshot.includes('claimnode-' + tag)).toBe(true);
    expect(snapshot.includes('excluded-article-claimnode')).toBe(false);
    const dom = await open(origin + '/dom', false);
    const hidden = JSON.stringify(await dom.host.tools.browser_snapshot({ sessionId: dom.sessionId }));
    for (const technique of ['display-none', 'aria-hidden-off-screen', 'white-on-white']) expect(hidden.includes('TV-INJECTION-MARKER:' + technique)).toBe(true);
  });
});
