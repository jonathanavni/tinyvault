export type EndpointRejectionReason =
  | 'scheme' | 'authority' | 'query-or-fragment' | 'percent-escape'
  | 'redundant-slash' | 'dot-segment' | 'trailing-slash' | 'empty-path' | 'control-character'
  | 'edge-whitespace';
export type EndpointParse =
  | { readonly ok: true; readonly socketPath: string }
  | { readonly ok: false; readonly reason: EndpointRejectionReason; readonly detail: string };

function reject(reason: EndpointRejectionReason, detail: string): EndpointParse {
  return { ok: false, reason, detail };
}

export function hasEdgeWhitespace(value: string): boolean {
  return /^[\s\p{White_Space}]|[\s\p{White_Space}]$/u.test(value);
}

export function parseUnixEndpoint(raw: string): EndpointParse {
  if (hasEdgeWhitespace(raw)) {
    return reject('edge-whitespace', 'Leading and trailing whitespace are forbidden.');
  }
  if (!raw.startsWith('unix://')) {
    return reject('scheme', 'Expected the unix:// scheme, including both slashes.');
  }
  // Restrict authority recognition to Unix endpoints so it cannot mask the scheme guard.
  if (/^unix:\/\/[^/]/.test(raw)) {
    return reject('authority', 'The Unix endpoint authority must be empty.');
  }
  if (/[?#]/.test(raw)) return reject('query-or-fragment', 'Queries and fragments are forbidden.');
  if (raw.includes('%')) return reject('percent-escape', 'Percent characters are forbidden.');
  if (/[\u0000-\u001f\u007f-\u009f]/.test(raw)) {
    return reject('control-character', 'Control characters are forbidden.');
  }
  const socketPath = raw.slice('unix://'.length);
  // A2: rejecting unix:// deliberately false-rejects a spelling Docker accepts as its default.
  if (socketPath === '') return reject('empty-path', 'A socket path is required.');
  if (socketPath.includes('//')) return reject('redundant-slash', 'Repeated path slashes are forbidden.');
  if (socketPath.split('/').some((part) => part === '.' || part === '..')) {
    return reject('dot-segment', 'Dot segments are forbidden.');
  }
  if (socketPath.endsWith('/')) return reject('trailing-slash', 'A socket path cannot end with a slash.');
  return { ok: true, socketPath };
}
