// Standalone defence in depth. The runtime interceptor, capability map and execution proof catch
// Docker reach from code modules reachable from make test (source/tests, spawn sites, plain-node gates).
// Entry-point files are the reviewed root of trust, hash-pinned in-suite. Hostile root edits are
// outside the locked threat model (page content and the evaluated model do not edit the repository).
// No static gate is complete: this does not follow runtime specifiers outside scanned directories,
// see process.getBuiltinModule, or provide containment. The runtime interceptor is the primary guard.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Exact repo-relative path -> exact capability specifiers, never a directory exemption.
export const DOCKER_CAPABILITY_ALLOWLIST = Object.freeze({
  'testbed/evalEntry.test.ts': ['node:child_process'],
  'testbed/checkers/offline.retention.test.ts': ['node:child_process'],
  'testbed/docker/exec.ts': ['node:child_process'],
  'testbed/docker/no-docker.setup.ts': ['node:child_process', 'node:net'],
  'testbed/docker/exec.test.ts': ['node:child_process', 'node:http', 'node:net'],
  'testbed/docker/container/fixture.test.ts': ['node:net'],
  'testbed/docker/container/main.ts': ['node:net'],
  'testbed/docker/container/control.ts': ['node:net', 'node:http'],
  'testbed/docker/container/bridge.ts': ['node:net', 'node:process'],
  'testbed/docker/container/stdoutTripwire.test.ts': ['node:process'],
  'testbed/docker/composed.docker.test.ts': ['node:child_process'],
  'scripts/claude-review.mjs': ['node:child_process'],
  'scripts/claude-review.test.mjs': ['node:child_process'],
  'scripts/check-acceptance-j-results.mjs': ['node:child_process'],
  'scripts/dependency-boundary.selftest-fixtures.mjs': ['node:child_process'],
  'scripts/dependency-boundary.selftest.mjs': ['node:child_process'],
  'scripts/docker-invocation.selftest.mjs': ['node:child_process'],
  'scripts/check-docker-invocation.mjs': ['node:process'],
  'scripts/check-dependency-boundary.mjs': ['node:process'],
  'src/browser/playwright.test.ts': ['node:child_process'],
  'src/browser/controls.browser.test.ts': ['node:http'],
  'testbed/parity/observe.browser.test.ts': ['node:http'],
  'testbed/parity/claims.browser.test.ts': ['node:http'],
  'testbed/runner.finalization.browser.test.ts': ['node:http', 'node:net'],
  'testbed/sourceInventory.ts': ['node:child_process'],
  'testbed/fixtures/controls-lab/index.test.ts': ['node:http'],
  'testbed/fixtures/controls-lab/index.ts': ['node:http'],
  'testbed/fixtures/shared/bindServer.test.ts': ['node:net'],
  'testbed/fixtures/shared/bindServer.ts': ['node:net'],
  'testbed/fixtures/shared/loginFixture.ts': ['node:http'],
  'testbed/fixtures/shared/loginFixture.lifecycle.test.ts': ['node:http', 'node:net'],
  'testbed/fixtures/shared/loginFixture.limits.test.ts': ['node:net'],
  'testbed/fixtures/lookalike-origin/index.ts': ['node:http'],
});
for (const list of Object.values(DOCKER_CAPABILITY_ALLOWLIST)) Object.freeze(list);
export const CAPABILITY_RULES = Object.freeze(['capability-import', 'computed-import', 'spawn-import-shape',
  'spawn-reference', 'spawn-executable', 'spawn-options', 'spawn-argv', 'spawn-call-count', 'source-syntax', 'source-symlink', 'source-empty']);
const capabilities = new Set(['child_process', 'net', 'http', 'https', 'tls', 'http2', 'process']);
const skipped = new Set(['node_modules', 'dist', 'artifacts', '.git']);
function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('source-symlink');
    if (entry.isDirectory()) files.push(...walk(target));
    else if (/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) files.push(target);
  }
  return files.sort();
}
function specifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return { value: node.moduleSpecifier };
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return { value: node.moduleReference.expression, computed: true };
  }
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')
    || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'require')) {
    return { value: node.arguments[0], computed: true };
  }
  return undefined;
}
// These two profiles describe the reviewed syntax, not a general subprocess permission.
// execFileSync defaults to shell:false; spawn must spell it explicitly. Option keys are
// closed to prevent inherited shell values, spreads, accessors and later overrides.
const reviewProfiles = {
  'scripts/claude-review.mjs': {
    execFileSync: { executable: 'git', options: ['encoding', 'maxBuffer', 'stdio'] },
    spawn: { executable: 'claude', options: ['cwd', 'shell', 'detached', 'stdio'] },
  },
  'scripts/claude-review.test.mjs': {
    execFileSync: { executable: 'git', options: ['stdio', 'encoding', 'shell'] },
    spawn: { executable: 'node', options: ['env', 'stdio', 'shell'] },
  },
};
function scriptBinding(node, bindings, add, profile) {
  const clause = ts.isImportDeclaration(node) && node.importClause;
  const named = clause?.namedBindings;
  const expected = profile ? Object.keys(profile) : ['spawnSync'];
  if (!clause || clause.name || clause.isTypeOnly || !named || !ts.isNamedImports(named)
    || named.elements.length !== expected.length
    || (profile ? expected.some((name) => named.elements.filter((e) => !e.propertyName
      && !e.isTypeOnly && e.name.text === name).length !== 1)
      : (named.elements[0].propertyName ?? named.elements[0].name).text !== 'spawnSync')) {
    add(node, 'spawn-import-shape'); return;
  }
  for (const element of named.elements) {
    if (profile && bindings.has(element.name.text)) add(element, 'spawn-import-shape');
    bindings.set(element.name.text, element.name);
  }
}
function pinOptions(call, pin, add) {
  const options = call.arguments[2];
  if (call.arguments.length !== 3 || !options || !ts.isObjectLiteralExpression(options)) {
    add(call, 'spawn-options'); return;
  }
  const keys = new Set();
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)
      || keys.has(property.name.text) || (!pin.options.includes(property.name.text) && property.name.text !== 'shell')
      || (property.name.text === 'shell' && property.initializer.kind !== ts.SyntaxKind.FalseKeyword)) {
      add(property, 'spawn-options'); return;
    }
    keys.add(property.name.text);
  }
  if (pin.options.some((key) => !keys.has(key))) add(options, 'spawn-options');
}
// Node promotes a non-array argv value to options, discarding the checked third slot.
// Exact executable/argv/options shapes and arity reject call-level spreads. Inner array
// spreads remain valid and always construct an array before the subprocess API runs.
function pinArgv(call, add) {
  const argv = call.arguments[1];
  if (!argv || !ts.isArrayLiteralExpression(argv)) add(call, 'spawn-argv');
}
function pinReferences(source, bindings, add, profile) {
  const counts = new Map();
  function visit(node) {
    if (ts.isIdentifier(node) && bindings.has(node.text) && bindings.get(node.text) !== node) {
      const call = node.parent;
      if (!ts.isCallExpression(call) || call.expression !== node || (profile && call.questionDotToken)) {
        add(node, 'spawn-reference');
      } else {
        counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
        const first = call.arguments[0]; const pin = profile?.[node.text];
        const allowed = pin && pin.executable !== 'node'
          ? first && ts.isStringLiteral(first) && first.text === pin.executable
          : first && ts.isPropertyAccessExpression(first) && ts.isIdentifier(first.expression)
            && first.expression.text === 'process' && first.name.text === 'execPath' && !first.questionDotToken;
        if (!allowed) add(node, 'spawn-executable');
        if (pin) pinOptions(call, pin, add);
        if (pin) pinArgv(call, add);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (profile && Object.keys(profile).some((name) => counts.get(name) !== 1)) add(source, 'spawn-call-count');
}
export function inspectSource(text, relative) {
  const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true);
  const violations = []; const bindings = new Map();
  const profile = reviewProfiles[relative];
  const add = (node, code, spec = code) => violations.push({ file: relative,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, specifier: spec, code });
  if (source.parseDiagnostics.length) add(source, 'source-syntax');
  function visit(node) {
    const load = specifier(node);
    if (load?.computed && (!load.value || !ts.isStringLiteral(load.value))) add(node, 'computed-import');
    if (load?.value && ts.isStringLiteral(load.value) && capabilities.has(load.value.text.replace(/^node:/, ''))) {
      const spec = load.value.text;
      if (!(DOCKER_CAPABILITY_ALLOWLIST[relative] ?? []).includes(spec)) add(node, 'capability-import', spec);
      else if (relative.startsWith('scripts/') && spec === 'node:child_process') scriptBinding(node, bindings, add, profile);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  pinReferences(source, bindings, add, profile);
  return violations;
}
export function checkDockerInvocation(root) {
  const absoluteRoot = path.resolve(root); const files = walk(absoluteRoot);
  if (files.length === 0) throw new Error('source-empty');
  return files.flatMap((file) => inspectSource(fs.readFileSync(file, 'utf8'), path.relative(absoluteRoot, file).split(path.sep).join('/')));
}
