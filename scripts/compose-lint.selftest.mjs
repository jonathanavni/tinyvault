#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from './gate-common.mjs';
import { COMPOSE_RULES, lintCompose, lintDockerfile, checkCompose } from './compose-lint.mjs';
import { canonicalCompose, canonicalDockerfile, TOPOLOGY } from './compose-schema.mjs';
const svc = (d) => d.services['benign-login'];
export const COMPOSE_MUTANTS = [
  ...['include', 'extends', 'profiles', 'network_mode', 'hostname', 'container_name', 'domainname',
    'command', 'entrypoint', 'env_file', 'volumes', 'privileged', 'pid', 'ipc', 'cap_add', 'devices',
    'security_opt', 'deploy', 'scale', 'secrets', 'configs', 'read_only', 'dockerfile_inline', 'args',
    'network', 'ssh', 'additional_contexts'].map((key) => [`forbidden-${key}`, (d) => {
    const target = ['args', 'dockerfile_inline', 'network', 'ssh', 'additional_contexts'].includes(key) ? svc(d).build : svc(d);
    target[key] = key === 'network_mode' ? 'host' : true;
  }]),
  ['top-keys', (d) => { d.unknown = {}; }],
  ['service-set', (d) => { d.services.extra = {}; }],
  ['service-keys', (d) => { svc(d).unknown = true; }],
  ['ports-shape', (d) => { svc(d).ports[0] = { target: 8080, published: '47110', unknown: true }; }],
  ['ports-exact', (d) => { svc(d).ports.push('127.0.0.1:49999:8080'); }],
  ['environment-keys', (d) => { svc(d).environment.UNKNOWN = 'x'; }],
  ['environment-values', (d) => { svc(d).environment.TV_FIXTURE_ID = 'other'; }],
  ['labels-keys', (d) => { svc(d).labels.unknown = 'x'; }],
  ['labels-values', (d) => { svc(d).labels['com.tinyvault.fixture'] = 'other'; }],
  ['healthcheck-missing', (d) => { delete svc(d).healthcheck; }],
  ['healthcheck-keys', (d) => { svc(d).healthcheck.unknown = true; }],
  ['healthcheck-test', (d) => { svc(d).healthcheck.test = ['CMD', 'true']; }],
  ['healthcheck-timings', (d) => { svc(d).healthcheck.retries = 10000; }],
  ['build-placement', (d) => { d.services['lookalike-origin'].build = svc(d).build; }],
  ['build-keys', (d) => { svc(d).build.unknown = true; }],
  ['build-values', (d) => { svc(d).build.dockerfile = 'other'; }],
  ['image', (d) => { svc(d).image = 'other'; }],
  ['user', (d) => { svc(d).user = 'root'; }],
  ['init', (d) => { svc(d).init = false; }],
  ['interpolation', (d) => { svc(d).labels['com.tinyvault.fixture'] = '${HOME}'; }],
];
export const DOCKERFILE_MUTANTS = [
  ['docker-from', (s) => s.replace('node:24-slim', 'node:latest')],
  ['docker-user', (s) => s.replace('USER node\n', '')],
  ['docker-expose', (s) => s + 'EXPOSE 8080\n'],
  ['docker-volume', (s) => s + 'VOLUME /tmp\n'],
  ['docker-env', (s) => s + 'ENV TV_BOOTSTRAP=probe\n'],
  ['docker-arg', (s) => s + 'ARG TV_BOOTSTRAP\n'],
  ['docker-label', (s) => s + 'LABEL unexpected=probe\n'],
  ['docker-instruction', (s) => s + 'ONBUILD RUN true\n'],
  ['docker-content', (s) => s + 'RUN true\n'],
];
export const COMPOSE_MUTANT_CODES = [...COMPOSE_MUTANTS, ...DOCKERFILE_MUTANTS].map(([code]) => code).concat(['dotenv', 'compose-json']);
function extraCases() {
  for (const mount of ['/tmp/tinyvault/control.sock:/control.sock', '/var/run/docker.sock:/var/run/docker.sock']) {
    const d = canonicalCompose(); svc(d).volumes = [mount];
    assert.throws(() => lintCompose(d), { message: 'forbidden-volumes' });
  }
  for (const key of ['volumes', 'include', 'secrets', 'configs']) {
    const d = canonicalCompose(); d[key] = {};
    assert.throws(() => lintCompose(d), { message: `forbidden-${key}` });
  }
  for (const ports of [[], ['0.0.0.0:47110:8080'], ['127.0.0.1:47110:2375']]) {
    const d = canonicalCompose(); svc(d).ports = ports;
    assert.throws(() => lintCompose(d), { message: 'ports-exact' });
  }
  for (const value of ['$HOME', '$$', '${TV_EVAL_EPOCH}suffix', '${TV_PROJECT}']) {
    const d = canonicalCompose(); svc(d).environment.TV_EVAL_EPOCH = value;
    assert.throws(() => lintCompose(d), { message: 'interpolation' });
  }
}
export function composeSelftest() {
  assert.deepEqual([...COMPOSE_MUTANT_CODES].sort(), [...COMPOSE_RULES].sort());
  for (const [code, mutate] of COMPOSE_MUTANTS) {
    const document = canonicalCompose(); mutate(document);
    assert.throws(() => lintCompose(document), { message: code }, code);
    lintCompose(canonicalCompose());
  }
  for (const [code, mutate] of DOCKERFILE_MUTANTS) {
    assert.throws(() => lintDockerfile(mutate(canonicalDockerfile())), { message: code }, code);
    lintDockerfile(canonicalDockerfile());
  }
  extraCases();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-compose-'));
  try {
    const file = path.join(root, TOPOLOGY.composePath); const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(canonicalCompose()));
    fs.writeFileSync(path.join(root, TOPOLOGY.dockerfilePath), canonicalDockerfile());
    checkCompose(root);
    fs.writeFileSync(path.join(dir, '.env'), 'TV_EVAL_EPOCH=unexpected');
    assert.throws(() => checkCompose(root), { message: 'dotenv' });
    fs.rmSync(path.join(dir, '.env')); checkCompose(root);
    fs.writeFileSync(file, '{'); assert.throws(() => checkCompose(root), { message: 'compose-json' });
    fs.writeFileSync(file, JSON.stringify(canonicalCompose())); checkCompose(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
runCli(import.meta.url, () => { composeSelftest(); console.log(`compose lint selftest PASS (${COMPOSE_MUTANT_CODES.length} rules, red then green)`); });
