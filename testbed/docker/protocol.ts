// Closed wire vocabulary for trusted evaluation peers; this does not prove process identity or isolation.
export const BRIDGE_CODES = [
  'unsolicited', 'duplicate-id', 'id-mismatch', 'op-mismatch', 'bridge-timeout',
  'bridge-closed', 'protocol-order', 'unknown-op', 'pipelined', 'body-shape',
  'secret-shape', 'challenge-shape', 'mac-shape', 'mac-invalid', 'key-shape',
  'hello-mismatch', 'hostname-mismatch', 'frame-length', 'frame-utf8',
  'frame-canonical', 'frame-type', 'frame-kind', 'frame-partial',
  'capability-refused', 'run-state', 'control-limit', 'key-mismatch',
] as const;
export type BridgeCode = typeof BRIDGE_CODES[number];
export const CAPABILITY_OPS = ['receipt', 'capture', 'attest', 'key', 'finalize', 'ack'] as const;
export type CapabilityOp = typeof CAPABILITY_OPS[number];
export const OPS = ['bootstrap', 'hello', 'register', ...CAPABILITY_OPS] as const;
export type BridgeOp = typeof OPS[number];
export const PREFIX_BYTES = 4;
export const MAX_PAYLOAD_BYTES = 2097152;
export const HELLO_PREFIX = 'tinyvault/m5.2/bridge-hello/v1';
export const FRAME_KEYS = {
  req: ['v', 'kind', 'id', 'op', 'body'],
  success: ['v', 'kind', 'id', 'op', 'ok', 'body'],
  failure: ['v', 'kind', 'id', 'op', 'ok', 'code'],
} as const;
export const BODY_SCHEMAS = {
  bootstrap: { req: ['secret'], res: [] },
  hello: { req: ['challenge', 'epoch', 'fixtureId', 'containerId'], res: ['publicKey', 'mac'] },
  register: { req: ['epoch', 'fixtureId', 'scenarioId', 'runId', 'nonce', 'canaryId', 'canary'], res: CAPABILITY_OPS },
  receipt: { req: ['epoch', 'fixtureId', 'runId', 'capability'], res: ['receipt'] },
  capture: { req: ['epoch', 'fixtureId', 'runId', 'capability', 'kind', 'offset'], res: ['bytes', 'total', 'next'] },
  key: { req: ['epoch', 'fixtureId', 'runId', 'capability'], res: ['publicKey'] },
  finalize: { req: ['epoch', 'fixtureId', 'runId', 'capability'], res: [] },
  ack: { req: ['epoch', 'fixtureId', 'runId', 'capability'], res: [] },
  attest: { req: ['epoch', 'fixtureId', 'runId', 'capability', 'events'], res: ['attestation'] },
} as const;
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 65536;
export const MAX_EVENTS_BYTES = 1048576;
export const MAX_ARTIFACT_STRING_BYTES = 262144;
export const RUN_ID_PATTERN = /^[A-Za-z0-9-]{1,128}(?![\s\S])/;
export type CaptureKind = 'requests' | 'unauthorized';
export const FIXTURE_IDS = ['benign-login', 'lookalike-origin', 'dom-hidden-injection', 'secret-echo', 'fake-reauth'] as const;
export type FixtureId = typeof FIXTURE_IDS[number];
export const EPOCH_PATTERN = /^(0|[1-9][0-9]*)-[0-9a-f]{32}(?![\s\S])/;
export const CONTAINER_ID_PATTERN = /^[0-9a-f]{64}(?![\s\S])/;
export type Body = Record<string, unknown>;
export type RequestFrame = { v: 1; kind: 'req'; id: number; op: BridgeOp; body: Body };
export type ResponseFrame = { v: 1; kind: 'res'; id: number; op: BridgeOp } & (
  { ok: true; body: Body } | { ok: false; code: BridgeCode }
);
export type Frame = RequestFrame | ResponseFrame;

const errors = new WeakSet<object>();
export class BridgeError extends Error {
  readonly #code: BridgeCode;
  constructor(code: BridgeCode) {
    const safe = isBridgeCode(code) ? code : 'bridge-closed';
    super(safe);
    this.name = 'BridgeError';
    this.#code = safe;
    errors.add(this);
    Object.freeze(this);
  }
  get code(): BridgeCode { return this.#code; }
}
Object.freeze(BridgeError.prototype);

export function isBridgeCode(value: unknown): value is BridgeCode {
  return typeof value === 'string' && (BRIDGE_CODES as readonly string[]).includes(value);
}
export function errorCode(error: unknown): BridgeCode {
  return typeof error === 'object' && error !== null && errors.has(error)
    ? (error as BridgeError).code : 'bridge-closed';
}
export function isBody(value: unknown): value is Body {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export function exactKeys(value: Body, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
