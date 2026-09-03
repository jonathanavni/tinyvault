import { describe, expect, it } from 'vitest';

import { CONTROL_LAB_ROUTES, startControlsLab } from '.';

const REQUIRED_CASE_ROUTES = [
  '/password-basic', '/contenteditable', '/text-input', '/disabled', '/readonly',
  '/hidden-attribute', '/display-none', '/visibility-hidden', '/opacity-zero',
  '/ancestor-opacity-zero', '/ancestor-filter-opacity-zero', '/offscreen', '/scale-zero',
  '/overlay', '/formless', '/off-origin-action', '/base-off-origin', '/base-same-origin',
  '/clobber-baseuri-off-origin', '/clobber-baseuri-same-origin',
  '/base-plus-formaction', '/clobbered-action-off-origin',
  '/clobbered-action-same-origin', '/descendant-formaction', '/external-formaction',
  '/image-formaction', '/image-formaction-external',
  '/foreign-form-claims-field',
  '/clobbered-elements-off-origin', '/clobbered-elements-same-origin',
  '/clobber-getattribute-same-origin', '/clobber-getattribute-off-origin',
  '/patched-type', '/poisoned-getattribute', '/poisoned-setter', '/below-fold', '/label-overlay',
  '/smooth-scroll', '/main-and-subframe',
  '/cross-origin-frame-only', '/same-origin-frame-only', '/nowhere', '/redirect-start',
  '/redirect-middle', '/redirect-final', '/document-open-after-pin', '/remove-after-pin',
  '/replace-after-pin', '/action-after-pin', '/base-injected-after-pin', '/image-formaction-after-pin', '/opacity-after-pin',
  '/overlay-after-pin',
  '/push-state-after-pin', '/token-rewrite', '/mirror-span', '/echo-field',
  '/self-navigating-iframe', '/iframe-self', '/iframe-final', '/static-token-login',
  '/storage', '/controls', '/post-body', '/query-leak', '/file-request',
  '/blob-leak', '/empty-beacon', '/bodyless-methods', '/worker-blob', '/worker-beacon', '/nested-worker-blob',
  '/workers-200',
  '/terminate-workers-20', '/navigate-workers-20',
  '/terminate-worker-slow', '/terminate-worker-fast', '/page-close-worker', '/page-close-worker-race',
  '/query-workers-200',
  '/popup-worker', '/popup-worker-child', '/popup-blob', '/popup-blob-child',
  '/close-about-blank', '/self-closing-popup', '/self-closing-popup-child',
  '/busy-popup', '/busy-popup-child',
  '/decoy-control', '/reflect-redirect', '/console-leak',
  '/header-leak', '/trailing-dot-leak', '/cookie-header-leak',
  '/ws-leak', '/ws-binary-leak', '/ws-protocol-leak', '/multipart-text-leak',
] as const;

describe('two-origin controls lab manifest', () => {
  it('kills fixture-case omission by listing one explicit route per locked B/C/E case', () => {
    expect(Object.keys(CONTROL_LAB_ROUTES)).toEqual(REQUIRED_CASE_ROUTES);
    expect(new Set(REQUIRED_CASE_ROUTES).size).toBe(REQUIRED_CASE_ROUTES.length);
    expect(Object.isFrozen(CONTROL_LAB_ROUTES)).toBe(true);
  });

  it('kills a one-origin/non-serving lab with live traffic on both loopback ports', async () => {
    const lab = await startControlsLab();
    try {
      expect(lab.primaryOrigin).not.toBe(lab.secondaryOrigin);
      const [primary, secondary, crossOriginCase] = await Promise.all([
        fetch(`${lab.primaryOrigin}/password-basic`).then((response) => response.text()),
        fetch(`${lab.secondaryOrigin}/password-basic`).then((response) => response.text()),
        fetch(`${lab.primaryOrigin}/off-origin-action`).then((response) => response.text()),
      ]);
      expect(primary).toContain('id="password"');
      expect(secondary).toContain('id="password"');
      expect(crossOriginCase).toContain(`action="${lab.secondaryOrigin}/submit"`);
      expect(lab.secondaryRequests()).toEqual([
        { method: 'GET', path: '/password-basic' },
      ]);
    } finally {
      await lab.close();
    }
  });

  it('kills duplicate route-supplied attributes across every controls-lab element', () => {
    const origins = { primary: 'http://127.0.0.1:3001', secondary: 'http://127.0.0.1:3002' };
    const duplicates = Object.entries(CONTROL_LAB_ROUTES).flatMap(([route, render]) =>
      duplicateAttributes(render(origins)).map((duplicate) => `${route}: ${duplicate}`));
    expect(duplicates).toEqual([]);

    const actionRoutes = [
      ['/off-origin-action', `${origins.secondary}/submit`],
      ['/clobbered-action-off-origin', `${origins.secondary}/submit`],
      ['/clobbered-action-same-origin', '/submit'],
    ] as const;
    for (const [route, action] of actionRoutes) {
      const html = CONTROL_LAB_ROUTES[route](origins);
      expect(html.match(/\baction=/gu)).toHaveLength(1);
      expect(html).toContain(`action="${action}"`);
      if (action !== '/submit') expect(html).not.toContain('action="/submit"');
    }
  });

  it('rejects oversized request bodies with a readable 413 on both origins', async () => {
    const lab = await startControlsLab();
    try {
      for (const origin of [lab.primaryOrigin, lab.secondaryOrigin]) {
        const response = await fetch(`${origin}/submit`, {
          method: 'POST', body: 'x'.repeat(1024 * 1024 + 1),
        });
        expect(response.status).toBe(413);
        expect(await response.text()).toBe('request body too large');
      }
    } finally {
      await lab.close();
    }
  });

  it('times out a request body that never completes without stalling either origin', async () => {
    const lab = await startControlsLab();
    try {
      for (const origin of [lab.primaryOrigin, lab.secondaryOrigin]) {
        await expect(incompletePost(`${origin}/submit`)).resolves.toEqual({
          status: 408,
          body: 'request body timeout',
        });
      }
    } finally {
      await lab.close();
    }
  });
});

function incompletePost(url: string): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: 'POST' });
    request.once('error', reject);
    request.once('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.once('end', () => {
        request.removeListener('error', reject);
        resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    request.write('partial');
  });
}

function duplicateAttributes(html: string): string[] {
  const duplicates: string[] = [];
  for (const tag of html.matchAll(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/giu)) {
    const names = [...(tag[2] ?? '').matchAll(
      /\s([^\s"'<>\/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/gu,
    )].map((match) => match[1]!.toLowerCase());
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) duplicates.push(`<${tag[1]!.toLowerCase()}> ${name}`);
      seen.add(name);
    }
  }
  return duplicates;
}
import { request as httpRequest } from 'node:http';
