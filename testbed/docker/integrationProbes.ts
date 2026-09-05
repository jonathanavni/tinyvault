// Browser probes observe no route from page content to the control transport across the enumerated
// target x method matrix, under the deployment requirement; the override mutant proves the matrix can see one.
// Every probe is classified 'route' | 'no-route' | 'unobserved', and a target whose every method is
// 'unobserved' is a coverage gap (red), never a silent pass.
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchChromium, type Browser, type Page } from '../../src/browser/playwright';
import { createSupervisedHost } from '../../src/supervisor/host';
import type { CredentialBackend } from '../../src/backends/backend';
import { validateTopology } from './topology.mjs';
const topology = validateTopology(JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8')));

export const REBOUND_NAME = 'tinyvault-rebound.test';
export type Target = { url: string; label: string; routable: boolean };
export type Probe = { method: string; target: string; statuses: number[]; outcome: string; failure?: string };
export function targets(documents: Record<string, any>[]): Target[] {
  // Host classes the harness machine can route to. Container-network addresses (gateway, container IPv4/IPv6)
  // are unroutable from a Docker Desktop host by construction: the page-content matrix still probes them, but the
  // supervised leg skips them because browser_close_session stalls while a connect to a black-hole address is
  // pending (recorded in BACKLOG as an M6 spec input, with its reproduction; not a slice-3 fix).
  const routable = new Set<string>(['127.0.0.1', '[::1]', 'host.docker.internal', REBOUND_NAME,
    ...Object.keys(topology.services)]);
  const network = new Set<string>();
  for (const doc of documents) {
    for (const net of Object.values(doc.NetworkSettings.Networks) as Record<string, string>[]) {
      if (net.Gateway) network.add(net.Gateway);
      if (net.IPAddress) network.add(net.IPAddress);
      if (net.GlobalIPv6Address) network.add(`[${net.GlobalIPv6Address}]`);
    }
  }
  const ports = new Set(Object.values(topology.services).flat().flatMap((p) => [p.host, p.container]));
  const entries = (hosts: Set<string>, isRoutable: boolean) => [...hosts].flatMap((host) => [...ports].map((port) => ({
    url: `http://${host}:${port}/control`, label: `${host}:${port}`, routable: isRoutable,
  })));
  return [...entries(routable, true), ...entries(network, false),
    { url: `file://${topology.controlSocket}`, label: 'internal-socket-file-url', routable: true }];
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
        // The blank iframe's load event fires synchronously on insertion; install the handler first.
        target.onload = () => { target.onload = () => finish('loaded'); form.submit(); };
        document.body.append(target, form);
      }
    } catch { finish('error'); }
  });
}
type Observed = { statuses: Map<string, number[]>; failures: Map<string, string>; firstResponse(url: string): Promise<void>; detach(): Promise<void> };
const RESPONSE_SETTLE_MS = 300;
// One CDP session per page; every probe URL carries a unique query so concurrent probes never share a key.
async function observe(page: Page): Promise<Observed> {
  const statuses = new Map<string, number[]>();
  const waiters = new Map<string, () => void>();
  const record = (url: string, status: number) => {
    statuses.set(url, [...(statuses.get(url) ?? []), status]);
    waiters.get(url)?.(); waiters.delete(url);
  };
  // Playwright delivers the `response` event asynchronously; an in-page attempt can resolve before Node sees it.
  const firstResponse = (url: string) => new Promise<void>((resolve) => {
    if (statuses.has(url)) { resolve(); return; }
    waiters.set(url, resolve);
  });
  const onResponse = (r: { url(): string; status(): number }) => record(r.url(), r.status());
  page.on('response', onResponse);
  // Cross-origin loads of HTML fail in the page (ORB for <img>, CORS for fetch) with no `response` event even
  // though the server answered; the failure text tells a reached server from a connection-level failure.
  const failures = new Map<string, string>();
  const onFailed = (r: { url(): string; failure(): { errorText: string } | null }) => {
    failures.set(r.url(), r.failure()?.errorText ?? 'unknown');
    waiters.get(r.url())?.(); waiters.delete(r.url());
  };
  page.on('requestfailed', onFailed);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const sockets = new Map<string, string>();
  cdp.on('Network.webSocketCreated', (e) => { sockets.set(e.requestId, e.url.replace(/^ws/, 'http')); });
  cdp.on('Network.webSocketHandshakeResponseReceived', (e) => {
    const url = sockets.get(e.requestId); if (url) record(url, e.response.status);
  });
  return { statuses, failures, firstResponse, detach: async () => {
    page.off('response', onResponse); page.off('requestfailed', onFailed); await cdp.detach();
  } };
}
async function attempt(page: Page, observed: Observed, target: Target, method: PageProbe['method']): Promise<Probe> {
  const url = new URL(target.url); url.searchParams.set('tv-probe', randomUUID());
  const frame = JSON.stringify({ v: 1, kind: 'req', id: 1, op: 'bootstrap', body: { secret: 'A'.repeat(43) } });
  const settled = observed.firstResponse(url.href);
  const outcome = await page.evaluate(browserAttempt, { url: url.href, method, frame });
  // A response that arrives within the settle window counts; a target with no response at all stays 'no route'.
  await Promise.race([settled, new Promise<void>((r) => setTimeout(r, RESPONSE_SETTLE_MS).unref())]);
  return { method, target: target.label, statuses: observed.statuses.get(url.href) ?? [], outcome,
    failure: observed.failures.get(url.href) };
}
// Connection-level or scheme-level failures mean nothing was addressed; every other failure (ORB, CORS,
// protocol) means a server answered but the page could not observe the response.
const NO_ROUTE_FAILURE = /ERR_(?:CONNECTION_(?:REFUSED|RESET|TIMED_OUT|CLOSED)|TIMED_OUT|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED|ABORTED|NETWORK_CHANGED|SOCKET_NOT_CONNECTED|ADDRESS_INVALID|ACCESS_DENIED|UNSAFE_PORT|UNKNOWN_URL_SCHEME|DISALLOWED_URL_SCHEME|BLOCKED_BY_CLIENT|FILE_NOT_FOUND|INVALID_URL)/;
export type ProbeClass = 'route' | 'no-route' | 'unobserved';
export function classifyProbe(probe: Probe): ProbeClass {
  if (probe.statuses.some((s) => s !== 404) || probe.outcome === 'open'
    || (/^\d+$/.test(probe.outcome) && probe.outcome !== '404')) return 'route';
  if (probe.statuses.length > 0 || probe.outcome === '404') return 'no-route';
  if (probe.failure !== undefined) return NO_ROUTE_FAILURE.test(probe.failure) ? 'no-route' : 'unobserved';
  // No status, no failure text, no open socket: nothing was observed at the network layer. This includes a
  // WebSocket that merely errored — an evidence-free error must not count as a verdict, or every target would
  // trivially satisfy coverage through it.
  return 'unobserved';
}
export const detectedRoute = (probe: Probe): boolean => classifyProbe(probe) === 'route';
// Reachability (the override mutant's oracle): a route, an observed response of any status, or a server-side failure.
export const reachedServer = (probe: Probe): boolean => classifyProbe(probe) === 'route' || probe.statuses.length > 0
  || (probe.failure !== undefined && !NO_ROUTE_FAILURE.test(probe.failure));
// Per target, at least one method must yield an observed verdict; otherwise the matrix was blind there.
export function coverageGaps(probes: Probe[]): string[] {
  const byTarget = new Map<string, ProbeClass[]>();
  for (const probe of probes) byTarget.set(probe.target, [...(byTarget.get(probe.target) ?? []), classifyProbe(probe)]);
  return [...byTarget].filter(([, classes]) => classes.every((c) => c === 'unobserved')).map(([target]) => target);
}
const TARGET_BATCH = 8;
export async function matrix(browser: Browser, hostile: string, destinations: Target[], invariant: () => void) {
  const page = await browser.newPage();
  const probes: Probe[] = [];
  const observed = await observe(page);
  try {
    await page.goto(hostile);
    // Probes are individually bounded (1.5-1.8 s); unroutable targets pay the full bound, so they run
    // concurrently per batch rather than one after another, and the invariant is checked after each batch.
    for (let i = 0; i < destinations.length; i += TARGET_BATCH) {
      const batch = destinations.slice(i, i + TARGET_BATCH);
      probes.push(...await Promise.all(batch.flatMap((target) => METHODS.map((method) => attempt(page, observed, target, method)))));
      invariant();
    }
    assert.equal(probes.length, destinations.length * METHODS.length);
    assert.deepEqual(coverageGaps(probes), [], 'matrix coverage gap: every method unobserved for these targets');
    return probes;
  } finally { await observed.detach(); await page.close(); }
}
const SUPERVISED_BOUND_MS = 20_000;
export async function supervisedMatrix(browser: Browser, hostile: string, destinations: Target[], invariant: () => void) {
  const unused = async (): Promise<never> => { throw new Error('unused'); };
  const backend: CredentialBackend = { listItems: async () => [], probeAvailability: unused,
    resolvePolicy: unused, resolveSecret: unused, dispose: async () => {} };
  const host = await createSupervisedHost({ backend, canary: 'TVC_probe_no_credentials', browser });
  try {
    for (const target of destinations.filter((t) => t.routable)) {
      // A supervised attempt that neither fails nor completes within the bound is a red, never a silent wait.
      await Promise.race([supervisedAttempt(browser, host, hostile, target, invariant),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`supervised probe stalled: ${target.label}`)), SUPERVISED_BOUND_MS).unref())]);
    }
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
