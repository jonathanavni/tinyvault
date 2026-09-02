import type { BrowserOpResult, MaskedSnapshot } from '../core/types';

export type BrowserFailureReason = Extract<BrowserOpResult, { ok: false }>['reason'];
export type SnapshotResult =
  | Readonly<{ ok: true; snapshot: MaskedSnapshot }>
  | Readonly<{ ok: false; reason: 'session-unknown' }>;

const FAILURE_REASONS: ReadonlySet<string> = Object.freeze(new Set<BrowserFailureReason>([
  'session-unknown',
  'invalid-url',
  'navigation-failed',
  'no-such-element',
  'locked-field',
]));

export function createBrowserOk(): Extract<BrowserOpResult, { ok: true }> {
  return Object.freeze({ ok: true });
}

export function createBrowserFailure(reason: BrowserFailureReason): Extract<BrowserOpResult, { ok: false }> {
  if (!FAILURE_REASONS.has(reason)) throw new Error('Invalid browser result provenance');
  return Object.freeze({ ok: false, reason });
}

export function createSnapshotResult(snapshot?: MaskedSnapshot): SnapshotResult {
  if (snapshot === undefined) return Object.freeze({ ok: false, reason: 'session-unknown' });
  const nodes = snapshot.nodes.map((node) => {
    if (node.masked) return Object.freeze({ tag: node.tag, masked: true as const });
    return Object.freeze({
      tag: node.tag,
      masked: false as const,
      ...(node.role === undefined ? {} : { role: node.role }),
      ...(node.name === undefined ? {} : { name: node.name }),
      ...(node.value === undefined ? {} : { value: node.value }),
    });
  });
  const frozen = Object.freeze({ url: snapshot.url, nodes: Object.freeze(nodes) }) as unknown as MaskedSnapshot;
  return Object.freeze({ ok: true, snapshot: frozen });
}
