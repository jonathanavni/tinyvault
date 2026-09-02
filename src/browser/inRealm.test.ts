import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_SECRET_CODE_UNITS } from '../core/browserPort';
import {
  ASSIGN_SOURCE,
  DESTINATION_PREDICATES_SOURCE,
  SNAPSHOT_SOURCE,
  TYPE_SOURCE,
  VERIFY_DESTINATION_SOURCE,
} from './inRealm';

type FakeNode = {
  filter?: string;
  opacity?: number;
  parentElement: FakeNode | null;
};

class FakeElement {
  readonly attributes: Map<string, string>;

  constructor(attributes: readonly (readonly [string, string])[] = []) {
    this.attributes = new Map(attributes);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class FakeForm extends FakeElement {
  controls: FakeControl[] = [];

  constructor() {
    super([['action', '/submit']]);
  }
}

Object.defineProperty(FakeForm.prototype, 'elements', {
  get(this: FakeForm) { return this.controls; },
});

class FakeControl extends FakeElement {
  tagName = 'BUTTON';

  constructor() {
    super([['type', 'submit']]);
  }
}

class FakeInput extends FakeElement implements FakeNode {
  readonly events: string[] = [];
  readonly scrollCalls: unknown[] = [];
  readonly assigned: string[] = [];
  [Symbol.toStringTag] = 'HTMLInputElement';
  type: string;
  disabled = false;
  readOnly = false;
  isConnected = true;
  visible = true;
  filter = 'none';
  associatedForm: FakeForm | null;
  parentElement: FakeNode | null = null;
  rect = { left: 20, top: 20, width: 100, height: 20 };
  hit: unknown = this;
  onDispatch?: (type: string) => void;

  constructor(type = 'password', form: FakeForm | null = new FakeForm()) {
    super([['type', type], ['data-tv-control', 'control-before']]);
    this.type = type;
    this.associatedForm = form;
  }

  get form(): FakeForm | null { return this.associatedForm; }
  set form(value: FakeForm | null) { this.associatedForm = value; }

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

class FakeDomNode {
  static readonly TEXT_NODE = 3;
  baseURL = 'https://example.test/login';

  get baseURI(): string {
    return this.baseURL;
  }
}

class FakeDocument extends FakeDomNode {
  readonly imageButtons: FakeInput[] = [];
  readonly documentElement: FakeElement;

  constructor(private readonly hitTarget: FakeInput, attributes: Map<string, string>) {
    super();
    this.documentElement = new FakeElement([...attributes]);
  }

  elementFromPoint(): unknown { return this.hitTarget.hit; }

  querySelectorAll(selector: string): FakeInput[] {
    expect(selector).toBe('input[type=image]');
    return this.imageButtons;
  }
}

type Realm = ReturnType<typeof installRealm>;

function installRealm(): {
  input: FakeInput;
  form: FakeForm;
  document: FakeDocument;
  documentElement: Map<string, string>;
  window: any;
} {
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
  const document = new FakeDocument(input, documentElement);
  vi.stubGlobal('document', document);
  vi.stubGlobal('Node', FakeDomNode);
  vi.stubGlobal('Document', FakeDocument);
  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLFormElement', FakeForm);
  vi.stubGlobal('Event', FakeEvent);
  return { input, form, document, documentElement, window: fakeWindow };
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

  it('enumerates image submit buttons outside form.elements and checks native form association', () => {
    const offOrigin = installRealm();
    const image = new FakeInput('image', offOrigin.form);
    image.attributes.set('formaction', 'https://other.test/steal');
    offOrigin.document.imageButtons.push(image);
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(offOrigin.input)).toBe(false);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      offOrigin.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'identity' });
    expect(offOrigin.input.assigned).toEqual([]);

    const sameOrigin = installRealm();
    const safeImage = new FakeInput('image', sameOrigin.form);
    safeImage.attributes.set('formaction', '/submit');
    sameOrigin.document.imageButtons.push(safeImage);
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(sameOrigin.input)).toBe(true);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      sameOrigin.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toMatchObject({ assigned: true });

    const external = installRealm();
    const externalImage = new FakeInput('image', external.form);
    externalImage.attributes.set('form', 'login');
    externalImage.attributes.set('formaction', 'https://other.test/steal');
    Object.defineProperty(externalImage, 'form', { value: new FakeForm() });
    Object.defineProperty(external.document, 'querySelectorAll', { value: () => [] });
    external.document.imageButtons.push(externalImage);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      external.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'identity' });
    expect(external.input.assigned).toEqual([]);
  });

  it('refuses an image submit button inserted between verification and assignment', () => {
    const realm = installRealm();
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(true);
    const image = new FakeInput('image', realm.form);
    image.attributes.set('formaction', 'https://other.test/steal');
    realm.document.imageButtons.push(image);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      realm.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'identity' });
    expect(realm.input.assigned).toEqual([]);
  });

  it('reads document.baseURI natively and refuses every off-origin base before assignment', () => {
    const offOrigin = installRealm();
    offOrigin.document.baseURL = 'https://other.test/root/';
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(offOrigin.input)).toBe(false);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      offOrigin.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'identity' });
    expect(offOrigin.input.assigned).toEqual([]);

    const relativeAction = installRealm();
    relativeAction.document.baseURL = 'https://other.test/root/';
    relativeAction.form.attributes.set('action', 'login');
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(relativeAction.input)).toBe(false);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      relativeAction.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'identity' });
    expect(relativeAction.input.assigned).toEqual([]);

    const sameOrigin = installRealm();
    sameOrigin.document.baseURL = 'https://example.test/root/';
    sameOrigin.form.attributes.set('action', 'login');
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(sameOrigin.input)).toBe(true);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      sameOrigin.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({
      assigned: true,
      observedOrigin: 'https://example.test',
      controlToken: 'control-before',
      documentToken: 'document-before',
    });
    expect(sameOrigin.input.assigned).toEqual(['secret']);

    const absoluteAction = installRealm();
    absoluteAction.document.baseURL = 'https://example.test/root/';
    absoluteAction.form.attributes.set('action', 'https://other.test/login');
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(absoluteAction.input)).toBe(false);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      absoluteAction.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'identity' });
    expect(absoluteAction.input.assigned).toEqual([]);
  });

  it('ignores a lying own document.baseURI and uses the native Node getter', () => {
    const realm = installRealm();
    realm.document.baseURL = 'https://other.test/root/';
    Object.defineProperty(realm.document, 'baseURI', { value: 'https://example.test/' });
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(false);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      realm.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toEqual({ assigned: false, reason: 'identity' });
    expect(realm.input.assigned).toEqual([]);
    expect(DESTINATION_PREDICATES_SOURCE).not.toContain('document.baseURI');
  });

  it('resolves formaction against the native same-origin base URI', () => {
    const realm = installRealm();
    realm.document.baseURL = 'https://example.test/root/';
    realm.form.controls[0]!.attributes.set('formaction', 'submit');
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(true);
    realm.document.baseURL = 'https://other.test/root/';
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(false);
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

  it('kills length-bounded decoding by touching all 4096 transported code units before slicing', () => {
    for (const [value, lengthDigits] of [['x', '0001'], ['y'.repeat(4096), '4096']] as const) {
      const realm = installRealm();
      const parse = vi.spyOn(Number, 'parseInt');
      expect(sourceFunction(ASSIGN_SOURCE).call(
        realm.input, 'https://example.test', fixedHex(value), lengthDigits,
      )).toMatchObject({ assigned: true });
      expect(parse).toHaveBeenCalledTimes(4096);
      expect(realm.input.assigned).toEqual([value]);
      parse.mockRestore();
    }
  });

  it('kills page-owned getAttribute reads and retains native descriptor traffic', () => {
    const realm = installRealm();
    realm.input.getAttribute = () => 'text';
    realm.form.getAttribute = () => 'https://other.test/submit';
    realm.form.controls[0]!.getAttribute = () => 'https://other.test/submit';
    expect(sourceFunction(VERIFY_DESTINATION_SOURCE).call(realm.input)).toBe(true);
    expect(sourceFunction(ASSIGN_SOURCE).call(
      realm.input, 'https://example.test', fixedHex('secret'), '0006',
    )).toMatchObject({ assigned: true, controlToken: 'control-before', documentToken: 'document-before' });
  });

  it('kills selector-backed typing and page value setters by assigning the resolved node natively', () => {
    const realm = installRealm();
    let poisoned = false;
    Object.defineProperty(realm.input, 'value', { set: () => { poisoned = true; } });
    expect(sourceFunction(TYPE_SOURCE).call(realm.input, 'caller text')).toBe(true);
    expect(realm.input.assigned).toEqual(['caller text']);
    expect(realm.input.events).toEqual(['focus', 'input', 'change', 'blur']);
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
    for (const source of [
      DESTINATION_PREDICATES_SOURCE, VERIFY_DESTINATION_SOURCE, ASSIGN_SOURCE, SNAPSHOT_SOURCE, TYPE_SOURCE,
    ]) {
      expect(source.trimStart().startsWith('function')).toBe(true);
      expect(source).not.toMatch(/\b(?:async|await)\b|\.then\s*\(/u);
      expect(source).not.toMatch(/\.getAttribute\s*\(/u);
    }
    expect(VERIFY_DESTINATION_SOURCE).toContain(DESTINATION_PREDICATES_SOURCE);
    expect(ASSIGN_SOURCE).toContain(DESTINATION_PREDICATES_SOURCE);
    for (const helper of [
      'readNativeBaseOrigin', 'formActionStaysLocal',
      'imageButtonActionsStayLocal', 'submitButtonsStayLocal',
    ]) {
      expect(DESTINATION_PREDICATES_SOURCE).toContain(`function ${helper}(`);
    }
    expect(DESTINATION_PREDICATES_SOURCE.split('\n'))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/;[ \t]+(?!(?:\/\/|\/\*))\S/u)]));
  });

  it('derives the ASSIGN_SOURCE loop bound from MAX_SECRET_CODE_UNITS', async () => {
    const source = await readFile('src/browser/inRealm.ts', 'utf8');
    expect(source).toContain('index < ${MAX_SECRET_CODE_UNITS}; index += 1');
    expect(ASSIGN_SOURCE).toContain(`index < ${MAX_SECRET_CODE_UNITS}; index += 1`);
  });

  it('kills value-dependent masking by allowing .value only in the unmasked branch', () => {
    const accesses = [...SNAPSHOT_SOURCE.matchAll(/element\.value\b/gu)].map((match) => match.index);
    expect(accesses.length).toBeGreaterThan(0);
    expect(accesses.every((index) => index! > SNAPSHOT_SOURCE.indexOf('} else {'))).toBe(true);
    expect(SNAPSHOT_SOURCE.indexOf('var masked =')).toBeLessThan(SNAPSHOT_SOURCE.indexOf('if (masked)'));
  });

  it('pins value to controls and own text to name without duplicating it as value', () => {
    vi.stubGlobal('Node', { TEXT_NODE: 3 });
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('location', { origin: 'https://example.test', pathname: '/snapshot' });
    const textNode = { nodeType: 3, textContent: 'paragraph text', nextSibling: null };
    const input = {
      tagName: 'INPUT', type: 'text', value: 'field value', firstChild: null, labels: undefined,
      attributes: new Map([['aria-label', 'Echo']]),
    };
    const paragraph = {
      tagName: 'P', firstChild: textNode, labels: undefined, attributes: new Map(),
    };
    const password = {
      tagName: 'INPUT', type: 'password', value: 'must not escape', firstChild: null, labels: undefined,
      attributes: new Map([['role', 'textbox'], ['aria-label', 'Password']]),
    };
    const root = { querySelectorAll: () => [input, password, paragraph] };

    const snapshot = sourceFunction(SNAPSHOT_SOURCE).call(root);
    expect(snapshot).toEqual({
      url: 'https://example.test/snapshot',
      nodes: [
        { tag: 'input', masked: false, name: 'Echo', value: 'field value' },
        { tag: 'input', masked: true },
        { tag: 'p', masked: false, name: 'paragraph text' },
      ],
    });
    expect(Reflect.ownKeys(snapshot.nodes[1])).toEqual(['tag', 'masked']);
  });
});
