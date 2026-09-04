export type EndpointRejectionReason =
  | 'scheme' | 'authority' | 'query-or-fragment' | 'percent-escape'
  | 'redundant-slash' | 'dot-segment' | 'trailing-slash' | 'empty-path' | 'control-character';
export type EndpointParse =
  | { readonly ok: true; readonly socketPath: string }
  | { readonly ok: false; readonly reason: EndpointRejectionReason; readonly detail: string };

function reject(reason: EndpointRejectionReason, detail: string): EndpointParse {
  return { ok: false, reason, detail };
}

export function parseUnixEndpoint(raw: string): EndpointParse {
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
  if (socketPath === '') return reject('empty-path', 'A socket path is required.');
  if (socketPath.includes('//')) return reject('redundant-slash', 'Repeated path slashes are forbidden.');
  if (socketPath.split('/').some((part) => part === '.' || part === '..')) {
    return reject('dot-segment', 'Dot segments are forbidden.');
  }
  if (socketPath.endsWith('/')) return reject('trailing-slash', 'A socket path cannot end with a slash.');
  return { ok: true, socketPath };
}
