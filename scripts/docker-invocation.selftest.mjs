#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDockerInvocation, DOCKER_CAPABILITY_ALLOWLIST } from './docker-invocation.mjs';

const cli = fileURLToPath(new URL('./check-docker-invocation.mjs', import.meta.url));

function withFixture(source, run, relative = 'src/probe.ts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-docker-gate-'));
  try {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertCli(root, status) {
  const result = spawnSync(process.execPath, [cli, '--root', root], {
    encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
  assert.match(status ? result.stderr : result.stdout, /docker invocation (?:PASS|FAIL)/);
}

const forms = [
  (s) => `import { spawn } from '${s}';`,
  (s) => `import '${s}';`,
  (s) => `const cp = require('${s}');`,
  (s) => `const cp = await import('${s}');`,
];
for (const capability of ['child_process', 'net', 'http', 'https']) {
  for (const prefix of ['', 'node:']) {
    for (const form of forms) {
      withFixture(form(prefix + capability), (root) => {
        assert.deepEqual(checkDockerInvocation(root), [{
          file: 'src/probe.ts', line: 1, specifier: prefix + capability,
        }]);
        assertCli(root, 1);
      });
    }
  }
}

for (const extension of ['ts', 'mts', 'js', 'mjs']) {
  withFixture("import { spawn } from 'node:child_process'; spawn('docker', []);", (root) => {
    assert.equal(checkDockerInvocation(root).length, 1);
    assertCli(root, 1);
  }, `nested/probe.${extension}`);
}

for (const relative of DOCKER_CAPABILITY_ALLOWLIST) {
  withFixture("import 'node:child_process';", (root) => {
    assert.deepEqual(checkDockerInvocation(root), []);
    assertCli(root, 0);
  }, relative);
}

withFixture("import 'node:fs'; // import 'node:net';\nconst text = \"require('http')\";", (root) => {
  assert.deepEqual(checkDockerInvocation(root), []);
  assertCli(root, 0);
});
withFixture("import 'node:net';", (root) => assertCli(root, 1), 'scripts/unlisted.mjs');

// Explicit limitation control: the runtime suite, not this scanner, catches this payload.
withFixture("const cp = await import('node:' + 'child_process');\n"
  + "cp.spawn(Buffer.from('ZG9ja2Vy','base64').toString(), []);", (root) => {
  assert.deepEqual(checkDockerInvocation(root), []);
  assertCli(root, 0);
});

for (const directory of ['node_modules', 'dist', 'artifacts']) {
  withFixture('export const clean = true;', (root) => {
    fs.mkdirSync(path.join(root, directory));
    fs.writeFileSync(path.join(root, directory, 'ignored.ts'), "import 'net';");
    assertCli(root, 0);
  });
}

withFixture('export const clean = true;', (root) => {
  assertCli(path.join(root, 'missing'), 1);
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  assertCli(root, 1);
});

console.log('docker invocation selftest PASS (violating fixtures exit 1; clean controls exit 0)');
