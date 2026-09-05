// Docker-free proof of the probe classification the C matrix relies on: a target is covered only by an
// observed verdict (a status, an open socket, a numeric outcome, or a connection-level failure), never by an
// evidence-free error; hidden (CORS/ORB) answers are 'unobserved', and the coverage check fires when a target
// has no observed verdict at all.
import { describe, expect, it } from 'vitest';
import { classifyProbe, coverageGaps, detectedRoute, reachedServer, type Probe } from './integrationProbes';

const probe = (over: Partial<Probe>): Probe => ({ method: 'fetch', target: 't', url: 'http://127.0.0.1:1/control', statuses: [], outcome: 'error', ...over });

describe('probe classification', () => {
  it('observed statuses decide: 404 is no-route, anything else is a route', () => {
    expect(classifyProbe(probe({ method: 'form', statuses: [404] }))).toBe('no-route');
    expect(classifyProbe(probe({ method: 'form', statuses: [200], outcome: 'loaded' }))).toBe('route');
    expect(classifyProbe(probe({ method: 'form', statuses: [400] }))).toBe('route');
    expect(detectedRoute(probe({ method: 'img', statuses: [200] }))).toBe(true);
  });
  it('an open WebSocket or a numeric non-404 outcome is a route; a numeric 404 outcome is observed no-route', () => {
    expect(classifyProbe(probe({ method: 'websocket', outcome: 'open' }))).toBe('route');
    expect(classifyProbe(probe({ method: 'worker', outcome: '200' }))).toBe('route');
    expect(classifyProbe(probe({ method: 'worker', outcome: '404' }))).toBe('no-route');
  });
  it('connection-level and scheme-level failures are observed no-route; hidden answers are unobserved', () => {
    for (const text of ['net::ERR_CONNECTION_REFUSED', 'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_ADDRESS_UNREACHABLE',
      'net::ERR_CONNECTION_TIMED_OUT', 'net::ERR_UNKNOWN_URL_SCHEME', 'net::ERR_UNSAFE_PORT']) {
      expect(classifyProbe(probe({ failure: text }))).toBe('no-route');
      expect(reachedServer(probe({ failure: text }))).toBe(false);
    }
    for (const text of ['net::ERR_FAILED', 'net::ERR_BLOCKED_BY_ORB', 'net::ERR_HTTP_RESPONSE_CODE_FAILURE']) {
      expect(classifyProbe(probe({ failure: text }))).toBe('unobserved');
      expect(reachedServer(probe({ failure: text }))).toBe(true);
      expect(detectedRoute(probe({ failure: text }))).toBe(false);
    }
  });
  it('an evidence-free error is unobserved for every method, WebSocket included', () => {
    for (const method of ['fetch', 'form', 'img', 'websocket', 'worker']) {
      expect(classifyProbe(probe({ method }))).toBe('unobserved');
    }
  });
  it('coverage: a target with no observed verdict is a gap; one observed verdict clears it', () => {
    const hidden = ['fetch', 'img', 'worker'].map((method) => probe({ method, target: 'a', failure: 'net::ERR_FAILED' }));
    const blind = [...hidden, probe({ method: 'websocket', target: 'a' }), probe({ method: 'form', target: 'a' })];
    expect(coverageGaps(blind)).toEqual(['a']);
    const formObserved = [...hidden, probe({ method: 'websocket', target: 'a' }), probe({ method: 'form', target: 'a', statuses: [404] })];
    expect(coverageGaps(formObserved)).toEqual([]);
    expect(formObserved.filter(detectedRoute)).toEqual([]);
    const refused = ['fetch', 'form', 'img', 'websocket', 'worker'].map((method) => probe({ method, target: 'b', failure: 'net::ERR_CONNECTION_REFUSED' }));
    expect(coverageGaps(refused)).toEqual([]);
  });
  it('a hidden answer beside a route on the same target still reports the route', () => {
    const probes = [probe({ method: 'fetch', target: 'c', failure: 'net::ERR_FAILED' }), probe({ method: 'form', target: 'c', statuses: [200], outcome: 'loaded' })];
    expect(probes.filter(detectedRoute).map((p) => p.method)).toEqual(['form']);
    expect(coverageGaps(probes)).toEqual([]);
  });
  it('a non-network (file:) target is excluded from network coverage but must still show no route', () => {
    const fileProbes = ['fetch', 'form', 'img', 'websocket', 'worker'].map((method) =>
      probe({ method, target: 'internal-socket-file-url', url: 'file:///tmp/tinyvault/control.sock' }));
    expect(coverageGaps(fileProbes)).toEqual([]);
    expect(fileProbes.filter(detectedRoute)).toEqual([]);
    expect(coverageGaps([probe({ target: 'net', url: 'http://127.0.0.1:1/control' })])).toEqual(['net']);
  });
});
