import type { Origin } from './types';

export const INVALID_ORIGIN_MESSAGE = 'Invalid bare HTTP(S) origin';

/** Validates and normalizes an exact bare HTTP(S) origin without trimming input. */
export function validateBareOrigin(input: string): Origin {
  if (input.length === 0 || input.trim() !== input || /\s/u.test(input)) return invalid();
  if (!/^https?:\/\//iu.test(input)) return invalid();

  const authority = input.slice(input.indexOf('://') + 3);
  if (authority.length === 0 || /[/?#]/u.test(authority)) return invalid();
  if (authority.includes('@') || authority.includes('%') || authority.endsWith(':')) return invalid();
  const rawPort = portFromAuthority(authority);
  if (rawPort !== undefined) {
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return invalid();
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return invalid();
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return invalid();
  if (parsed.username !== '' || parsed.password !== '') return invalid();
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return invalid();
  if (parsed.hostname === '' || parsed.hostname.endsWith('.')) return invalid();

  const rawHostname = hostnameFromAuthority(authority);
  if (/^[0-9.]+$/u.test(rawHostname) && rawHostname !== parsed.hostname) return invalid();

  return parsed.origin;
}

export function sameOrigin(left: Origin, right: Origin): boolean {
  return left === right;
}

function hostnameFromAuthority(authority: string): string {
  if (authority.startsWith('[')) {
    const closingBracket = authority.indexOf(']');
    return closingBracket < 0 ? authority : authority.slice(0, closingBracket + 1);
  }
  const colon = authority.lastIndexOf(':');
  return colon < 0 ? authority : authority.slice(0, colon);
}

function portFromAuthority(authority: string): string | undefined {
  if (authority.startsWith('[')) {
    const closingBracket = authority.indexOf(']');
    return authority[closingBracket + 1] === ':' ? authority.slice(closingBracket + 2) : undefined;
  }
  const colon = authority.lastIndexOf(':');
  return colon < 0 ? undefined : authority.slice(colon + 1);
}

function invalid(): never {
  throw new Error(INVALID_ORIGIN_MESSAGE);
}
