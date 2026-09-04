import { describe, expect, it } from 'vitest';
import { parseUnixEndpoint, type EndpointRejectionReason } from './endpoint';

describe('parseUnixEndpoint', () => {
  const isolated: readonly [EndpointRejectionReason, string][] = [
    ['scheme', 'tcp://attacker:2375'],
    ['authority', 'unix://host/var/run/docker.sock'],
    ['query-or-fragment', 'unix:///var/run/docker.sock?x=1'],
    ['percent-escape', 'unix:///var/run/docker%2Esock'],
    ['redundant-slash', 'unix:///var//run/docker.sock'],
    ['dot-segment', 'unix:///var/../run/docker.sock'],
    ['trailing-slash', 'unix:///var/run/docker.sock/'],
    ['empty-path', 'unix://'],
    ['control-character', 'unix:///var/run/docker\u0000.sock'],
  ];

  it.each(isolated)('rejects the isolated %s mutant', (reason, raw) => {
    expect(parseUnixEndpoint(raw)).toEqual({ ok: false, reason, detail: expect.any(String) });
  });

  it.each([
    ['unix:///var/run/docker.sock', '/var/run/docker.sock'],
    ['unix:///Users/operator/.docker/run/docker.sock', '/Users/operator/.docker/run/docker.sock'],
    ['unix:///tmp/symlink.sock', '/tmp/symlink.sock'],
    ['unix:///tmp/socket with spaces.sock', '/tmp/socket with spaces.sock'],
    ['unix:///tmp/.hidden..sock', '/tmp/.hidden..sock'],
  ])('accepts %s without normalization or I/O', (raw, socketPath) => {
    expect(parseUnixEndpoint(raw)).toEqual({ ok: true, socketPath });
  });

  it.each(['http', 'https', 'ssh', 'npipe', 'foo', 'UNIX'])('rejects %s scheme', (scheme) => {
    expect(parseUnixEndpoint(`${scheme}:///var/run/docker.sock`)).toMatchObject({ ok: false, reason: 'scheme' });
  });

  it.each(['/var/run/docker.sock', 'unix:/var/run/docker.sock'])('rejects absent or short scheme %s', (raw) => {
    expect(parseUnixEndpoint(raw)).toMatchObject({ ok: false, reason: 'scheme' });
  });

  it.each(['user:pw@', ':2375', 'host:2375'])('rejects authority %s', (authority) => {
    expect(parseUnixEndpoint(`unix://${authority}/x`)).toMatchObject({ ok: false, reason: 'authority' });
  });

  it.each([
    ['unix:///x#f', 'query-or-fragment'], ['unix:///x%', 'percent-escape'],
    ['unix:////var/run/docker.sock', 'redundant-slash'], ['unix:///./x', 'dot-segment'],
    ['unix:///', 'trailing-slash'], ['unix:///x\n.sock', 'control-character'],
    ['unix:///x\u007f.sock', 'control-character'], ['unix:///x\u0085.sock', 'control-character'],
  ])('rejects single-rule variant %s', (raw, reason) => {
    expect(parseUnixEndpoint(raw)).toMatchObject({ ok: false, reason });
  });
});
