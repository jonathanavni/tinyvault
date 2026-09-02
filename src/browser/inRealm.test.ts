import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGN_SOURCE,
  DESTINATION_PREDICATES_SOURCE,
  SNAPSHOT_SOURCE,
  VERIFY_DESTINATION_SOURCE,
} from './inRealm';

type FakeNode = {
  filter?: string;
  opacity?: number;
  parentElement: FakeNode | null;
};

class FakeForm {
  readonly attributes = new Map<string, string>([['action', '/submit']]);
  controls: FakeControl[] = [];

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

Object.defineProperty(FakeForm.prototype, 'elements', {
  get(this: FakeForm) { return this.controls; },
});

class FakeControl {
  tagName = 'BUTTON';
  readonly attributes = new Map<string, string>([['type', 'submit']]);

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class FakeInput implements FakeNode {
  readonly attributes = new Map<string, string>([
    ['type', 'password'],
    ['data-tv-control', 'control-before'],
  ]);
  readonly events: string[] = [];
  readonly scrollCalls: unknown[] = [];
  readonly assigned: string[] = [];
  [Symbol.toStringTag] = 'HTMLInputElement';
  type = 'password';
  disabled = false;
  readOnly = false;
  isConnected = true;
  visible = true;
  filter = 'none';
  form: FakeForm | null = new FakeForm();
  parentElement: FakeNode | null = null;
  rect = { left: 20, top: 20, width: 100, height: 20 };
  hit: unknown = this;
  onDispatch?: (type: string) => void;

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  scrollIntoView(options: unknown): void {
    this.scrollCalls.push(options);
  }

  checkVisibility(options: unknown): boolean {
    expect(options).toEqual({ checkOpacity: true, checkVisibilityCSS: true });
    for (let node: FakeNode | null = this; node; node = node.parentElement) {
      if (node.opacity === 0) return false;
    }
    return this.visible;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  contains(value: unknown): boolean {
    return typeof value === 'object' && value !== null && 'descendant' in value;
  }

  dispatchEvent(event: { type: string }): boolean {
    this.events.push(event.type);
    this.onDispatch?.(event.type);
    return true;
  }
}

Object.defineProperty(FakeInput.prototype, 'value', {
  configurable: true,
  get(this: FakeInput) { return this.assigned.at(-1) ?? ''; },
  set(this: FakeInput, value: string) { this.assigned.push(value); },
});

class FakeLabel {
  [Symbol.toStringTag] = 'HTMLLabelElement';
  constructor(readonly control: FakeInput) {}
}

class FakeEvent {
  constructor(readonly type: string, readonly options?: unknown) {}
}

type Realm = ReturnType<typeof installRealm>;

function installRealm(): { input: FakeInput; form: FakeForm; documentElement: Map<string, string>; window: any } {
  const input = new FakeInput();
  const form = input.form!;
  form.controls.push(new FakeControl());
  const documentElement = new Map<string, string>([['data-tv-document', 'document-before']]);
  const fakeWindow: any = {
    innerWidth: 1024,
    innerHeight: 768,
    getComputedStyle: (node: FakeNode) => ({ filter: node.filter ?? 'none' }),
  };
  fakeWindow.top = fakeWindow;
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('location', { origin: 'https://example.test', href: 'https://example.test/login', pathname: '/login' });
  vi.stubGlobal('document', {
    documentElement: { getAttribute: (name: string) => documentElement.get(name) ?? null },
    elementFromPoint: () => input.hit,
  });
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLFormElement', FakeForm);
  vi.stubGlobal('Event', FakeEvent);
  return { input, form, documentElement, window: fakeWindow };
}

function sourceFunction(source: string): (...args: any[]) => any {
  return Function(`return (${source});`)() as (...args: any[]) => any;
}

function fixedHex(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    output += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return output.padEnd(16_384, '0041');
}

describe('isolated-world source strings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('kills a host-only origin check by refusing before the setter and returning the observed origin', () => {
    const { input } = installRealm();
    const result = sourceFunction(ASSIGN_SOURCE).call(input, 'https://other.test', fixedHex('secret'), '0006');
    expect(result).toEqual({ assigned: false, reason: 'origin', observedOrigin: 'https://example.test' });
    expect(input.assigned).toEqual([]);
    const control = installRealm();
    expect(sourceFunction(ASSIGN_SOURCE).call(
      control.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toMatchObject({ assigned: true });
  });

  const predicateMutants: Array<[string, (realm: Realm) => void]> = [
    ['non-input tag', ({ input }) => { input[Symbol.toStringTag] = 'HTMLDivElement'; }],
    ['declared non-password type', ({ input }) => { input.attributes.set('type', 'text'); }],
    ['live non-password type', ({ input }) => { input.type = 'text'; }],
    ['disabled', ({ input }) => { input.disabled = true; }],
    ['readonly', ({ input }) => { input.readOnly = true; }],
    ['hidden attribute', ({ input }) => { input.attributes.set('hidden', ''); }],
    ['detached', ({ input }) => { input.isConnected = false; }],
    ['form-less', ({ input }) => { input.form = null; }],
    ['off-origin action', ({ form }) => { form.attributes.set('action', 'https://other.test/submit'); }],
    ['off-origin formaction', ({ form }) => { form.controls[0]!.attributes.set('formaction', 'https://other.test'); }],
    ['checkVisibility false', ({ input }) => { input.visible = false; }],
    ['ancestor opacity', ({ input }) => { input.parentElement = { parentElement: null, opacity: 0 }; }],
    ['ancestor filter opacity', ({ input }) => { input.parentElement = { parentElement: null, filter: 'opacity(0)' }; }],
    ['zero area', ({ input }) => { input.rect.width = 0; }],
    ['outside viewport', ({ input }) => { input.rect.left = -500; }],
    ['covered hit point', ({ input }) => { input.hit = {}; }],
  ];

  it.each(predicateMutants)('kills the %s shared-predicate mutant before assignment', (_name, mutate) => {
    const realm = installRealm();
    mutate(realm);
    const result = sourceFunction(ASSIGN_SOURCE).call(
      realm.input, 'https://example.test', fixedHex('secret'), '0006',
    );
    expect(result).toEqual({ assigned: false, reason: 'identity' });
    expect(realm.input.assigned).toEqual([]);
    const control = installRealm();
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(control.input)).toBe(true);
  });

  it('kills form.elements clobbering by calling the native getter', () => {
    const realm = installRealm();
    Object.defineProperty(realm.form, 'elements', { value: [] });
    realm.form.controls[0]!.attributes.set('formaction', 'https://other.test/submit');
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(false);
    realm.form.controls[0]!.attributes.set('formaction', '/submit');
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(true);
  });

  it('kills a missing top-frame predicate while retaining the specified origin-first assign reason', () => {
    const realm = installRealm();
    realm.window.top = {};
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(false);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      realm.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'origin', observedOrigin: 'https://example.test' });
  });

  it('kills post-dispatch token reads, page setter use, wrong event order, and whole-hex decoding', () => {
    const realm = installRealm();
    let poisoned = false;
    Object.defineProperty(realm.input, 'value', { set: () => { poisoned = true; } });
    realm.input.onDispatch = (type) => {
      if (type !== 'input') return;
      realm.input.attributes.set('data-tv-control', 'control-after');
      realm.documentElement.set('data-tv-document', 'document-after');
    };
    const value = `A${String.fromCharCode(0xd83d, 0xde00)}B`;
    const result = sourceFunction(ASSIGN_SOURCE).call(
      realm.input, 'https://example.test', fixedHex(`${value}ignored`), String(value.length).padStart(4, '0'),
    );
    expect(result).toEqual({
      assigned: true,
      observedOrigin: 'https://example.test',
      controlToken: 'control-before',
      documentToken: 'document-before',
    });
    expect(realm.input.assigned).toEqual([value]);
    expect(realm.input.events).toEqual(['focus', 'input', 'change', 'blur']);
    expect(realm.input.scrollCalls).toEqual([{ block: 'center', inline: 'nearest', behavior: 'instant' }]);
    expect(poisoned).toBe(false);
  });

  it.each(['self', 'descendant', 'label'] as const)(
    'kills an over-strict hit-test while retaining the legitimate %s traffic control',
    (kind) => {
      const realm = installRealm();
      if (kind === 'descendant') realm.input.hit = { descendant: true };
      if (kind === 'label') realm.input.hit = new FakeLabel(realm.input);
      expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(true);
    },
  );

  it('kills split/shared-source and asynchronous in-realm implementations', () => {
    for (const source of [DESTINATION_PREDICATES_SOURCE, VERIFY_DESTINATION_SOURCE, ASSIGN_SOURCE, SNAPSHOT_SOURCE]) {
      expect(source.trimStart().startsWith('function')).toBe(true);
      expect(source).not.toMatch(/\b(?:async|await)\b|\.then\s*\(/u);
    }
    expect(VERIFY_DESTINATION_SOURCE).toContain(DESTINATION_PREDICATES_SOURCE);
    expect(ASSIGN_SOURCE).toContain(DESTINATION_PREDICATES_SOURCE);
  });

  it('kills value-dependent masking by allowing .value only in the unmasked branch', () => {
    const accesses = [...SNAPSHOT_SOURCE.matchAll(/\.value\b/gu)].map((match) => match.index);
    expect(accesses.length).toBeGreaterThan(0);
    expect(accesses.every((index) => index! > SNAPSHOT_SOURCE.indexOf('} else {'))).toBe(true);
    expect(SNAPSHOT_SOURCE.indexOf('var masked =')).toBeLessThan(SNAPSHOT_SOURCE.indexOf('if (masked)'));
  });

  it('pins value to controls and own text to name without duplicating it as value', () => {
    vi.stubGlobal('Node', { TEXT_NODE: 3 });
    vi.stubGlobal('location', { origin: 'https://example.test', pathname: '/snapshot' });
    const textNode = { nodeType: 3, textContent: 'paragraph text', nextSibling: null };
    const input = {
      tagName: 'INPUT', type: 'text', value: 'field value', firstChild: null, labels: undefined,
      getAttribute: (name: string) => name === 'aria-label' ? 'Echo' : null,
    };
    const paragraph = {
      tagName: 'P', firstChild: textNode, labels: undefined,
      getAttribute: (_name: string) => null,
    };
    const root = { querySelectorAll: () => [input, paragraph] };

    expect(sourceFunction(SNAPSHOT_SOURCE).call(root)).toEqual({
      url: 'https://example.test/snapshot',
      nodes: [
        { tag: 'input', masked: false, name: 'Echo', value: 'field value' },
        { tag: 'p', masked: false, name: 'paragraph text' },
      ],
    });
  });
});
