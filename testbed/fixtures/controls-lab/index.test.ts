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
  '/storage', '/controls', '/post-body',
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
});

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
