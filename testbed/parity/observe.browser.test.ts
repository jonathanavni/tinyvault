import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { launchChromium } from '../../src/browser/playwright';
import { createParityCollector } from './observe';
import type { ParityRunDescriptor } from './types';

// Response duplicates are real Chromium evidence. Request duplicates are supplied
// structural observations in observe.test.ts; production allHeaders still coalesces.
describe('live parity wire observer', () => {
  it('retains response duplicate order, cookies, 302/303/200, queries and two runs with two contexts', async () => {
    const synthetic = 'parity-synthetic-canary';
    const server = createServer((request, response) => {
      const url = new URL(request.url!, 'http://diagnostic.invalid');
      response.setHeader('X-Parity', ['harmless', synthetic]);
      response.setHeader('Set-Cookie', ['first=one; Path=/', 'second=two; Path=/']);
      if (url.pathname === '/first') { response.writeHead(302, { Location: `/second${url.search}` }); response.end(); }
      else if (url.pathname === '/second') { response.writeHead(303, { Location: `/final${url.search}` }); response.end(); }
      else { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Diagnostic</title>'); }
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Diagnostic address unavailable');
    const origin = `http://127.0.0.1:${address.port}`;
    const descriptors: ParityRunDescriptor[] = [0, 1].map((runIndex) => ({ scenario: 'diagnostic', agent: 'stub', runIndex,
      runId: `diagnostic-${runIndex}`, canary: synthetic, canaryId: 'diagnostic', nonce: `nonce-${runIndex}`,
      vaultPath: '/diagnostic/vault', keyPath: '/diagnostic/key', transcriptPath: '/diagnostic/transcript', eventsPath: '/diagnostic/events' }));
    const collector = createParityCollector(descriptors);
    let browser: Awaited<ReturnType<typeof launchChromium>> | undefined;
    try {
      browser = await launchChromium();
      for (const d of descriptors) {
        const facade = collector.beginRun(d, browser);
        for (let contextIndex = 0; contextIndex < 2; contextIndex++) {
          const context = await facade.newContext();
          try {
            const page = await context.newPage();
            await page.goto(`${origin}/first?run=${d.runIndex}&context=${contextIndex}`);
          } finally { await context.close(); }
        }
        await collector.endRun(d); collector.collectUnauthorized(d, []);
      }
      const snapshots = collector.snapshots();
      expect(snapshots.map((s) => s.descriptor.runIndex)).toEqual([0, 1]);
      for (const snap of snapshots) {
        const wire = snap.wire!;
        expect(wire.map((event) => event.eventIndex)).toEqual(Array.from({ length: 12 }, (_, i) => i));
        expect(wire.map((event) => event.kind)).toEqual(Array.from({ length: 6 }, () => ['request', 'response']).flat());
        expect(wire.map((event) => event.requestId)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
        expect(wire.map((event) => event.contextId)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
        const requests = wire.filter((e) => e.kind === 'request');
        expect(requests.map((e) => e.redirectedFrom)).toEqual([null, 0, 1, null, 3, 4]);
        expect(requests.map((e) => new URL(e.url).pathname)).toEqual(['/first', '/second', '/final', '/first', '/second', '/final']);
        expect(requests.every((e) => new URL(e.url).searchParams.get('run') === String(snap.descriptor.runIndex))).toBe(true);
        expect(requests.every((e) => new URL(e.url).searchParams.get('context') === String(e.contextId))).toBe(true);
        const responses = wire.filter((e) => e.kind === 'response');
        expect(responses.map((e) => e.status)).toEqual([302, 303, 200, 302, 303, 200]);
        for (const event of responses) {
          expect(event.headers.state).toBe('present');
          if (event.headers.state !== 'present') throw new Error('Missing diagnostic observation');
          const duplicates = event.headers.entries.filter((h) => h.name.toLowerCase() === 'x-parity');
          // Booleans keep synthetic header bytes out of assertion failure diagnostics.
          expect(duplicates.length === 2 && duplicates[0].value === 'harmless' && duplicates[1].value === synthetic).toBe(true);
          const cookies = event.headers.entries.filter((h) => h.name.toLowerCase() === 'set-cookie');
          expect(cookies.length === 2 && cookies[0].value === 'first=one; Path=/' && cookies[1].value === 'second=two; Path=/').toBe(true);
        }
      }
    } finally {
      await browser?.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 30000);
});
