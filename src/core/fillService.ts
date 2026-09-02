import type {
  BackendStatus,
  CredentialBackend,
} from '../backends/backend';
import { BackendError } from '../backends/backend';
import {
  SessionHostError,
  type FillDestinationPort,
  type PinnedDestination,
  type SessionHost,
} from './browserPort';
import {
  InvalidControlIdentityError,
  type LockdownRegistry,
} from './lockdown';
import { validateBareOrigin } from './originGuard';
import type { Secret } from './redaction';
import {
  createFailedResult,
  createFilledResult,
  createSetupResult,
  type FillFailureReason,
} from './results';
import type {
  CredentialPolicy,
  FillRequest,
  FillResult,
  ItemMeta,
  Origin,
  SetupReason,
} from './types';

export type FillObservation = Readonly<{
  topOrigin: Origin | null;
  topPath: string | null;
  unobserved: boolean;
  reobservedOrigin: Origin | null;
  assertedMismatch: Origin | null;
  assigned: Readonly<{
    observedOrigin: Origin;
    controlToken: string | null;
    documentToken: string | null;
  }> | null;
}>;

export type FillOutcome = Readonly<{
  result: FillResult;
  observation: FillObservation;
}>;

export type FillService = Readonly<{
  fill(req: FillRequest): Promise<FillOutcome>;
  listVault(): Promise<{ items: ItemMeta[] }>;
  requestSetup(args: Readonly<{ reason: SetupReason }>): Promise<Readonly<{ instruction: string }>>;
  setupReasonFor(result: FillResult): Promise<SetupReason | null>;
  disposeBackend(): Promise<void>;
}>;

export type FillServiceOptions = Readonly<{
  backend: CredentialBackend;
  sessions: SessionHost;
  registry: LockdownRegistry;
}>;

type MutableObservation = {
  topOrigin: Origin | null;
  topPath: string | null;
  unobserved: boolean;
  reobservedOrigin: Origin | null;
  assertedMismatch: Origin | null;
  assigned: FillObservation['assigned'];
};

type ValidRequest = Readonly<{
  handle: string;
  selector: string;
  assertedOrigin?: Origin;
}>;

type PolicyResolution =
  | Readonly<{ ok: true; policy: CredentialPolicy }>
  | Readonly<{ ok: false; reason: FillFailureReason }>;

export function createFillService(options: FillServiceOptions): FillService {
  const service: FillService = {
    fill: (req) => fill(options, req),
    listVault: async () => {
      const items = Object.freeze([...(await options.backend.listItems())]) as unknown as ItemMeta[];
      return Object.freeze({ items });
    },
    requestSetup: async ({ reason }) => createSetupResult({ reason }),
    setupReasonFor: (result) => setupReasonFor(options.backend, result),
    disposeBackend: () => options.backend.dispose(),
  };
  return Object.freeze(service);
}

async function fill(options: FillServiceOptions, req: FillRequest): Promise<FillOutcome> {
  try {
    const sessionId = readSessionId(req);
    return await options.sessions.runExclusive(sessionId, (port) => fillExclusive(options, req, port));
  } catch (error) {
    return failedOutcome(mapOuterFailure(error));
  }
}

async function fillExclusive(
  options: FillServiceOptions,
  req: FillRequest,
  port: FillDestinationPort,
): Promise<FillOutcome> {
  const request = validateRequest(req);
  if (request === undefined) return failedOutcome(boundaryFailure(req));
  const observation = emptyObservation();
  let epoch0: number;
  try {
    epoch0 = port.documentEpoch();
  } catch {
    return finish('no-password-control', observation);
  }
  try {
    const top = await port.observeTop();
    observation.topOrigin = top.origin;
    observation.topPath = top.path;
    observation.unobserved = top.origin === null;
  } catch {
    observation.unobserved = true;
    return finish('no-password-control', observation);
  }
  const resolved = await resolvePolicy(options.backend, request.handle);
  if (!resolved.ok) return finish(resolved.reason, observation);
  return continueWithPolicy(options, request, resolved.policy, port, epoch0, observation);
}

async function continueWithPolicy(
  options: FillServiceOptions,
  request: ValidRequest,
  policy: CredentialPolicy,
  port: FillDestinationPort,
  epoch0: number,
  observation: MutableObservation,
): Promise<FillOutcome> {
  const canonicalOrigin = policy.canonicalOrigin;
  if (!policy.fieldRecipe.includes('password')) return finish('handle-unavailable', observation);
  if (request.assertedOrigin !== undefined && request.assertedOrigin !== canonicalOrigin) {
    observation.assertedMismatch = request.assertedOrigin;
    return finish('origin-not-authorized', observation);
  }
  if (observation.topOrigin !== canonicalOrigin) return finish('origin-not-authorized', observation);
  let pinned;
  try {
    pinned = await port.pinPasswordDestination(request.selector);
  } catch {
    return finish('no-password-control', observation);
  }
  if (pinned.kind !== 'pinned') return finish(pinned.kind, observation);
  return continueWithDestination(
    options, request, policy, canonicalOrigin, port, epoch0, observation, pinned.destination,
  );
}

async function continueWithDestination(
  options: FillServiceOptions,
  request: ValidRequest,
  policy: CredentialPolicy,
  canonicalOrigin: Origin,
  port: FillDestinationPort,
  epoch0: number,
  observation: MutableObservation,
  destination: PinnedDestination,
): Promise<FillOutcome> {
  if (safeEpoch(port) !== epoch0) return staleOutcome(port, canonicalOrigin, observation);
  try {
    if (options.registry.isLocked(destination.identity)) return finish('locked-field', observation);
    options.registry.lock(destination.identity);
  } catch (error) {
    return error instanceof InvalidControlIdentityError
      ? staleOutcome(port, canonicalOrigin, observation)
      : finish('no-password-control', observation);
  }
  let secret: Secret;
  try {
    secret = await options.backend.resolveSecret(request.handle, policy);
  } catch (error) {
    return finish(mapBackendFailure(error), observation);
  }
  try {
    try {
      if (!options.registry.isLocked(destination.identity)) return finish('no-password-control', observation);
    } catch (error) {
      return error instanceof InvalidControlIdentityError
        ? staleOutcome(port, canonicalOrigin, observation)
        : finish('no-password-control', observation);
    }
    try {
      const injected = await destination.inject(secret, canonicalOrigin);
      return completeInjection(injected, observation);
    } catch {
      return finish('no-password-control', observation);
    }
  } finally {
    secret.clear();
  }
}

function completeInjection(
  injected: Awaited<ReturnType<PinnedDestination['inject']>>,
  observation: MutableObservation,
): FillOutcome {
  if (!injected.assigned) return refusedInjection(injected, observation);
  observation.assigned = Object.freeze({
    observedOrigin: injected.observedOrigin,
    controlToken: injected.controlToken,
    documentToken: injected.documentToken,
  });
  return successfulOutcome(observation);
}

async function staleOutcome(
  port: FillDestinationPort,
  canonicalOrigin: Origin,
  observation: MutableObservation,
): Promise<FillOutcome> {
  try {
    const current = await port.observeTop();
    if (current.origin === null) return finish('no-password-control', observation);
    if (current.origin !== canonicalOrigin) {
      observation.reobservedOrigin = current.origin;
      return finish('origin-not-authorized', observation);
    }
    return finish('no-password-control', observation);
  } catch (error) {
    if (error instanceof SessionHostError
      && (error.kind === 'unknown-session' || error.kind === 'closing')) {
      return finish('session-unknown', observation);
    }
    return finish('no-password-control', observation);
  }
}

function refusedInjection(
  injected: Exclude<Awaited<ReturnType<PinnedDestination['inject']>>, { assigned: true }>,
  observation: MutableObservation,
): FillOutcome {
  if (injected.reason === 'origin') {
    observation.reobservedOrigin = injected.observedOrigin;
    return finish('origin-not-authorized', observation);
  }
  if (injected.reason === 'too-long' || injected.reason === 'unplaceable') {
    return finish('backend-error', observation);
  }
  return finish('no-password-control', observation);
}

async function resolvePolicy(backend: CredentialBackend, handle: string): Promise<PolicyResolution> {
  try {
    return Object.freeze({ ok: true, policy: await backend.resolvePolicy(handle) });
  } catch (error) {
    return Object.freeze({ ok: false, reason: mapBackendFailure(error) });
  }
}

async function setupReasonFor(backend: CredentialBackend, result: FillResult): Promise<SetupReason | null> {
  if (!result.ok && result.reason === 'handle-unavailable') return 'missing_item';
  if (result.ok || result.reason !== 'backend-error') return null;
  let status: BackendStatus;
  try {
    status = await backend.probeAvailability();
  } catch {
    return 'backend_unavailable';
  }
  if (status.available) return 'backend_unavailable';
  return status.reason === 'locked' || status.reason === 'not_authenticated'
    ? 'backend_locked'
    : 'backend_unavailable';
}

function validateRequest(req: FillRequest): ValidRequest | undefined {
  if (!isRecord(req) || typeof req.handle !== 'string' || !Array.isArray(req.fields)
    || req.fields.length !== 1 || !isRecord(req.fields[0])) return undefined;
  const field = req.fields[0];
  if (Reflect.ownKeys(field).length !== 2 || field.role !== 'password'
    || typeof field.selector !== 'string') return undefined;
  if (req.assertedOrigin === undefined) return Object.freeze({ handle: req.handle, selector: field.selector });
  try {
    return Object.freeze({
      handle: req.handle,
      selector: field.selector,
      assertedOrigin: validateBareOrigin(req.assertedOrigin),
    });
  } catch {
    return undefined;
  }
}

function boundaryFailure(req: FillRequest): FillFailureReason {
  if (isRecord(req) && req.assertedOrigin !== undefined) {
    try {
      validateBareOrigin(req.assertedOrigin);
    } catch {
      return 'origin-not-authorized';
    }
  }
  return 'no-password-control';
}

function readSessionId(req: FillRequest): string {
  return isRecord(req) && typeof req.sessionId === 'string' ? req.sessionId : '';
}

function safeEpoch(port: FillDestinationPort): number | undefined {
  try {
    return port.documentEpoch();
  } catch {
    return undefined;
  }
}

function mapBackendFailure(error: unknown): FillFailureReason {
  return error instanceof BackendError && error.kind === 'not-found'
    ? 'handle-unavailable'
    : 'backend-error';
}

function mapOuterFailure(error: unknown): FillFailureReason {
  if (!(error instanceof SessionHostError)) return 'no-password-control';
  return error.kind === 'unknown-session' || error.kind === 'closing'
    ? 'session-unknown'
    : 'no-password-control';
}

function emptyObservation(): MutableObservation {
  return {
    topOrigin: null,
    topPath: null,
    unobserved: false,
    reobservedOrigin: null,
    assertedMismatch: null,
    assigned: null,
  };
}

function failedOutcome(reason: FillFailureReason): FillOutcome {
  return finish(reason, emptyObservation());
}

function successfulOutcome(observation: MutableObservation): FillOutcome {
  return Object.freeze({
    result: createFilledResult({ requestedRoles: ['password'] }),
    observation: freezeObservation(observation),
  });
}

function finish(reason: FillFailureReason, observation: MutableObservation): FillOutcome {
  return Object.freeze({
    result: createFailedResult({ reason }),
    observation: freezeObservation(observation),
  });
}

function freezeObservation(observation: MutableObservation): FillObservation {
  return Object.freeze({ ...observation });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
