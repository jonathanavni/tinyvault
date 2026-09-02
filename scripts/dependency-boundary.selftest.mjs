#!/usr/bin/env node
// Executed explicitly by make test; the non-.test name keeps Vitest from treating it as a suite.
// This matrix regression-tests the gate's use of Node's resolvers; a finite fixture set does not prove
// that a hand-written resolver would be Node-compatible. The script and every spawned gate CLI run with
// --experimental-import-meta-resolve so import.meta.resolve honors its parent URL.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FLAG_ERROR = 'dependency gate requires --experimental-import-meta-resolve';
const flagProbe = import.meta.resolve(
  './probe.mjs',
  'file:///tinyvault-flag-probe/parent.mjs',
);
if (!flagProbe.startsWith('file:///tinyvault-flag-probe/')) throw new Error(FLAG_ERROR);

const {
  checkDependencyBoundary,
  VETTED_EXTERNAL_PACKAGES,
} = await import('./dependency-boundary.mjs');
const {
  assertCliStatus,
  assertEdgeOutcomes,
  assertViolation,
  cleanModule,
  configureFixtureHarness,
  getRuntimeMatrixOutcomes,
  installDefaultVettedConfiguration,
  linkInstalledPackage,
  protectedImport,
  protectedRequire,
  runM4Fixtures,
  withFixture,
  withRuntimeFixture,
  withTemporaryRoot,
  write,
  writeConfig,
  writePackage,
  writeRuntimePackage,
} = await import('./dependency-boundary.selftest-fixtures.mjs');

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const cli = path.join(scriptDirectory, 'check-dependency-boundary.mjs');
const selftest = fileURLToPath(import.meta.url);
const projectLock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));

configureFixtureHarness({ cli, projectLock, projectRoot });

assert.deepEqual(VETTED_EXTERNAL_PACKAGES, [
  {
    packages: ['playwright', 'playwright-core'],
    version: '1.62.1',
    importerFiles: ['src/browser/playwright.ts'],
    directImportOnly: ['playwright'],
    reachableFrom: ['src/browser', 'testbed'],
    opaqueFiles: [
      'playwright-core/lib/coreBundle.js',
      'playwright-core/lib/utilsBundle.js',
    ],
    reason: 'browser driver; the two bundles carry non-literal and optional loads; the plaintext is handed to it by design',
  },
], 'the shipped vetted-package manifest changed without updating its policy regression');

{
  const result = spawnSync(process.execPath, [selftest], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(result.status, 0, 'dependency-boundary selftest ran without the required flag');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(FLAG_ERROR),
    'unflagged dependency-boundary selftest did not report the fixed flag requirement');
}

const directCases = [
  ['static import', "import '../supervisor/evaluator';"],
  ['re-export', "export { evaluate } from '../supervisor/evaluator';"],
  ['dynamic import()', "export const load = () => import('../supervisor/evaluator');"],
  ['require-style access', "const evaluator = require('../supervisor/evaluator'); void evaluator;"],
  ['module.require-style access', "const evaluator = module.require('../supervisor/evaluator'); void evaluator;"],
  ['import = require()', "import evaluator = require('../supervisor/evaluator'); void evaluator;"],
  ['detector protected-directory arm', "import '../supervisor/tripwire';"],
  ['data-plane secret matcher import', "import '../supervisor/secretMatcher';"],
];

for (const [name, source] of directCases) {
  withFixture(source, (root) => {
    assertViolation(root, name);
    assertCliStatus(root, 1, `${name} mutation did not fail the real dependency-gate CLI`);
  });
}

withFixture("import '@sup/evaluator';", (root) => {
  assertCliStatus(root, 1,
    'non-relative tsconfig paths alias silently disarmed the real dependency-gate CLI');
  assertViolation(root, 'non-relative tsconfig paths alias');
}, {
  baseUrl: '.',
  paths: { '@sup/*': ['src/supervisor/*'] },
});

withFixture("import { match } from '@relay/relay'; void match;", (root) => {
  write(root, 'lib/relay.ts',
    "export { match } from '../src/supervisor/secretMatcher';\n");
  assertCliStatus(root, 1,
    'unscanned tsconfig paths relay silently disarmed the real dependency-gate CLI');
}, {
  baseUrl: '.',
  paths: { '@relay/*': ['lib/*'] },
});

withFixture("import { match } from 'probe-relay'; void match;", (root) => {
  write(root, 'node_modules/probe-relay/package.json', JSON.stringify({
    name: 'probe-relay',
    version: '1.0.0',
    type: 'module',
    exports: './index.ts',
  }));
  write(root, 'node_modules/probe-relay/index.ts',
    "export { match } from '../../src/supervisor/secretMatcher';\n");
  assertCliStatus(root, 1,
    'node_modules relay silently disarmed the real dependency-gate CLI');
});

withFixture("import { match } from 'relay-a'; void match;", (root) => {
  writePackage(root, 'relay-a', "export { match } from 'relay-b';\n");
  writePackage(root, 'relay-b',
    "export { match } from '../../src/supervisor/secretMatcher';\n");
  assertCliStatus(root, 1,
    'package-chain bypass did not fail the real dependency-gate CLI');
});

withFixture("import { go } from 'relay-a'; void go;", (root) => {
  writePackage(root, 'relay-a',
    "const target = '../../src/supervisor/secretMatcher'; export const go = () => import(target);\n");
  assertCliStatus(root, 1,
    'computed import inside external package did not fail the real dependency-gate CLI');
});

withFixture("import { go } from 'relay-a'; void go;", (root) => {
  writePackage(root, 'relay-a',
    "const load = require; export const go = () => load('../../src/supervisor/secretMatcher');\n");
  assertCliStatus(root, 1,
    'aliased require inside external package did not fail the real dependency-gate CLI');
});

withFixture("import { go } from 'relay-a'; void go;", (root) => {
  writePackage(root, 'relay-a',
    "import { createRequire } from 'node:module'; export const go = createRequire(import.meta.url);\n");
  assertCliStatus(root, 1,
    'createRequire inside external package did not fail the real dependency-gate CLI');
});

withFixture("import { a } from 'relay-a'; void a;", (root) => {
  writePackage(root, 'relay-a', "export { b as a } from 'relay-b';\n");
  writePackage(root, 'relay-b', "export { a as b } from 'relay-a';\n");
  assertCliStatus(root, 0,
    'external package cycle did not terminate cleanly in the real dependency-gate CLI');
});

withFixture(
  "import { readFile } from 'node:fs'; import { safe } from 'clean-package'; void readFile; void safe;",
  (root) => {
    write(root, 'node_modules/clean-package/package.json', JSON.stringify({
      name: 'clean-package',
      version: '1.0.0',
      type: 'module',
      exports: './index.ts',
    }));
    write(root, 'node_modules/clean-package/index.ts', "export const safe = true;\n");
    assertCliStatus(root, 0,
      'existing legitimate third-party control did not pass the real dependency-gate CLI');
  },
);

const unsupportedCases = [
  ['computed dynamic import', "const target = '../supervisor/evaluator'; void import(target);"],
  ['aliased require', "const load = require; void load('../supervisor/evaluator');"],
  [
    'createRequire',
    "import { createRequire } from 'node:module'; void createRequire(import.meta.url)('../supervisor/evaluator');",
  ],
  [
    'dynamic node:module loader to playwright-core',
    "const mod = await import('node:module'); mod.createRequire(import.meta.url)('playwright-core');",
  ],
  [
    'dynamic module loader to protected target',
    "const mod = await import('module'); mod.createRequire(import.meta.url)('../supervisor/evaluator');",
  ],
];

for (const [name, source] of unsupportedCases) {
  withFixture(source, (root) => {
    assertViolation(root, name);
    assertCliStatus(root, 1, `${name} mutation did not fail the real dependency-gate CLI`);
  });
}

withFixture("export { helper } from './helper';", (root) => {
  write(root, 'src/core/helper.ts', "export { evaluate as helper } from '../supervisor/evaluator';\n");
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) => violation.path.length === 3), true,
    'transitive dependency mutation did not report probe -> helper -> evaluator');
  assertCliStatus(root, 1, 'transitive dependency mutation did not fail the real CLI');
});

withFixture("import { relay } from '../../testbed/relay'; void relay;", (root) => {
  write(root, 'testbed/relay.ts', "export { evaluate as relay } from '../src/supervisor/evaluator';\n");
  assertViolation(root, 'outside-src laundering');
  assertCliStatus(root, 1, 'outside-src laundering did not fail the real CLI');
});

withFixture("import './missing-relative-module';", (root) => {
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.syntax.startsWith('unresolved relative')), true,
  'unresolved relative import was silently dropped');
  assertCliStatus(root, 1, 'unresolved relative import did not fail the real CLI');
});

withFixture("import 'missing-external-package';", (root) => {
  assertCliStatus(root, 1, 'unresolved external package did not fail the real CLI');
});

withFixture("export const safe = 'data-plane only';", (root) => {
  const result = checkDependencyBoundary(root);
  assert.equal(result.files > 0, true, 'clean fixture scanned zero files');
  assert.equal(result.roots > 0, true, 'clean fixture scanned zero data-plane roots');
  assert.deepEqual(result.violations, [], 'clean data-plane graph was rejected');
  assertCliStatus(root, 0, 'clean graph did not pass the real dependency-gate CLI');
});

withTemporaryRoot((root) => {
  assertCliStatus(root, 1, 'wrong/empty --root silently disarmed the real dependency-gate CLI');
});

withTemporaryRoot((root) => {
  writeConfig(root);
  installDefaultVettedConfiguration(root);
  write(root, 'src/core/probe.ts', "export const safe = true;\n");
  assertCliStatus(root, 1, 'missing protected directory silently disarmed the real CLI');
});

withFixture("export const safe = 'flag control';", (root) => {
  const result = spawnSync(process.execPath, [cli, '--root', root], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(result.status, 0, 'gate CLI ran without --experimental-import-meta-resolve');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(FLAG_ERROR),
    'unflagged gate CLI did not report the fixed flag requirement');
  assertCliStatus(root, 0, 'flagged gate CLI did not run its legitimate-traffic control');
});

// A2 laundering and entry-root mutation: a data-plane entry gets no package tolerance through scripts/.
withFixture("import '../../scripts/bridge.mjs';", (root) => {
  write(root, 'scripts/bridge.mjs', "import 'launder-package';\n");
  writeRuntimePackage(root, 'launder-package', { main: './index.js' }, {
    'index.js': `const target = 'optional-load'; require(target);\n${protectedRequire()}`,
  });
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.syntax.startsWith('production-to-tooling')), true,
  'production module import of scripts/ was not rejected');
  assert.equal(result.violations.some((violation) =>
    violation.path.some((file) => file.endsWith('src/supervisor/marker.ts'))), true,
  'laundering traversal did not independently reach the protected module');
  assert.equal(result.violations.some((violation) =>
    violation.entry.endsWith('src/core/probe.ts')
      && violation.syntax === 'external-package non-literal require-style access'), true,
  'laundering package tolerance was keyed to the importer instead of the data-plane entry root');
  assertCliStatus(root, 1, 'src -> scripts -> package -> protected laundering passed the CLI');
});

// A2 direct control: data-plane-rooted external packages tolerate no protected or unsupported path.
withFixture("import 'direct-protected-package';", (root) => {
  writeRuntimePackage(root, 'direct-protected-package', { main: './index.js' }, {
    'index.js': protectedRequire(),
  });
  assertCliStatus(root, 1, 'src -> package -> protected direct control passed the CLI');
});

// A2 security fixture B: script-root tolerance must never tolerate a protected reach.
withFixture("export const safe = true;", (root) => {
  write(root, 'scripts/tool.mjs', "import 'script-protected-package';\n");
  writeRuntimePackage(root, 'script-protected-package', { main: './index.js' }, {
    'index.js': protectedRequire(),
  });
  assertCliStatus(root, 1, 'scripts -> package -> protected was mistaken for toolchain tolerance');
});

// R2-10: tolerating one unsupported package load must not skip a later literal protected edge.
withFixture("export const safe = true;", (root) => {
  write(root, 'scripts/tool.mjs', "import 'mixed-script-package';\n");
  writeRuntimePackage(root, 'mixed-script-package', { main: './index.js' }, {
    'index.js': `const target = 'optional-load'; require(target);\n${protectedRequire()}`,
  });
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.path.some((file) => file.endsWith('src/supervisor/marker.ts'))), true,
  'tolerated package issue skipped the package\'s literal protected edge');
  assertCliStatus(root, 1, 'mixed tolerated/protected scripts package passed the CLI');
});

// R2-3/R2-9: unresolved package loads are tolerated only for scripts-rooted toolchain traversal.
withFixture("export const safe = true;", (root) => {
  write(root, 'scripts/tool.mjs', "import 'unresolved-script-package';\n");
  writeRuntimePackage(root, 'unresolved-script-package', { main: './index.js' }, {
    'index.js': "require('missing-optional-package');\n",
  });
  assertCliStatus(root, 0, 'scripts-rooted unresolved external-package load was not tolerated');
});
withFixture("import 'unresolved-data-package';", (root) => {
  writeRuntimePackage(root, 'unresolved-data-package', { main: './index.js' }, {
    'index.js': "require('missing-optional-package');\n",
  });
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.syntax.startsWith('external-package unresolved')), true,
  'data-plane unresolved external-package load received scripts-rooted tolerance');
  assertCliStatus(root, 1, 'data-plane unresolved external-package load passed the CLI');
});

// R2-6: production-to-tooling is a BFS rule, so package-mediated reaches are rejected too.
withFixture("import 'tooling-relay-package';", (root) => {
  write(root, 'scripts/tool.mjs', 'export const clean = true;\n');
  writeRuntimePackage(root, 'tooling-relay-package', { main: './index.js' }, {
    'index.js': "require('../../scripts/tool.mjs');\n",
  });
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.syntax.startsWith('production-to-tooling')
      && violation.target.endsWith('scripts/tool.mjs')), true,
  'indirect production -> package -> scripts edge was not classified as production-to-tooling');
  assertCliStatus(root, 1, 'indirect production-to-tooling reach passed the CLI');
});

// R2-8: a path segment named node_modules inside scripts/ is in-repo, not an external package.
withFixture("export const safe = true;", (root) => {
  write(root, 'scripts/tool.mjs', "import './node_modules/helper.mjs';\n");
  write(root, 'scripts/node_modules/helper.mjs',
    "const target = './clean.mjs'; export const load = () => import(target);\n");
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.entry.endsWith('scripts/node_modules/helper.mjs')
      && violation.syntax === 'non-literal dynamic import()'), true,
  'in-repo scripts/node_modules unsupported load was mistaken for external-package tolerance');
  assertCliStatus(root, 1, 'in-repo scripts/node_modules unsupported load passed the CLI');
});

// R2-10: relative targets outside the configured scan are reported exactly as unscanned.
withFixture("import '../../outside/helper.ts';", (root) => {
  write(root, 'outside/helper.ts', 'export const outside = true;\n');
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.syntax === 'unscanned static import'
      && violation.target.endsWith('outside/helper.ts')), true,
  'reachable data-plane target outside tsconfig include was not reported as unscanned');
  assertCliStatus(root, 1, 'unscanned data-plane relative target passed the CLI');
});

// A2 scoped-tolerance mutation: removing scripts-root-only tolerance makes real TypeScript flip to FAIL.
withFixture("export const safe = true;", (root) => {
  write(root, 'scripts/tool.mjs', "import ts from 'typescript'; void ts;\n");
  linkInstalledPackage(root, 'typescript');
  assertCliStatus(root, 0, 'scripts-rooted real TypeScript toolchain did not receive scoped tolerance');
});

// A2 legitimate traffic: a real data-plane runtime package must be fully traversed and pass.
withFixture("import sodium from 'libsodium-wrappers'; void sodium;", (root) => {
  linkInstalledPackage(root, 'libsodium-wrappers');
  assertCliStatus(root, 0, 'real libsodium-wrappers data-plane traversal did not pass');
});

// B3 edge-side realpath mutation: resolving an alias edge without realpath hides its protected target.
withFixture("import './alias';", (root) => {
  fs.symlinkSync('../supervisor/marker.ts', path.join(root, 'src/core/alias.ts'));
  assertCliStatus(root, 1, 'in-repo symlink alias into src/supervisor passed the gate');
});

// B3 legitimate control: canonicalizing an alias must not reject a clean real target.
withFixture("import './alias';", (root) => {
  write(root, 'src/core/clean.ts', 'export const clean = true;\n');
  fs.symlinkSync('./clean.ts', path.join(root, 'src/core/alias.ts'));
  assertCliStatus(root, 0, 'in-repo symlink alias to a clean module was rejected');
});

// R2-1: protection is the union of a configured link location and its outward real target.
withFixture("import '../supervisor/evil';", (root) => {
  write(root, 'outside/evil.ts', 'export const evil = true;\n');
  fs.symlinkSync('../../outside/evil.ts', path.join(root, 'src/supervisor/evil.ts'));
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.target.endsWith('outside/evil.ts')), true,
  'protected symlink location pointing outward lost its protected classification');
  assertCliStatus(root, 1, 'protected alias-out edge passed the CLI');
});

// R2-1 control: neither a clean alias path nor its clean outward real target is protected.
withFixture("import './alias';", (root) => {
  write(root, 'outside/clean.ts', 'export const clean = true;\n');
  fs.symlinkSync('../../outside/clean.ts', path.join(root, 'src/core/alias.ts'));
  assertCliStatus(root, 0, 'clean alias-out edge was rejected');
});

// R2-7: canonicalizing the configured file selects tools/helper; reverting canonicalFile still fails
// closed earlier as an unresolved/unscanned relative alias edge, so this redundancy is intentional.
withFixture("import './alias';", (root) => {
  write(root, 'src/core/helper.ts', 'export const clean = true;\n');
  write(root, 'tools/real.ts', "export { helper } from './helper.ts';\n");
  write(root, 'tools/helper.ts',
    "export { marker as helper } from '../src/supervisor/marker.ts';\n");
  fs.symlinkSync('../../tools/real.ts', path.join(root, 'src/core/alias.ts'));
  assertCliStatus(root, 1, 'configured-file canonicalization control did not fail closed');
});

// Fixture 1 kills the declaration-file traversal mutant: runtime `main`, not `types`, reaches protected.
for (const protectedBranch of [true, false]) {
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, 'matrix-typed', {
      types: './index.d.ts',
      main: './index.js',
    }, {
      'index.d.ts': 'export declare const value: boolean;\n',
      'index.js': protectedBranch ? protectedRequire() : cleanModule(),
    });
    assertEdgeOutcomes(root, 'matrix-typed', {
      import: protectedBranch,
      require: protectedBranch,
    }, 'typed package with main');
  });
}

// Fixture 2 kills resolving every conditional export with only one condition set.
for (const importProtected of [true, false]) {
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, 'matrix-conditional', {
      exports: { import: './import.mjs', require: './require.cjs' },
    }, {
      'import.mjs': importProtected ? protectedImport() : cleanModule(),
      'require.cjs': importProtected ? cleanModule() : protectedRequire(),
    });
    assertEdgeOutcomes(root, 'matrix-conditional', {
      import: importProtected,
      require: !importProtected,
    }, 'conditional exports');
  });
}

// Fixture 3 kills resolving only a package root while dropping exported subpaths.
withRuntimeFixture((root) => {
  writeRuntimePackage(root, 'matrix-subpath', {
    exports: { '.': './clean.js', './sub': './protected.js' },
  }, {
    'clean.js': cleanModule(),
    'protected.js': protectedRequire(),
  });
  assertEdgeOutcomes(root, 'matrix-subpath', { import: false, require: false }, 'subpath root control');
  assertEdgeOutcomes(root, 'matrix-subpath/sub', { import: true, require: true }, 'subpath export');
});

// Fixture 4 kills stopping traversal after the first clean typed package.
for (const protectedBranch of [true, false]) {
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, 'matrix-transitive-a', {
      types: './index.d.ts',
      main: './index.js',
    }, {
      'index.d.ts': 'export declare const value: boolean;\n',
      'index.js': "require('matrix-transitive-b');\n",
    });
    writeRuntimePackage(root, 'matrix-transitive-b', {
      types: './index.d.ts',
      main: './index.js',
    }, {
      'index.d.ts': 'export declare const value: boolean;\n',
      'index.js': protectedBranch ? protectedRequire() : cleanModule(),
    });
    assertEdgeOutcomes(root, 'matrix-transitive-a', {
      import: protectedBranch,
      require: protectedBranch,
    }, 'transitive typed package');
  });
}

// Fixture 5 kills an entry-extension allowlist that omits .mjs or .cjs.
for (const [extension, source] of [['mjs', protectedImport()], ['cjs', protectedRequire()]]) {
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, `matrix-${extension}`, { main: `./index.${extension}` }, {
      [`index.${extension}`]: source,
    });
    assertEdgeOutcomes(root, `matrix-${extension}`, { import: true, require: true }, `.${extension} entry`);
  });
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, `matrix-${extension}`, { main: `./index.${extension}` }, {
      [`index.${extension}`]: cleanModule(),
    });
    assertEdgeOutcomes(root, `matrix-${extension}`, { import: false, require: false }, `.${extension} control`);
  });
}

// Fixture 6 kills resolving a package self-reference relative to the gate script or caller.
for (const protectedBranch of [true, false]) {
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, 'matrix-self', {
      type: 'module',
      exports: { '.': './index.mjs', './x': './x.mjs' },
    }, {
      'index.mjs': "import 'matrix-self/x';\n",
      'x.mjs': protectedBranch ? protectedImport() : cleanModule(),
    });
    assertEdgeOutcomes(root, 'matrix-self', {
      import: protectedBranch,
      require: protectedBranch,
    }, 'package self-reference');
  });
}

// Fixture 7 kills scanning a symlink path without following and deduplicating its real package path.
for (const protectedBranch of [true, false]) {
  withRuntimeFixture((root) => {
    const sourceDirectory = path.join(root, 'packages/matrix-linked');
    write(root, 'packages/matrix-linked/package.json', JSON.stringify({
      name: 'matrix-linked', version: '1.0.0', main: './index.js',
    }));
    write(root, 'packages/matrix-linked/index.js', protectedBranch ? protectedRequire() : cleanModule());
    const target = path.join(root, 'node_modules/matrix-linked');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(sourceDirectory, target, 'dir');
    assertEdgeOutcomes(root, 'matrix-linked', {
      import: protectedBranch,
      require: protectedBranch,
    }, 'symlinked package');
  });
}

// Fixture 8 kills consulting `main` when an exports string sugar target exists.
for (const protectedExports of [true, false]) {
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, 'matrix-sugar', {
      main: protectedExports ? './clean.js' : './protected.js',
      exports: protectedExports ? './protected.js' : './clean.js',
    }, {
      'clean.js': cleanModule(),
      'protected.js': protectedRequire(),
    });
    assertEdgeOutcomes(root, 'matrix-sugar', {
      import: protectedExports,
      require: protectedExports,
    }, 'exports string sugar');
  });
}

// Fixture 9 kills treating a missing first file as fallback; only an invalid package target advances.
for (const protectedFallback of [true, false]) {
  withRuntimeFixture((root) => {
    writeRuntimePackage(root, 'matrix-array', {
      exports: ['../outside.js', protectedFallback ? './protected.js' : './clean.js'],
    }, {
      'clean.js': cleanModule(),
      'protected.js': protectedRequire(),
    });
    assertEdgeOutcomes(root, 'matrix-array', {
      import: protectedFallback,
      require: protectedFallback,
    }, 'exports array fallback');
  });
}

// Fixture 10 kills ignoring wildcard subpath substitution.
withRuntimeFixture((root) => {
  writeRuntimePackage(root, 'matrix-wildcard', {
    exports: { '.': './clean.js', './features/*': './src/features/*.js' },
  }, {
    'clean.js': cleanModule(),
    'src/features/clean.js': cleanModule(),
    'src/features/protected.js': "require('../../../../src/supervisor/marker.ts');\n",
  });
  assertEdgeOutcomes(root, 'matrix-wildcard/features/clean', {
    import: false, require: false,
  }, 'wildcard clean match');
  assertEdgeOutcomes(root, 'matrix-wildcard/features/protected', {
    import: true, require: true,
  }, 'wildcard protected match');
});

// Fixture 11 kills condition-priority sorting; Node honors object insertion order.
withRuntimeFixture((root) => {
  writeRuntimePackage(root, 'matrix-order-default', {
    exports: { default: './clean.js', import: './protected.mjs' },
  }, {
    'clean.js': cleanModule(),
    'protected.mjs': protectedImport(),
  });
  assertEdgeOutcomes(root, 'matrix-order-default', {
    import: false, require: false,
  }, 'default-first condition order');
});
withRuntimeFixture((root) => {
  writeRuntimePackage(root, 'matrix-order-import', {
    exports: { import: './protected.mjs', default: './clean.js' },
  }, {
    'clean.js': cleanModule(),
    'protected.mjs': protectedImport(),
  });
  assertEdgeOutcomes(root, 'matrix-order-import', {
    import: true, require: false,
  }, 'import-first condition order');
});

runM4Fixtures();

console.log(
  'dependency boundary mutation tests PASS '
  + '(real CLI exit 1 violations incl. data-plane secret-matcher import; '
  + 'recursive external packages and unsupported loads; exit 0 clean and package cycle; '
  + `runtime resolver matrix: 11 fixtures, ${getRuntimeMatrixOutcomes()} import/require outcomes; `
  + 'M4 vetted/importer/reachability/evaluator/real-graph fixtures)',
);
