import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  checkDependencyBoundary,
  formatViolations,
  realpathEndsWith,
} from './dependency-boundary.mjs';

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

function assertOnlyVersionViolation(root, vetted, fragment, excludedFragment, message) {
  const result = boundaryResult(root, vetted);
  const versionViolations = result.violations.filter((violation) =>
    violation.syntax.includes('version mismatch'));
  assert.equal(versionViolations.length, 1, `${message}\n${formatResult(result)}`);
  assert.equal(versionViolations[0].syntax.includes(fragment), true, message);
  assert.equal(versionViolations[0].syntax.includes(excludedFragment), false, message);
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

function rewriteInstalledPackageVersion(root, name, version) {
  const manifestPath = path.join(root, 'node_modules', name, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  write(root, `node_modules/${name}/package.json`, JSON.stringify({ ...manifest, version }));
}

export function installDefaultVettedConfiguration(root) {
  for (const name of ['playwright', 'playwright-core']) linkInstalledPackage(root, name);
  write(root, 'src/browser/playwright.ts', 'export const wrapperControl = true;\n');
  fs.mkdirSync(path.join(root, 'testbed'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/adapters/mcp'), { recursive: true });
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
  runToolchainModuleLoaderFixture();
  runVettedConfigurationFixtures();
  runDirectImporterFixtures();
  runTypeImportFixtures();
  runReachabilityFixtures();
  runProductionWalkFixtures();
  runZoneIdentityFixtures();
  runManifestPathFixture();
  runSymlinkedNodeModulesFixture();
  runRealGraphFixture();
}

function runToolchainModuleLoaderFixture() {
  withFixture('export const safe = true;', (root) => {
    write(root, 'scripts/tool.mjs', "import 'relay';\n");
    writeRuntimePackage(root, 'relay', { main: './index.mjs', type: 'module' }, {
      'index.mjs': "const { createRequire } = await import('node:module'); void createRequire;\n",
    });
    const result = checkDependencyBoundary(root);
    assert.deepEqual(
      result.violations.map((violation) => violation.syntax),
      ['external-package module loader dynamic import()'],
      `scripts-rooted node:module relay did not produce exactly one violation\n${formatResult(result)}`,
    );
    assert.equal(result.violations[0].entry.endsWith('scripts/tool.mjs'), true,
      'toolchain module-loader violation was not attributed to scripts/tool.mjs');
  });
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
  runVettedVersionFixtures();
  runVettedShapeFixtures();
  runInvalidVettedGrantFixture();
}

function runVettedVersionFixtures() {
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    rewriteInstalledPackageVersion(root, 'vetted-probe', '2.0.0');
    assertOnlyVersionViolation(
      root,
      vetted,
      'package vetted-probe version mismatch',
      'lockfile version mismatch',
      'installed-package version-check mutant passed when the lockfile still agreed',
    );
  });
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    lockFixturePackage(root, 'vetted-probe', '2.0.0', 'sha512-fixture-integrity');
    assertOnlyVersionViolation(
      root,
      vetted,
      'lockfile version mismatch',
      'package vetted-probe version mismatch',
      'lockfile version-check mutant passed when the installed package still agreed',
    );
  });
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
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

function runVettedShapeFixtures() {
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    assertConfigurationViolation(root, [{ ...vetted[0], packages: [] }],
      'packages must not be empty', 'empty packages configuration was accepted');
  });
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    assertConfigurationViolation(root, [{ ...vetted[0], importerFiles: [] }],
      'importerFiles must not be empty', 'empty importerFiles configuration was accepted');
  });
  for (const reachableFrom of ['..', '../..', '', 'ABSOLUTE']) {
    withVettedProbe((root, vetted) => {
      writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
      const value = reachableFrom === 'ABSOLUTE'
        ? path.join(root, 'src/browser')
        : reachableFrom;
      assertConfigurationViolation(root, [{ ...vetted[0], reachableFrom: [value] }],
        'reachableFrom path must be a normalized, non-empty, in-repo directory',
        `invalid reachableFrom entry was accepted: ${value}`);
    });
  }
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    assertConfigurationViolation(root, [{ ...vetted[0], reachableFrom: ['src/browser/../core'] }],
      'reachableFrom path must be a normalized, non-empty, in-repo directory',
      'C3 path-normalization mutant accepted src/browser/../core');
  });
}

function runInvalidVettedGrantFixture() {
  withVettedProbe((root, vetted) => {
    write(root, 'src/browser/playwright.ts', "import 'vetted-probe';\n");
    writeVettedProbe(root, {
      'index.js': "require('./opaque.js');\n",
      'opaque.js': "const target = 'optional-load'; require(target);\n",
    });
    const invalid = [{ ...vetted[0], importerFiles: [] }];
    assertConfigurationViolation(root, invalid, 'importerFiles must not be empty',
      'fail-closed configuration fixture did not report its configuration error');
    assertBoundaryViolation(root, invalid, (violation) =>
      violation.syntax === 'external-package non-literal require-style access'
        && violation.target.endsWith('vetted-probe/opaque.js'),
    'an invalid manifest entry still applied its opaqueFiles grant');
    assertBoundaryViolation(root, invalid, (violation) =>
      violation.syntax.startsWith('vetted package unreachable from entry'),
    'an invalid manifest entry still applied its reachableFrom grant');
  });
}

function runDirectImporterFixtures() {
  for (const [file, specifier, violationClass, message] of [
    ['src/browser/session.ts', 'playwright', 'vetted package importer file',
      'session.ts -> playwright importer mutant passed'],
    ['src/browser/session.ts', 'playwright-core', 'vetted package importer file',
      'session.ts -> playwright-core importer mutant passed'],
    ['src/browser/playwright.ts', 'playwright-core', 'vetted package direct import forbidden',
      'playwright.ts -> playwright-core direct-package mutant passed'],
    ['src/core/fillService.ts', 'playwright', 'vetted package importer file',
      'fillService.ts -> playwright importer mutant passed'],
    ['src/core/x.ts', 'playwright', 'vetted package importer file',
      'src/core/x.ts -> playwright importer mutant passed'],
    ['src/supervisor/marker.ts', 'playwright', 'vetted package importer file',
      'unreachable supervisor -> playwright importer mutant passed'],
    ['testbed/runner.ts', 'playwright', 'vetted package importer file',
      'testbed/runner.ts -> playwright importer mutant passed'],
    ['src/browser/session.test.ts', 'playwright', 'vetted package importer file',
      'test file -> playwright importer mutant passed'],
    ['src/browser/playwright-types.d.ts', 'playwright-core', 'vetted package importer file',
      'declaration file -> playwright-core importer mutant passed'],
  ]) {
    withFixture('export const safe = true;', (root) => {
      write(root, file, `import '${specifier}';\n`);
      assertBoundaryViolation(root, undefined, (violation) =>
        violation.entry.endsWith(file) && violation.syntax.startsWith(violationClass), message);
      write(root, file, file === 'src/browser/playwright.ts'
        ? "import 'playwright';\n"
        : file.endsWith('.d.ts')
          ? 'export declare const clean: boolean;\n'
          : 'export const clean = true;\n');
      assertPass(root, undefined, `${file} same-file clean mirror was rejected`);
    });
  }
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/browser/playwright.ts', "import 'playwright';\n");
    assertPass(root, undefined, 'single Playwright importer legitimate-traffic control was rejected');
  });
}

function runTypeImportFixtures() {
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/supervisor/host.ts', 'export const host = true;\n');
    write(root, 'src/core/fillService.ts', "import { host } from '../supervisor/host'; void host;\n");
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/core/fillService.ts')
        && violation.target.endsWith('src/supervisor/host.ts'),
    'fillService.ts -> supervisor/host protected-edge mutant passed');
    write(root, 'src/core/fillService.ts', 'export const clean = true;\n');
    assertPass(root, undefined, 'fillService.ts protected-edge same-file clean mirror was rejected');
  });
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/supervisor/lockdownDomain.ts',
      'export type LockdownLifecycle = Readonly<{ clear(): void }>;\n');
    write(root, 'src/browser/session.ts',
      "import type { LockdownLifecycle } from '../supervisor/lockdownDomain';\n"
      + 'export type SessionLockdown = LockdownLifecycle;\n');
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/browser/session.ts')
        && violation.syntax === 'static import',
    'src/browser import-type edge into the supervisor was not classified as a static import');
    write(root, 'src/browser/session.ts', 'export type SessionLockdown = { clear(): void };\n');
    assertPass(root, undefined, 'src/browser import-type same-file clean mirror was rejected');
  });
  withFixture("import type { Browser } from '../browser/playwright'; void (0 as unknown as Browser);",
    (root) => {
      write(root, 'src/browser/playwright.ts', "import 'playwright'; export type Browser = object;\n");
      assertBoundaryViolation(root, undefined, (violation) =>
        violation.entry.endsWith('src/core/probe.ts')
          && violation.syntax.startsWith('vetted package unreachable from entry'),
      'src/core import-type edge reached the Playwright wrapper without an Acceptance L violation');
      write(root, 'src/core/probe.ts', 'export type Browser = object;\n');
      assertPass(root, undefined, 'src/core import-type same-file clean mirror was rejected');
    });
}

function runReachabilityFixtures() {
  withFixture("import '../browser/controlResults';", (root) => {
    write(root, 'src/browser/controlResults.ts', 'export const control = true;\n');
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/core/probe.ts')
        && violation.target.endsWith('src/browser/controlResults.ts')
        && violation.syntax === 'data-plane-to-browser static import',
    'driver-free src/core -> src/browser zone edge passed');
  });
  withFixture('export const core = true;', (root) => {
    write(root, 'src/browser/controlResults.ts', "import { core } from '../core/probe'; void core;\n");
    assertPass(root, undefined, 'reverse src/browser -> src/core zone edge was rejected');
  });
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

function runProductionWalkFixtures() {
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/core/evil.mjs', "import '../supervisor/marker.ts';\n");
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/core/evil.mjs') && violation.syntax === 'static import',
    'orphan src/core .mjs protected import escaped the production filesystem walk');
    write(root, 'src/core/evil.mjs', 'export const clean = true;\n');
    assertPass(root, undefined, 'clean orphan src/core .mjs control was rejected');
  });
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/supervisor/host.ts', 'export const host = true;\n');
    write(root, 'rogue/evil.mjs', "import '../src/supervisor/host.ts';\n");
    fs.symlinkSync('../../rogue', path.join(root, 'src/core/alias'), 'dir');
    assertConfigurationViolation(root, undefined, 'source directory symlink is forbidden: src/core/alias',
      'rogue .mjs directory symlink escaped the production filesystem walk');
  });
  withFixture('export const safe = true;', (root) => {
    write(root, 'rogue-tests/escape.test.ts', "import '../src/supervisor/host.ts';\n");
    write(root, 'src/supervisor/host.ts', 'export const host = true;\n');
    fs.symlinkSync('../rogue-tests', path.join(root, 'testbed/linked-tests'), 'dir');
    assertConfigurationViolation(root, undefined, 'source directory symlink is forbidden: testbed/linked-tests',
      'symlinked test directory escaped the all-source importer scan');
  });
}

function runZoneIdentityFixtures() {
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/browser/playwright.ts', "import 'playwright';\n");
    fs.symlinkSync('../browser/playwright.ts', path.join(root, 'src/core/x.ts'));
    assertConfigurationViolation(root, undefined, 'source file resolves across zones',
      'src/core alias into src/browser did not produce a zone configuration violation');
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/core/x.ts')
        && violation.syntax.startsWith('vetted package importer file'),
    'src/core alias into the Playwright wrapper inherited the real path importer grant');
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.syntax.startsWith('vetted package unreachable from entry'),
    'src/core alias into the Playwright wrapper inherited the real path reachability grant');
  });
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/browser/playwright.ts', "import 'playwright';\n");
    fs.symlinkSync('./playwright.ts', path.join(root, 'src/browser/session.ts'));
    assertBoundaryViolation(root, undefined, (violation) =>
      violation.entry.endsWith('src/browser/session.ts')
        && violation.syntax.startsWith('vetted package importer file'),
    'src/browser alias inherited playwright.ts importer-file identity');
  });
  withFixture('export const safe = true;', (root) => {
    write(root, 'src/core/core-real.ts', 'export const clean = true;\n');
    fs.unlinkSync(path.join(root, 'src/browser/playwright.ts'));
    fs.symlinkSync('../core/core-real.ts', path.join(root, 'src/browser/playwright.ts'));
    assertConfigurationViolation(root, undefined, 'source file resolves across zones',
      'C2 reverse browser-link to core-real symlink escaped cross-zone classification');
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
  withVettedProbe((root, vetted) => {
    writeVettedProbe(root, { 'index.js': cleanModule(), 'opaque.js': cleanModule() });
    write(root, 'outside/different-tail.js', cleanModule());
    fs.unlinkSync(path.join(root, 'node_modules/vetted-probe/opaque.js'));
    fs.symlinkSync(
      path.join(root, 'outside/different-tail.js'),
      path.join(root, 'node_modules/vetted-probe/opaque.js'),
    );
    assertConfigurationViolation(
      root,
      vetted,
      'opaqueFiles path is missing or has the wrong realpath suffix',
      'opaqueFiles realpath-suffix guard mutant accepted a differently named symlink target',
    );
  });
}

function runSymlinkedNodeModulesFixture() {
  withTemporaryRoot((root) => {
    writeConfig(root);
    write(root, 'src/core/probe.ts', 'export const safe = true;\n');
    write(root, 'src/supervisor/marker.ts', 'export const marker = true;\n');
    write(root, 'src/browser/playwright.ts', "import 'playwright';\n");
    write(root, 'testbed/control.ts', 'export const clean = true;\n');
    fs.symlinkSync(path.join(projectRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    write(root, 'package-lock.json', JSON.stringify(projectLock));

    fs.mkdirSync(path.join(root, 'src/adapters/mcp'), { recursive: true });
    assertPass(root, undefined, 'gate rejected a root whose node_modules is a directory symlink');
    assertCliStatus(root, 0, 'real gate CLI rejected a root with symlinked node_modules');

    const unvetted = boundaryResult(root, []);
    const formatted = formatViolations(root, unvetted.violations);
    for (const suffix of [
      'node_modules/playwright-core/lib/coreBundle.js',
      'node_modules/playwright-core/lib/utilsBundle.js',
      'node_modules/playwright-core/lib/bootstrap.js',
    ]) {
      assert.equal(formatted.some((violation) => violation.includes(suffix)), true,
        `formatted symlinked-node_modules violations omitted ${suffix}`);
      assert.equal(formatted.some((violation) => violation.includes(`../${suffix}`)), false,
        `formatted symlinked-node_modules violation escaped the root for ${suffix}`);
    }
  });
}

function runRealGraphFixture() {
  const realResult = checkDependencyBoundary(projectRoot);
  assert.deepEqual(realResult.violations, [], 'real M4 tree failed with the built-in vetted manifest');
  const unvettedResult = checkDependencyBoundary(projectRoot, { vetted: [] });
  assert.notEqual(unvettedResult.violations.length, 0,
    'empty-manifest mutant passed on the real Playwright graph');
  const expectedSuffixes = [
    'node_modules/playwright-core/lib/coreBundle.js',
    'node_modules/playwright-core/lib/utilsBundle.js',
    'node_modules/playwright-core/lib/bootstrap.js',
  ].sort();
  const matchingTargets = unvettedResult.violations.filter((violation) =>
    expectedSuffixes.some((suffix) => realpathEndsWith(violation.target, suffix)));
  assert.deepEqual(
    [...new Set(matchingTargets.map((violation) => expectedSuffixes.find((suffix) =>
      realpathEndsWith(violation.target, suffix))))].sort(),
    expectedSuffixes,
    'empty-manifest real-graph failure did not name exactly the three opaque importers',
  );
  assert.equal(matchingTargets.length, unvettedResult.violations.length,
    'empty-manifest real-graph failure named an unexpected target');
}
