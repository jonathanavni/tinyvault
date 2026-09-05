// Browser probes prove no route from page content to control transport under the deployment requirement.
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchChromium, type Browser, type Page } from '../../src/browser/playwright';
import { createSupervisedHost } from '../../src/supervisor/host';
import type { CredentialBackend } from '../../src/backends/backend';
import { validateTopology } from './topology.mjs';
const topology = validateTopology(JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8')));

export const REBOUND_NAME = 'tinyvault-rebound.test';
export type Target = { url: string; label: string };
export type Probe = { method: string; target: string; statuses: number[]; outcome: string };
export function targets(documents: Record<string, any>[]): Target[] {
  const internal = new Set<string>(['127.0.0.1', '[::1]', 'host.docker.internal', REBOUND_NAME,
    ...Object.keys(topology.services)]);
  for (const doc of documents) {
    for (const network of Object.values(doc.NetworkSettings.Networks) as Record<string, string>[]) {
      if (network.Gateway) internal.add(network.Gateway);
      if (network.IPAddress) internal.add(network.IPAddress);
      if (network.GlobalIPv6Address) internal.add(`[${network.GlobalIPv6Address}]`);
    }
  }
  const ports = new Set(Object.values(topology.services).flat().flatMap((p) => [p.host, p.container]));
  return [...internal].flatMap((host) => [...ports].map((port) => ({
    url: `http://${host}:${port}/control`, label: `${host}:${port}`,
  }))).concat([{ url: `file://${topology.controlSocket}`, label: 'internal-socket-file-url' }]);
}
export function probeBrowser(): Promise<Browser> {
  return launchChromium(undefined, [`--host-resolver-rules=MAP ${REBOUND_NAME} 127.0.0.1`]);
}
const METHODS = ['fetch', 'form', 'img', 'websocket', 'worker'] as const;
type PageProbe = { url: string; method: typeof METHODS[number]; frame: string };
function browserAttempt({ url, method, frame }: PageProbe): Promise<string> {
  if (method === 'fetch') return fetch(url, { method: 'POST', body: frame, signal: AbortSignal.timeout(1500) })
    .then((s) => { void s.body?.cancel(); return String(s.status); }, () => 'error');
  return new Promise((resolve) => {
    let cleanup = () => {};
    const finish = (value: string) => { clearTimeout(timer); cleanup(); resolve(value); };
    const timer = setTimeout(() => finish('error'), 1800);
    try {
      if (method === 'worker') {
        const source = `onmessage=async(e)=>{try{const s=await fetch(e.data.url,{method:'POST',body:e.data.frame,signal:AbortSignal.timeout(1500)});postMessage(String(s.status))}catch{postMessage('error')}}`;
        const blob = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const worker = new Worker(blob);
        cleanup = () => { worker.terminate(); URL.revokeObjectURL(blob); };
        worker.onmessage = (e) => finish(e.data); worker.onerror = () => finish('error');
        worker.postMessage({ url, frame });
      } else if (method === 'websocket') {
        const socket = new WebSocket(url.replace(/^http/, 'ws'));
        cleanup = () => socket.close();
        socket.onopen = () => {
          const payload = new TextEncoder().encode(frame); const bytes = new Uint8Array(4 + payload.length);
          new DataView(bytes.buffer).setUint32(0, payload.length); bytes.set(payload, 4);
          socket.send(bytes); finish('open');
        };
        socket.onerror = () => finish('error');
      } else if (method === 'img') {
        const img = new Image(); cleanup = () => { img.src = ''; img.remove(); };
        img.onload = () => finish('loaded'); img.onerror = () => finish('error'); img.src = url;
      } else {
        const target = document.createElement('iframe'); target.name = `probe-${Math.random()}`;
        const form = document.createElement('form'); form.target = target.name; form.method = 'POST'; form.action = url;
        const field = document.createElement('input'); field.name = 'frame'; field.value = frame; form.append(field);
        cleanup = () => { target.remove(); form.remove(); };
        document.body.append(target, form);
        target.onload = () => { target.onload = () => finish('loaded'); form.submit(); };
      }
    } catch { finish('error'); }
  });
}
async function attempt(page: Page, target: Target, method: PageProbe['method']): Promise<Probe> {
  const url = new URL(target.url); url.searchParams.set('tv-probe', randomUUID());
  const statuses: number[] = [];
  const onResponse = (r: { url(): string; status(): number }) => {
    if (r.url() === url.href) statuses.push(r.status());
  };
  page.on('response', onResponse);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const wsIds = new Set<string>();
  cdp.on('Network.webSocketCreated', (e) => { if (e.url === url.href.replace(/^http/, 'ws')) wsIds.add(e.requestId); });
  cdp.on('Network.webSocketHandshakeResponseReceived', (e) => {
    if (wsIds.has(e.requestId)) statuses.push(e.response.status);
  });
  try {
    const frame = JSON.stringify({ v: 1, kind: 'req', id: 1, op: 'bootstrap', body: { secret: 'A'.repeat(43) } });
    const outcome = await page.evaluate(browserAttempt, { url: url.href, method, frame });
    return { method, target: target.label, statuses, outcome };
  } finally { page.off('response', onResponse); await cdp.detach(); }
}
export const detectedRoute = (probe: Probe): boolean => probe.statuses.some((s) => s !== 404)
  || probe.outcome === 'open' || /^\d+$/.test(probe.outcome) && probe.outcome !== '404';
export async function matrix(browser: Browser, hostile: string, destinations: Target[], invariant: () => void) {
  const page = await browser.newPage();
  const probes: Probe[] = [];
  try {
    await page.goto(hostile);
    for (const target of destinations) {
      for (const method of METHODS) { probes.push(await attempt(page, target, method)); invariant(); }
    }
    assert.equal(probes.length, destinations.length * METHODS.length);
    return probes;
  } finally { await page.close(); }
}
export async function supervisedMatrix(browser: Browser, hostile: string, destinations: Target[], invariant: () => void) {
  const unused = async (): Promise<never> => { throw new Error('unused'); };
  const backend: CredentialBackend = { listItems: async () => [], probeAvailability: unused,
    resolvePolicy: unused, resolveSecret: unused, dispose: async () => {} };
  const host = await createSupervisedHost({ backend, canary: 'TVC_probe_no_credentials', browser });
  try {
    for (const target of destinations) await supervisedAttempt(browser, host, hostile, target, invariant);
  } finally { host.abort(); await host.closeAll(); }
}
async function supervisedAttempt(browser: Browser, host: Awaited<ReturnType<typeof createSupervisedHost>>,
  hostile: string, target: Target, invariant: () => void): Promise<void> {
  // Fresh sessions avoid the pending chrome-error navigation race after a refused target.
  const before = new Set(browser.contexts());
  const { sessionId } = await host.tools.browser_open_session();
  const context = browser.contexts().find((c) => !before.has(c))!;
  context.setDefaultNavigationTimeout(1500);
  const page = context.pages()[0];
  try {
    assert.deepEqual(await host.tools.browser_navigate({ sessionId, url: hostile }), { ok: true });
    const statuses: number[] = [];
    page.on('response', (r) => { if (r.url() === target.url) statuses.push(r.status()); });
    const result = await host.tools.browser_navigate({ sessionId, url: target.url });
    assert.equal(statuses.every((s) => s === 404), true);
    assert.equal(!result.ok || statuses.includes(404), true);
    invariant();
  } finally { await host.tools.browser_close_session({ sessionId }); }
}
