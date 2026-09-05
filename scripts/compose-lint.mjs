// Defence in depth over reviewed documents; no Docker invocation, socket dial or ~/.docker read.
// Acceptance N claim and reviewed, hash-pinned root-of-trust limits: see gate-common.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { equal, requireRule } from './gate-common.mjs';
import { canonicalCompose, canonicalDockerfile, FORBIDDEN_KEYS, SERVICE_KEYS, TOPOLOGY } from './compose-schema.mjs';
export { COMPOSE_RULES } from './compose-schema.mjs';
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameKeys = (v, keys) => object(v) && equal(Object.keys(v).sort(), [...keys].sort());
function closed(v, keys, code) { requireRule(sameKeys(v, keys), code); }
function scan(value, location = []) {
  if (typeof value === 'string' && value.includes('$')) {
    const permitted = location.length === 4 && location[0] === 'services'
      && Object.hasOwn(TOPOLOGY.services, location[1])
      && ((location[2] === 'environment' && location[3] === 'TV_EVAL_EPOCH')
        || (location[2] === 'labels' && location[3] === 'com.tinyvault.epoch'));
    requireRule(permitted && value === '${TV_EVAL_EPOCH}', 'interpolation');
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    requireRule(!key.includes('$'), 'interpolation');
    requireRule(!FORBIDDEN_KEYS.includes(key), `forbidden-${key}`);
    scan(child, [...location, key]);
  }
}
function service(value, expected) {
  requireRule(object(value) && Object.keys(value).every((k) => SERVICE_KEYS.includes(k)), 'service-keys');
  requireRule(Array.isArray(value.ports) && value.ports.every((p) => typeof p === 'string'), 'ports-shape');
  requireRule(equal(value.ports, expected.ports), 'ports-exact');
  closed(value.environment, Object.keys(expected.environment), 'environment-keys');
  requireRule(Object.keys(expected.environment).every((k) => value.environment[k] === expected.environment[k]), 'environment-values');
  closed(value.labels, Object.keys(expected.labels), 'labels-keys');
  requireRule(Object.keys(expected.labels).every((k) => value.labels[k] === expected.labels[k]), 'labels-values');
  requireRule(value.healthcheck !== undefined, 'healthcheck-missing');
  closed(value.healthcheck, Object.keys(expected.healthcheck), 'healthcheck-keys');
  requireRule(equal(value.healthcheck.test, expected.healthcheck.test), 'healthcheck-test');
  requireRule(Object.keys(TOPOLOGY.healthcheck).every((k) => value.healthcheck[k] === TOPOLOGY.healthcheck[k]), 'healthcheck-timings');
  requireRule(Object.hasOwn(value, 'build') === Object.hasOwn(expected, 'build'), 'build-placement');
  if (expected.build) {
    closed(value.build, ['context', 'dockerfile'], 'build-keys');
    requireRule(value.build.context === expected.build.context && value.build.dockerfile === expected.build.dockerfile, 'build-values');
  }
  for (const key of ['image', 'user', 'init']) requireRule(value[key] === expected[key], key);
}
export function lintCompose(document) {
  scan(document);
  closed(document, ['services'], 'top-keys');
  closed(document.services, Object.keys(TOPOLOGY.services), 'service-set');
  const expected = canonicalCompose();
  for (const name of Object.keys(expected.services)) service(document.services[name], expected.services[name]);
}
export function lintDockerfile(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const commands = lines.map((line) => [line.split(/\s/)[0].toUpperCase(), line]);
  const by = (op) => commands.filter(([key]) => key === op).map(([, line]) => line);
  requireRule(by('EXPOSE').length === 0, 'docker-expose');
  requireRule(by('VOLUME').length === 0, 'docker-volume');
  requireRule(by('ENV').length === 0, 'docker-env');
  requireRule(by('ARG').length === 0, 'docker-arg');
  requireRule(equal(by('FROM'), ['FROM node:24-slim AS builder', 'FROM node:24-slim']), 'docker-from');
  requireRule(equal(by('USER'), ['USER node']), 'docker-user');
  requireRule(equal(by('LABEL'), [`LABEL ${TOPOLOGY.markers.HISTORY_MARKER}`]), 'docker-label');
  requireRule(commands.every(([op]) => ['FROM', 'WORKDIR', 'COPY', 'RUN', 'LABEL', 'USER', 'ENTRYPOINT'].includes(op)), 'docker-instruction');
  requireRule(equal(lines, canonicalDockerfile().trim().split('\n')), 'docker-content');
}
export function checkCompose(root) {
  const file = path.join(root, TOPOLOGY.composePath);
  // lstat also catches a dangling .env symlink; no interpolation file is read.
  const entries = fs.readdirSync(path.dirname(file));
  requireRule(!entries.includes('.env'), 'dotenv');
  let document;
  try { document = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { requireRule(false, 'compose-json'); }
  lintCompose(document);
  lintDockerfile(fs.readFileSync(path.join(root, TOPOLOGY.dockerfilePath), 'utf8'));
}
