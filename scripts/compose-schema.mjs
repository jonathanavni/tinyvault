import { readFileSync } from 'node:fs';
import { validateTopology } from '../testbed/docker/topology.mjs';
export const TOPOLOGY = validateTopology(JSON.parse(readFileSync(
  new URL('../testbed/docker/topology.json', import.meta.url), 'utf8')));
export const SERVICE_KEYS = ['image', 'build', 'ports', 'environment', 'labels', 'healthcheck', 'user', 'init'];
export const FORBIDDEN_KEYS = ['include', 'extends', 'profiles', 'network_mode', 'hostname', 'container_name',
  'domainname', 'command', 'entrypoint', 'env_file', 'volumes', 'privileged', 'pid', 'ipc', 'cap_add',
  'devices', 'security_opt', 'deploy', 'scale', 'secrets', 'configs', 'read_only', 'dockerfile_inline',
  'args', 'network', 'ssh', 'additional_contexts'];
export const COMPOSE_RULES = Object.freeze([
  ...FORBIDDEN_KEYS.map((key) => `forbidden-${key}`),
  'top-keys', 'service-set', 'service-keys', 'ports-shape', 'ports-exact', 'environment-keys',
  'environment-values', 'labels-keys', 'labels-values', 'healthcheck-missing', 'healthcheck-keys',
  'healthcheck-test', 'healthcheck-timings', 'build-placement', 'build-keys', 'build-values',
  'image', 'user', 'init', 'interpolation', 'dotenv', 'compose-json',
  'docker-from', 'docker-user', 'docker-expose', 'docker-volume', 'docker-env', 'docker-arg',
  'docker-label', 'docker-instruction', 'docker-content',
]);
export function healthcheckTest(service) {
  const port = TOPOLOGY.services[service][0].container;
  return ['CMD', 'node', '-e', `if(!require('node:fs').existsSync(${JSON.stringify(TOPOLOGY.controlSocket)}))process.exit(1);`
    + `const r=require('node:http').get('http://127.0.0.1:${port}/',s=>{s.resume();process.exit(s.statusCode>=200&&s.statusCode<400?0:1)});`
    + "r.on('error',()=>process.exit(1));r.setTimeout(1000,()=>{r.destroy();process.exit(1)});"];
}
export function canonicalCompose() {
  const services = Object.fromEntries(Object.entries(TOPOLOGY.services).map(([service, ports]) => {
    const origin = (p) => `http://${p.address}:${p.host}`;
    const environment = { TV_FIXTURE_ID: service, TV_EVAL_EPOCH: '${TV_EVAL_EPOCH}', TV_PUBLIC_ORIGIN: origin(ports[0]) };
    if (ports.length === 2) environment.TV_LOOKALIKE_PUBLIC_ORIGIN = origin(ports[1]);
    const value = { image: TOPOLOGY.imageName, ports: ports.map((p) => `${p.address}:${p.host}:${p.container}`),
      environment, labels: { 'com.tinyvault.fixture': service, 'com.tinyvault.epoch': '${TV_EVAL_EPOCH}' },
      healthcheck: { test: healthcheckTest(service), ...TOPOLOGY.healthcheck }, user: 'node', init: true };
    if (service === 'benign-login') value.build = { context: '../..', dockerfile: TOPOLOGY.dockerfilePath };
    return [service, value];
  }));
  return { services };
}
export function canonicalDockerfile() {
  return [
    'FROM node:24-slim AS builder', 'WORKDIR /build', 'COPY package.json package-lock.json ./',
    'RUN npm ci --ignore-scripts', 'COPY . .',
    'RUN ./node_modules/.bin/esbuild testbed/docker/container/main.ts testbed/docker/container/bridge.ts --bundle --platform=node --target=node24 --format=esm --out-extension:.js=.mjs --outdir=/build/bundles --metafile=/build/bundles/meta.json'
      + ` --define:TV_CONTAINER_TOPOLOGY="$(node -p 'JSON.stringify(require("./testbed/docker/topology.json"))')"`
      + ` --define:TV_BENIGN_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/benign-login/index.html","utf8"))')"`
      + ` --define:TV_HIDDEN_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/dom-hidden-injection/index.html","utf8"))')"`
      + ` --define:TV_SECRET_ECHO_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/secret-echo/index.html","utf8"))')"`
      + ` --define:TV_FAKE_REAUTH_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/fake-reauth/index.html","utf8"))')"`,
    'FROM node:24-slim', 'WORKDIR /app', 'COPY --from=builder /build/bundles/ /app/',
    `LABEL ${TOPOLOGY.markers.HISTORY_MARKER}`, 'USER node',
    `ENTRYPOINT ["node",${JSON.stringify(TOPOLOGY.markers.ARGV_MARKER)}]`,
    `RUN printf '%s' '${TOPOLOGY.markers.EXPORT_MARKER}' > /tmp/tinyvault-export.marker`, '',
  ].join('\n');
}
