export const BODY_UNAVAILABLE_TARGET_DETACHED = 'x-tinyvault-body-unavailable: target-detached';
export const BODY_UNAVAILABLE_NOT_ATTACHED = 'x-tinyvault-body-unavailable: not-attached';

export type RequestWillBeSentLike = Readonly<{
  requestId: string;
  request: Readonly<{ url: string; method: string; hasPostData?: boolean; postData?: string }>;
}>;

type Candidate = {
  readonly request: object;
  readonly rawUrl: string;
  readonly method: string;
  readonly cdpIdentities: Set<string>;
  hasPostData?: boolean;
  bodyObserved: boolean;
  unavailableReason?: typeof BODY_UNAVAILABLE_TARGET_DETACHED;
  finalized?: 'body' | 'marker';
};

type CdpRequest = {
  readonly identity: string;
  readonly rawUrl: string;
  readonly method: string;
  readonly hasPostData: boolean;
  bodyObserved: boolean;
  unavailableReason?: typeof BODY_UNAVAILABLE_TARGET_DETACHED;
  candidate?: Candidate;
};

type Marker = Readonly<{ rawUrl: string; method: string; reason: string }>;

/** Correlates Playwright request objects to CDP request ids. URL/method are used only to bind the two APIs in
 * arrival order; once bound, body and marker outcomes are keyed by request identity and reconciled at settle. */
export class BodyCorrelation {
  readonly #candidates = new Map<object, Candidate>();
  readonly #cdpRequests = new Map<string, CdpRequest>();

  observePlaywrightRequest(
    request: object,
    rawUrl: string,
    method: string,
    headers: Record<string, string>,
  ): void {
    if (!mayCarryBody(method)) return;
    const contentLength = parsedContentLength(headers);
    if (contentLength === 0) return;
    const candidate: Candidate = {
      request, rawUrl, method, cdpIdentities: new Set(),
      ...(contentLength === undefined ? {} : { hasPostData: contentLength > 0 }),
      bodyObserved: false,
    };
    this.#candidates.set(request, candidate);
    const unmatched = [...this.#cdpRequests.values()].find((item) =>
      item.candidate === undefined && sameShape(item, candidate));
    if (unmatched !== undefined) this.#bind(candidate, unmatched);
  }

  /** The resolved (extra-info) headers arrive after the request event; a Blob body's `content-length` is the body
   *  evidence for a request no child session saw (integrator, round 3 of commit 2: without it the `not-attached`
   *  marker was never minted and 200 immediate worker POSTs counted 77–116). */
  observeHeaders(request: object, headers: Record<string, string>): void {
    const candidate = this.#candidates.get(request);
    if (candidate === undefined || candidate.finalized !== undefined) return;
    const contentLength = parsedContentLength(headers);
    if (contentLength === undefined) {
      // Resolved headers never arrived (the target was gone before requestWillBeSentExtraInfo — a self-closing
      // popup's keepalive POST): whether the request carried a body is unknown, so it is counted as unobserved
      // rather than passed over. A resolved set with no content-length is a chunked body (declared, no marker).
      if (isProvisional(headers) && candidate.hasPostData === undefined) candidate.hasPostData = true;
      return;
    }
    if (contentLength === 0) {
      candidate.hasPostData = false;
      return;
    }
    candidate.hasPostData = true;
  }

  observeCdpRequest(identity: string, event: RequestWillBeSentLike): void {
    if (!mayCarryBody(event.request.method)) return;
    const observed: CdpRequest = {
      identity, rawUrl: event.request.url, method: event.request.method,
      hasPostData: event.request.hasPostData === true, bodyObserved: false,
    };
    this.#cdpRequests.set(identity, observed);
    const candidate = [...this.#candidates.values()]
      .filter((item) => item.finalized === undefined && sameShape(observed, item))
      .sort((left, right) => left.cdpIdentities.size - right.cdpIdentities.size)[0];
    if (candidate !== undefined) this.#bind(candidate, observed);
  }

  recordBody(identity?: string): boolean {
    const observed = identity === undefined ? undefined : this.#cdpRequests.get(identity);
    if (observed !== undefined) {
      observed.bodyObserved = true;
      observed.unavailableReason = undefined;
    }
    const candidate = observed?.candidate;
    if (candidate?.finalized === 'marker') return false;
    if (candidate !== undefined) {
      candidate.bodyObserved = true;
      candidate.unavailableReason = undefined;
      candidate.finalized = 'body';
    }
    return true;
  }

  recordUnavailable(identity: string): void {
    const observed = this.#cdpRequests.get(identity);
    if (observed !== undefined && !observed.bodyObserved) {
      observed.unavailableReason = BODY_UNAVAILABLE_TARGET_DETACHED;
    }
    const candidate = observed?.candidate;
    if (candidate !== undefined && !candidate.bodyObserved) {
      candidate.unavailableReason = BODY_UNAVAILABLE_TARGET_DETACHED;
    }
  }

  finalize(): Marker[] {
    const markers: Marker[] = [];
    for (const candidate of this.#candidates.values()) {
      if (candidate.finalized !== undefined || candidate.bodyObserved || candidate.hasPostData !== true) continue;
      const reason = candidate.unavailableReason ?? BODY_UNAVAILABLE_NOT_ATTACHED;
      markers.push({ rawUrl: candidate.rawUrl, method: candidate.method, reason });
      candidate.finalized = 'marker';
    }
    return markers;
  }

  clear(): void {
    this.#candidates.clear();
    this.#cdpRequests.clear();
  }

  #bind(candidate: Candidate, observed: CdpRequest): void {
    candidate.cdpIdentities.add(observed.identity);
    candidate.hasPostData = candidate.hasPostData === true || observed.hasPostData;
    candidate.bodyObserved ||= observed.bodyObserved;
    candidate.unavailableReason ??= observed.unavailableReason;
    observed.candidate = candidate;
  }
}

function parsedContentLength(headers: Record<string, string>): number | undefined {
  const raw = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-length')?.[1];
  if (raw === undefined) return undefined;
  const length = Number.parseInt(raw, 10);
  return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

export const PROVISIONAL_HEADERS_MARKER = 'x-tinyvault-provisional-headers';

function isProvisional(headers: Record<string, string>): boolean {
  return headers[PROVISIONAL_HEADERS_MARKER] === 'true';
}

export function mayCarryBody(method: string): boolean {
  return !/^(?:GET|HEAD)$/u.test(method.toUpperCase());
}

function sameShape(
  left: Pick<CdpRequest, 'rawUrl' | 'method'>,
  right: Pick<Candidate, 'rawUrl' | 'method'>,
): boolean {
  return left.rawUrl === right.rawUrl && left.method.toUpperCase() === right.method.toUpperCase();
}
