import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDependencyBoundary } from './dependency-boundary.mjs';

let cli;
let projectLock;
let projectRoot;
let runtimeMatrixOutcomes = 0;

export function configureFixtureHarness(configuration) {
  ({ cli, projectLock, projectRoot } = configuration);
}

export function getRuntimeMatrixOutcomes() {
  return runtimeMatrixOutcomes;
}

export function assertViolation(root, name) {
  const result = checkDependencyBoundary(root);
  assert.notEqual(result.violations.length, 0, `${name} mutation did not fail the dependency gate`);
}

export function assertPass(root, vetted, message) {
  const result = boundaryResult(root, vetted);
  assert.deepEqual(result.violations, [], `${message}\n${formatResult(result)}`);
}

export function assertBoundaryViolation(root, vetted, predicate, message) {
  const result = boundaryResult(root, vetted);
  assert.equal(result.violations.some(predicate), true, `${message}\n${formatResult(result)}`);
}

export function assertConfigurationViolation(root, vetted, fragment, message) {
  assertBoundaryViolation(root, vetted, (violation) =>
    violation.syntax.startsWith('gate configuration:') && violation.syntax.includes(fragment), message);
}

export function boundaryResult(root, vetted) {
  return vetted === undefined
    ? checkDependencyBoundary(root)
    : checkDependencyBoundary(root, { vetted });
}

function formatResult(result) {
  return result.violations.map((violation) => violation.syntax).join('\n');
}

export function assertCliStatus(root, expected, message) {
  const result = spawnSync(process.execPath, [
    '--experimental-import-meta-resolve', cli, '--root', root,
  ], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, expected,
    `${message}\nerror: ${result.error?.message ?? 'none'}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
}

export function assertEdgeOutcomes(root, specifier, expectations, name) {
  for (const syntax of ['import', 'require']) {
    write(root, 'src/core/probe.ts', syntax === 'import'
      ? `import '${specifier}';\n`
      : `const loaded = require('${specifier}'); void loaded;\n`);
    assertCliStatus(
      root,
      expectations[syntax] ? 1 : 0,
      `${name} ${syntax} edge had the wrong protected/clean outcome`,
    );
    runtimeMatrixOutcomes += 1;
  }
}

export function withRuntimeFixture(assertion) {
  withFixture('export const initial = true;', (root) => {
    write(root, 'src/supervisor/marker.ts', "export const marker = 'protected';\n");
    assertion(root);
  });
}

function withVettedProbe(assertion) {
  withFixture('export const safe = true;', (root) => {
    assertion(root, [{
      packages: ['vetted-probe'],
      version: '1.0.0',
      importerFiles: ['src/browser/playwright.ts'],
      directImportOnly: ['vetted-probe'],
      reachableFrom: ['src/browser', 'testbed'],
      opaqueFiles: ['vetted-probe/opaque.js'],
      reason: 'selftest-only vetted package',
    }]);
  });
}

export function withFixture(probeSource, assertion, compilerOptions = {}) {
  withTemporaryRoot((root) => {
    writeConfig(root, compilerOptions);
    installDefaultVettedConfiguration(root);
    write(root, 'src/core/probe.ts', `${probeSource}\n`);
    write(root, 'src/supervisor/evaluator.ts', "export const evaluate = () => 'protected';\n");
    write(root, 'src/supervisor/tripwire.ts', "export const detect = () => 'protected';\n");
    write(root, 'src/supervisor/secretMatcher.ts', "export const match = () => 'protected';\n");
    write(root, 'src/supervisor/marker.ts', "export const marker = 'protected';\n");
    assertion(root);
  });
}

export function withTemporaryRoot(assertion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-dependency-gate-'));
  try {
    assertion(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export function writeConfig(root, compilerOptions = {}) {
  write(root, 'tsconfig.json', JSON.stringify({
    compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', ...compilerOptions },
    include: ['src/**/*.ts', 'testbed/**/*.ts'],
  }));
}

export function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

export function writePackage(root, name, source) {
  write(root, `node_modules/${name}/package.json`, JSON.stringify({
    name,
    version: '1.0.0',
    type: 'module',
    exports: './index.ts',
  }));
  write(root, `node_modules/${name}/index.ts`, source);
}

export function writeRuntimePackage(root, name, manifest, files) {
  write(root, `node_modules/${name}/package.json`, JSON.stringify({
    name,
    version: '1.0.0',
    ...manifest,
  }));
  for (const [relative, contents] of Object.entries(files)) {
    write(root, `node_modules/${name}/${relative}`, contents);
  }
}

function writeVettedProbe(root, files, withIntegrity = true) {
  writeRuntimePackage(root, 'vetted-probe', { main: './index.js' }, files);
  lockFixturePackage(
    root,
    'vetted-probe',
    '1.0.0',
    withIntegrity ? 'sha512-fixture-integrity' : undefined,
  );
}

function writeTraversalPackage(root, modules) {
  write(root, 'node_modules/vetted-probe/package.json', JSON.stringify({
    name: 'vetted-probe',
    version: '1.0.0',
    main: './index.js',
  }));
  const imports = Array.from(
    { length: modules },
    (_, index) => `require('./chain-${index}.js');`,
  ).join('\n');
  write(root, 'node_modules/vetted-probe/index.js', `${imports}\n`);
  for (let index = 0; index < modules; index += 1) {
    write(root, `node_modules/vetted-probe/chain-${index}.js`, cleanModule());
  }
  lockFixturePackage(root, 'vetted-probe', '1.0.0', 'sha512-fixture-integrity');
}

function lockFixturePackage(root, name, version, integrity) {
  const lockPath = path.join(root, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const entry = { version };
  if (integrity !== undefined) entry.integrity = integrity;
  lock.packages[`node_modules/${name}`] = entry;
  write(root, 'package-lock.json', JSON.stringify(lock));
}

export function installDefaultVettedConfiguration(root) {
  for (const name of ['playwright', 'playwright-core']) linkInstalledPackage(root, name);
  write(root, 'src/browser/playwright.ts', 'export const wrapperControl = true;\n');
  const packages = { '': { name: 'gate-fixture', version: '1.0.0' } };
  for (const name of ['playwright', 'playwright-core']) {
    packages[`node_modules/${name}`] = projectLock.packages[`node_modules/${name}`];
  }
  write(root, 'package-lock.json', JSON.stringify({
    name: 'gate-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    packages,
  }));
}

export function linkInstalledPackage(root, name) {
  const installed = path.join(projectRoot, 'node_modules', name);
  const target = path.join(root, 'node_modules', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(installed, target, 'dir');
}

export function protectedRequire() {
  return "require('../../src/supervisor/marker.ts');\n";
}

export function protectedImport() {
  return "import '../../src/supervisor/marker.ts';\n";
}

export function cleanModule() {
  return 'export const clean = true;\n';
}

export function runM4Fixtures() {
  runOpaqueImporterFixtures();
  runTraversalCapFixture();
  runVettedConfigurationFixtures();
  runDirectImporterFixtures();
  runReachabilityFixtures();
  runManifestPathFixture();
  runRealGraphFixture();
}

function runOpaqueImporterFixtures() {
  withVettedProbe((root, vetted) => {
    write(root, 'src/browser/playwright.ts', "import 'vetted-probe';\n");
    writeVettedProbe(root, {
      'index.js': "require('./opaque.js');\n",
      'opaque.js': "const target = 'optional-load'; require(target);\n",
      'strict.js': "const target = 'optional-load'; require(target);\n",
    });
    assertPass(root, vetted,
      'legitimate opaque-file control was rejected; the named importer should be tolerated');
  });
  withVettedProbe((root, vetted) => {
    write(root, 'src/browser/playwright.ts', "import 'vetted-probe';\n");
    writeVettedProbe(root, {
      'index.js': "require('./strict.js');\n",
      'opaque.js': cleanModule(),
      'strict.js': "const target = 'optional-load'; require(target);\n",
    });
    assertBoundaryViolation(root, vetted, (violation) =>
      violation.target.endsWith('vetted-probe/strict.js'),
    'package-wide opaque-tolerance mutant accepted a non-listed file in the same package');
  });
  withVettedProbe((root, vetted) => {
    write(root, 'src/browser/playwright.ts', "import 'vetted-probe';\n");
    writeVettedProbe(root, {
      'index.js': "require('./opaque.js');\n",
      'opaque.js': `const target = 'optional-load'; require(target);\n${protectedRequire()}`,
    });
    assertBoundaryViolation(root, vetted, (violation) =>
      violation.target.endsWith('src/supervisor/marker.ts'),
    'opaque protected-reach mutant was tolerated');
  });
}

function runTraversalCapFixture() {
  withVettedProbe((root, vetted) => {
    write(root, 'src/browser/playwright.ts', "import 'vetted-probe';\n");
    write(root, 'testbed/x.ts', "import '../src/browser/playwright';\n");
    write(root, 'scripts/tool.mjs', "import '../src/browser/playwright.ts';\n");
    writeTraversalPackage(root, 10_000);
    const traversalVetted = [{
      ...vetted[0],
      opaqueFiles: ['vetted-probe/chain-0.js'],
    }];
    const result = boundaryResult(root, traversalVetted);
    for (const entry of [
      'src/browser/playwright.ts',
      'testbed/x.ts',
      'scripts/tool.mjs',
    ]) {
      assert.equal(result.violations.some((violation) =>
        violation.entry.endsWith(entry)
          && violation.syntax.includes('traversal exceeded')), true,
      `traversal-exceeded tolerance mutant passed for ${entry}`);
    }
    write(root, 'node_modules/vetted-probe/index.js', cleanModule());
    fs.unlinkSync(path.join(root, 'scripts/tool.mjs'));
    assertPass(root, traversalVetted, 'below-cap traversal legitimate-traffic control was rejected');
  });
}

function runVettedConfigurationFixtures() {
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    const mismatched = [{ ...vetted[0], version: '2.0.0' }];
    assertConfigurationViolation(root, mismatched, 'version mismatch',
      'vetted-package version-mismatch mutant passed');
    assertPass(root, vetted, 'matching vetted-package version control was rejected');
  });
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() }, false);
    assertConfigurationViolation(root, vetted, 'lockfile integrity is missing',
      'missing lockfile-integrity mutant passed');
    lockFixturePackage(root, 'vetted-probe', '1.0.0', 'sha512-fixture-integrity');
    assertPass(root, vetted, 'present lockfile-integrity control was rejected');
  });
}

function runDirectImporterFixtures() {
  for (const [file, specifier, message] of [
    ['src/browser/session.ts', 'playwright', 'session.ts -> playwright importer mutant passed'],
    ['src/browser/session.ts', 'playwright-core', 'session.ts -> playwright-core importer mutant passed'],
    ['src/browser/playwright.ts', 'playwright-core', 'playwright.ts -> playwright-core direct-package mutant passed'],
    ['src/core/x.ts', 'playwright', 'src/core/x.ts -> playwright importer mutant passed'],
    ['src/supervisor/marker.ts', 'playwright', 'unreachable supervisor -> playwright importer mutant passed'],
    ['testbed/runner.ts', 'playwright', 'testbed/runner.ts -> playwright importer mutant passed'],
  ]) {
    withFixture('export const safe = true;', (root) => {
      write(root, file, `import '${specifier}';\n`);
      assertViolation(root, message);
    });
  }
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/browser/playwright.ts', "import 'playwright';\n");
    assertPass(root, undefined, 'single Playwright importer legitimate-traffic control was rejected');
  });
}

function runReachabilityFixtures() {
  withFixture("import '../browser/playwright';", (root) => {
    write(root, 'src/browser/playwright.ts', "import 'playwright';\n");
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/core/probe.ts')
        && violation.syntax.startsWith('vetted package unreachable from entry'),
    'src/core -> browser wrapper reachability mutant passed');
  });
  withFixture('export const safe = true;', (root) => {
    write(root, 'testbed/x.ts', "import '../src/supervisor/marker';\n");
    assertPass(root, undefined, 'testbed -> supervisor evaluator-zone control was rejected');
  });
  withFixture("import '../../testbed/y';", (root) => {
    write(root, 'testbed/y.ts', "import '../src/supervisor/marker';\n");
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/core/probe.ts')
        && violation.target.endsWith('src/supervisor/marker.ts'),
    'src/core -> testbed -> supervisor entry-keying mutant passed');
  });
}

function runManifestPathFixture() {
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    assertConfigurationViolation(root, [{ ...vetted[0], packages: ['not-installed'] }],
      'is not installed', 'uninstalled vetted-package mutant passed');
    assertConfigurationViolation(root, [{ ...vetted[0], opaqueFiles: ['vetted-probe/missing.js'] }],
      'opaqueFiles path is missing', 'missing opaqueFiles-path mutant passed');
    assertConfigurationViolation(root, [{ ...vetted[0], importerFiles: ['src/browser/missing.ts'] }],
      'importerFiles path is missing', 'missing importerFiles-path mutant passed');
    assertPass(root, vetted, 'valid vetted manifest control was rejected');
  });
}

function runRealGraphFixture() {
  const realResult = checkDependencyBoundary(projectRoot);
  assert.deepEqual(realResult.violations, [], 'real M4 tree failed with the built-in vetted manifest');
  const unvettedResult = checkDependencyBoundary(projectRoot, { vetted: [] });
  assert.notEqual(unvettedResult.violations.length, 0,
    'empty-manifest mutant passed on the real Playwright graph');
  const importers = [...new Set(unvettedResult.violations.map((violation) =>
    path.relative(projectRoot, violation.target)))].sort();
  assert.deepEqual(importers, [
    'node_modules/playwright-core/lib/coreBundle.js',
    'node_modules/playwright-core/lib/utilsBundle.js',
  ], 'empty-manifest real-graph failure did not name exactly the two bundle importers');
}
