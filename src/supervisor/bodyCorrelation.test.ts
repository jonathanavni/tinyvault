import { describe, expect, it } from 'vitest';
import {
  BodyCorrelation,
  BODY_UNAVAILABLE_NOT_ATTACHED,
  BODY_UNAVAILABLE_TARGET_DETACHED,
  PROVISIONAL_HEADERS_MARKER,
} from './bodyCorrelation';

const URL_ = 'http://secondary.test/receive';

describe('BodyCorrelation header evidence', () => {
  it('mints a not-attached marker when only provisional headers arrive and no child session saw the request', () => {
    const correlation = new BodyCorrelation();
    const request = {};
    correlation.observePlaywrightRequest(request, URL_, 'POST', {});
    correlation.observeHeaders(request, { 'user-agent': 'x', [PROVISIONAL_HEADERS_MARKER]: 'true' });
    expect(correlation.finalize()).toEqual([{ rawUrl: URL_, method: 'POST', reason: BODY_UNAVAILABLE_NOT_ATTACHED }]);
  });

  it('mints nothing for resolved headers without a content-length (chunked bodies are declared)', () => {
    const correlation = new BodyCorrelation();
    const request = {};
    correlation.observePlaywrightRequest(request, URL_, 'POST', {});
    correlation.observeHeaders(request, { 'user-agent': 'x' });
    expect(correlation.finalize()).toEqual([]);
  });

  it('keeps a content-length of zero authoritative over the provisional fallback', () => {
    const correlation = new BodyCorrelation();
    const request = {};
    correlation.observePlaywrightRequest(request, URL_, 'POST', { 'content-length': '0' });
    correlation.observeHeaders(request, { [PROVISIONAL_HEADERS_MARKER]: 'true' });
    expect(correlation.finalize()).toEqual([]);
  });

  it('turns a failed page-session body fetch into a target-detached marker', () => {
    const correlation = new BodyCorrelation();
    const request = {};
    correlation.observePlaywrightRequest(request, URL_, 'POST', {});
    correlation.observeCdpRequest('page:1', { requestId: '1', request: { url: URL_, method: 'POST', hasPostData: true } });
    correlation.recordUnavailable('page:1');
    expect(correlation.finalize()).toEqual([{ rawUrl: URL_, method: 'POST', reason: BODY_UNAVAILABLE_TARGET_DETACHED }]);
  });
});
