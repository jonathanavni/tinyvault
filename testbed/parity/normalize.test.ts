import { describe, expect, it } from 'vitest';
import { ValueRegistry, firstDifference, normalizeJsonBytes } from './normalize';

function normalized(value: unknown, anchors: [string, string][]) {
  const registry = new ValueRegistry();
  try { for (const [role, raw] of anchors) registry.anchor(role, raw, { origin: role.includes('origin') });
    return { value: registry.value(value), graph: registry.graph() }; }
  finally { registry.destroy(); }
}
function same(left: unknown, right: unknown, a: [string, string][] = [], b = a) {
  return firstDifference(normalized(left, a), normalized(right, b)) === undefined;
}

describe('canonical parity independent vectors', () => {
  it('K-canary retains the BOM in raw and escaped anchor spellings', () => {
    const anchor = '\uFEFFanchor-value';
    const registry = new ValueRegistry();
    try {
      registry.anchor('canary', Buffer.from(anchor));
      expect(registry.text('anchor-value')).toEqual([{ literal: 'anchor-value' }]);
      for (const spelling of [anchor, encodeURIComponent(anchor), new URLSearchParams({ v: anchor }).toString().slice(2)]) {
        expect(registry.text(spelling)).toEqual([{ symbol: 0, codec: expect.any(Array) }]);
      }
      expect(registry.graph()).toEqual([{ symbol: 0, roles: ['canary'], length: Buffer.byteLength(anchor) }]);
    } finally { registry.destroy(); }
  });
  it.each([
    ['equal raw physical values', 'red-secret', 'red-secret', 'red-secret', 'red-secret', true],
    ['equal base64 distinct values', 'cmVkLXNlY3JldA==', 'Ymx1LXNlY3JldA==', 'red-secret', 'blu-secret', true],
    ['raw versus base64', 'red-secret', 'Ymx1LXNlY3JldA==', 'red-secret', 'blu-secret', false],
    ['percent upper versus lower', 'red%2Fsecret', 'blu%2fsecret', 'red/secret', 'blu/secret', false],
    ['nested JSON depth', 'red\\"secret', 'blu\\\\\\"secret', 'red"secret', 'blu"secret', false],
  ] as const)('K-canary %s', (_name, left, right, a, b, equal) => {
    expect(same(left, right, [['canary', a]], [['canary', b]])).toBe(equal);
  });
  it('K-canary preserves substring location and literal placeholder text', () => {
    expect(same('a red-secret z', 'a blu-secret z', [['canary', 'red-secret']], [['canary', 'blu-secret']])).toBe(true);
    expect(same('{symbol:0}', 'red-secret', [['canary', 'red-secret']])).toBe(false);
  });
  it('K-canary rejects overlapping referents', () => {
    expect(() => normalized('abcdefgh', [['a', 'abcdefgh'], ['b', 'cdef']])).toThrow('Parity anchor-overlap');
  });
  for (const role of ['canary', 'nonce', 'handle', 'session', 'key']) {
    it(`K-${role === 'session' ? 'handle' : role} rejects cross-run ${role} reuse`, () => {
      expect(same(['first-value', 'other-value'], ['third-value', 'third-value'],
        [[`0:${role}`, 'first-value'], [`1:${role}`, 'other-value']], [[`0:${role}`, 'third-value'], [`1:${role}`, 'third-value']])).toBe(false);
    });
  }
  it('K-nonce retains cross-kind equality collision', () => {
    expect(same([], [], [['canary', 'first-value'], ['nonce', 'other-value']], [['canary', 'third-value'], ['nonce', 'third-value']])).toBe(false);
  });
  it.each([
    ['second value deleted', [{ name: 'x', value: 'plain' }]],
    ['same-name values reversed', [{ name: 'x', value: 'secret' }, { name: 'x', value: 'plain' }]],
    ['case changed', [{ name: 'X', value: 'plain' }, { name: 'x', value: 'secret' }]],
    ['different-name order changed', [{ name: 'y', value: 'secret' }, { name: 'x', value: 'plain' }]],
  ])('K-header %s', (_name, right) => {
    expect(same([{ name: 'x', value: 'plain' }, { name: 'x', value: 'secret' }], right)).toBe(false);
  });
  it.each(['events', 'witness callbacks', 'captures', 'worker body marker', 'producer count'])('K-order preserves %s', (kind) => {
    expect(same({ kind, data: ['first', 'second'] }, { kind, data: ['second', 'first'] })).toBe(false);
  });
  it.each([
    ['C versus L alias', ['http://left.invalid', 'http://other.invalid'], ['http://right.invalid', 'http://right.invalid']],
    ['HTTP versus HTTPS', ['http://left.invalid'], ['https://right.invalid']],
  ])('K-route %s', (_name, left, right) => {
    expect(same(left, right, left.map((origin, i) => [`origin:${i}`, origin]), right.map((origin, i) => [`origin:${i}`, origin]))).toBe(false);
  });
  it('K-route renames trusted origins of different textual lengths', () => {
    expect(same('http://left.invalid/path', 'http://longer-right.invalid/path', [['origin:C', 'http://left.invalid']], [['origin:C', 'http://longer-right.invalid']])).toBe(true);
  });
  it.each([
    ['unknown hostname prefix', 'http://left.invalid.evil/path', 'http://right.invalid.evil/path'],
    ['Referer path', 'http://left.invalid/path?q=1', 'http://right.invalid/other?q=1'],
    ['Referer query', 'http://left.invalid/path?q=1', 'http://right.invalid/path?q=2'],
    ['Location fragment', 'http://left.invalid/path#one', 'http://right.invalid/path#two'],
    ['unknown longer port', 'http://left.invalid:9999', 'http://right.invalid:9999'],
  ])('K-route %s', (_name, left, right) => {
    expect(same(left, right, [['origin:C', 'http://left.invalid']], [['origin:C', 'http://right.invalid']])).toBe(false);
  });
  it.each([undefined, null, '', [], {}])('K-absence distinguishes missing from %j', (value) => {
    expect(same({}, { optional: value })).toBe(false);
  });
  it.each(['run', 'cell', 'body', 'marker'])('K-absence retains %s inventory', (kind) => {
    expect(same({ [kind]: ['item'] }, { [kind]: [] })).toBe(false);
  });
  it.each(['bad-signature', 'replayed', 'stale', 'binding-mismatch'])('K-crypto retains %s result', (reason) => {
    expect(same({ taskCompleted: true }, { taskCompleted: false, reason })).toBe(false);
  });
  it('K-evidence preserves raw JSON whitespace and escape spelling', () => {
    const registry = new ValueRegistry();
    try {
      expect(firstDifference(normalizeJsonBytes('{"x":"a"}', registry), normalizeJsonBytes('{ "x":"a"}', registry))).toBeDefined();
      expect(firstDifference(normalizeJsonBytes('{"x":"a"}', registry), normalizeJsonBytes('{"x":"\\u0061"}', registry))).toBeDefined();
      expect(() => normalizeJsonBytes('{', registry)).toThrow('Parity json-input');
    } finally { registry.destroy(); }
  });
  it('K-evidence rejects a deleted event with coherently restated outcomes', () => {
    expect(same({ events: ['body', 'marker'], outcome: false }, { events: ['marker'], outcome: false })).toBe(false);
  });
});

describe('codec observational equivalence', () => {
  function encoded(bytes: number[], spelling: string) {
    const registry = new ValueRegistry();
    try { registry.anchor('nonce', new Uint8Array(bytes)); return registry.text(spelling); }
    finally { registry.destroy(); }
  }
  it('K-nonce permits ambiguous and disambiguated canonical base64', () => {
    expect(firstDifference(encoded([97, 98, 99], 'YWJj'), encoded([251, 255, 255], '+///'))).toBeUndefined();
  });
  it('K-nonce rejects unambiguous base64 versus base64url', () => {
    expect(firstDifference(encoded([251, 255, 255], '+///'), encoded([251, 255, 255], '-___'))).toBeDefined();
  });
  it('K-crypto retains one jointly satisfiable three-leg codec domain', () => {
    const a = encoded([97, 98, 99], 'YWJj'); const b = encoded([251, 255, 255], '+///'); const c = encoded([251, 255, 255], '-___');
    expect(firstDifference(a, b)).toBeUndefined(); expect(firstDifference(a, c)).toBeUndefined();
    const domains = new Map<string, readonly string[]>();
    expect(firstDifference(a, b, '$', domains)).toBeUndefined();
    expect(firstDifference(a, c, '$', domains)).toBeDefined();
    expect([...domains.values()]).toEqual([['base64']]);
  });
  it('K-absence undefined remains distinct from null', () => {
    expect(same({ optional: undefined }, { optional: null })).toBe(false);
  });
});
