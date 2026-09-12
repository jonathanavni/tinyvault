#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { checkDockerInvocation, DOCKER_CAPABILITY_ALLOWLIST, CAPABILITY_RULES, reviewProfiles } from './docker-invocation.mjs';
import { gateCliSelftest } from './gate-cli.selftest.mjs';
const cli = fileURLToPath(new URL('./check-docker-invocation.mjs', import.meta.url));
function withFixture(source, run, relative = 'src/probe.ts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-docker-gate-'));
  try {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source); run(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function assertCli(root, status, command = cli) {
  const result = spawnSync(process.execPath, [command, '--root', root], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error); assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
  assert.match(status ? result.stderr : result.stdout, /docker invocation (?:PASS|FAIL)/);
}
function rejected(source, code, relative = 'src/probe.ts') {
  withFixture(source, (root) => {
    assert.deepEqual(checkDockerInvocation(root).map((v) => v.code), [code]); assertCli(root, 1);
    fs.writeFileSync(path.join(root, relative), 'export const clean = true;');
    assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0);
  }, relative);
}
const mcpPath = 'src/adapters/mcp/server.stdio.test.ts';
const mcpSource = "import { spawn, execFileSync } from 'node:child_process';\n"
  + "spawn(process.execPath, [], { env: {}, stdio: 'pipe', shell: false });\n"
  + "execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8', shell: false });";
const script = 'scripts/check-acceptance-j-results.mjs';
const reviewFiles = ['scripts/claude-review.mjs', 'scripts/claude-review.test.mjs'];
const repo = fileURLToPath(new URL('../', import.meta.url));
const guardMutants = [];
const reviewSources = new Map(reviewFiles.map((file) => [file, fs.readFileSync(path.join(repo, file), 'utf8')]));
const mutants = [
  ['capability-import', "import 'node:child_process';", 'testbed/docker/container/control.ts'],
  ['computed-import', "const cp = await import('node:' + 'child_process');", 'testbed/probe.cts'],
  ['spawn-import-shape', "import cp from 'node:child_process';", script],
  ['spawn-reference', "import {spawnSync} from 'node:child_process'; const escape = spawnSync;", script],
  ['spawn-executable', "import {spawnSync} from 'node:child_process'; spawnSync('docker', []);", script],
  ['source-syntax', 'const =;', 'src/probe.ts'],
];
assert.deepEqual([...mutants.map(([code]) => code), 'spawn-options', 'spawn-argv', 'spawn-call-count', 'source-symlink', 'source-empty'].sort(), [...CAPABILITY_RULES].sort());
for (const [code, source, relative] of mutants) rejected(source, code, relative);
const forms = [(s) => `import '${s}';`, (s) => `export * from '${s}';`, (s) => `const cp = require('${s}');`,
  (s) => `const cp = await import('${s}');`, (s) => `import cp = require('${s}');`];
for (const capability of ['child_process', 'net', 'http', 'https', 'tls', 'http2', 'process']) {
  for (const prefix of ['', 'node:']) for (const form of forms) {
    rejected(form(prefix + capability), 'capability-import');
  }
}
for (const extension of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']) {
  rejected("import 'node:child_process';", 'capability-import', `nested/probe.${extension}`);
}
for (const [relative, specs] of Object.entries(DOCKER_CAPABILITY_ALLOWLIST)) {
  const source = relative === mcpPath ? mcpSource : reviewSources.get(relative) ?? specs.map((spec) => (reviewProfiles[relative] !== undefined || relative.startsWith('scripts/')) && spec === 'node:child_process'
    ? reviewProfiles[relative] !== undefined
      ? "import { spawn } from 'node:child_process'; spawn(process.execPath, [], { env: {}, stdio: 'pipe', shell: false });"
      : "import { spawnSync } from 'node:child_process'; spawnSync(process.execPath, []);" : `import '${spec}';`).join('\n');
  withFixture(source, (root) => { assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0); }, relative);
}
// Job B's two fixture tests receive only their exact socket primitives. The generic
// loop above proves permitted imports; these cases pin both scope and neighboring-path refusal.
const lifecycleTestCapabilities = {
  'testbed/evalEntry.test.ts': ['node:child_process'],
  'testbed/parity/observe.browser.test.ts': ['node:http'],
  'testbed/parity/claims.browser.test.ts': ['node:http'],
  'testbed/fixtures/shared/loginFixture.lifecycle.test.ts': ['node:http', 'node:net'],
  'testbed/fixtures/shared/loginFixture.limits.test.ts': ['node:net'],
};
for (const [relative, allowed] of Object.entries(lifecycleTestCapabilities)) {
  assert.deepEqual(DOCKER_CAPABILITY_ALLOWLIST[relative], allowed);
  for (const specifier of ['node:child_process', 'node:process', 'node:tls', 'node:http']) {
    if (!allowed.includes(specifier)) rejected(`import '${specifier}';`, 'capability-import', relative);
  }
  for (const specifier of allowed) {
    rejected(`import '${specifier}';`, 'capability-import', relative.replace('.test.ts', '.neighbor.test.ts'));
    rejected(`import '${specifier}';`, 'capability-import', relative.replace('.test.ts', '.ts'));
  }
}
for (const relative of Object.keys(DOCKER_CAPABILITY_ALLOWLIST).filter((f) => f.startsWith('scripts/')
  && DOCKER_CAPABILITY_ALLOWLIST[f].includes('node:child_process') && !reviewFiles.includes(f))) {
  rejected("import {spawnSync} from 'node:child_process'; spawnSync('docker', []);", 'spawn-executable', relative);
  for (const arg of ['exe', "process['execPath']", 'process.execPath + ""']) {
    rejected(`import {spawnSync} from 'node:child_process'; spawnSync(${arg}, []);`, 'spawn-executable', relative);
  }
}
// Actual tracked helper sources are the positive controls, independently naming all four
// reviewed sites. Every mutant changes one edge only, then restores that exact source.
function replaceOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, `non-unique mutation anchor: ${needle}`);
  return source.replace(needle, replacement);
}
let reviewMutants = 0;
for (const relative of reviewFiles) {
  const source = reviewSources.get(relative);
  assert.equal((source.match(/execFileSync\(/g) ?? []).length, 1);
  assert.equal((source.match(/spawn\(/g) ?? []).length, 1);
  const production = relative === 'scripts/claude-review.mjs';
  const spawnTarget = production ? "'claude'" : 'process.execPath';
  const rows = [];
  const syntax = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true);
  const sites = new Map();
  function findSites(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && ['spawn', 'execFileSync'].includes(node.expression.text)) sites.set(node.expression.text, node);
    ts.forEachChild(node, findSites);
  }
  findSites(syntax);
  const replaceNode = (node, text) => source.slice(0, node.getStart(syntax)) + text + source.slice(node.end);
  const sensitive = (name, mutant, code, guard) => {
    rows.push([name, mutant, code]); guardMutants.push([relative, mutant, guard]);
  };
  const change = (name, needle, replacement, code) => rows.push([name, replaceOnce(source, needle, replacement), code]);
  for (const [api, target] of [['execFileSync', "'git'"], ['spawn', spawnTarget]]) {
    for (const executable of ["'docker'", "'env'", "'sh'", 'target', "process['execPath']", "'git' + ''"])
      change(`${api} executable ${executable}`, `${api}(${target},`, `${api}(${executable},`, 'spawn-executable');
    const argv = sites.get(api).arguments[1];
    for (const replacement of ['{shell:true}', `...[${argv.getText(syntax)}, {shell:true}]`]) {
      sensitive(`${api} argv overload/spread`, replaceNode(argv, replacement), 'spawn-argv',
        "if (!argv || !ts.isArrayLiteralExpression(argv)) add(call, 'spawn-argv');");
    }
    sensitive(`${api} optional call`, replaceOnce(source, `${api}(${target},`, `${api}?.(${target},`),
      'spawn-reference', '|| (profile && call.questionDotToken)');
    change(`${api} reference`, `${api}(${target},`, `${api}.call(null, ${target},`, 'spawn-reference');
    change(`${api} alias`, `${api}(${target},`, `alias(${target},`, 'spawn-call-count');
    rows.push([`${api} escaped binding`, source + `\nconst escaped = ${api};`, 'spawn-reference']);
    const siteStart = source.indexOf(`${api}(`);
    const site = source.slice(siteStart, source.indexOf(');', siteStart) + 2);
    rows.push([`${api} extra call`, source + `\n${site}`, 'spawn-call-count']);
    guardMutants.push([relative, source + `\n${site}`,
      "if (profile && Object.keys(profile).some((name) => counts.get(name) !== 1)) add(source, 'spawn-call-count');"]);
    guardMutants.push([relative, replaceOnce(source, `${api}(${target},`, `${api}('docker',`),
      "if (!allowed) add(node, 'spawn-executable');"]);
    guardMutants.push([relative, source + `\nconst escaped = ${api};`, "add(node, 'spawn-reference');"]);
    change(`${api} absent call`, `${api}(${target},`, `unused(${target},`, 'spawn-call-count');
  }
  const importLine = source.split('\n').find((line) => line.includes("from 'node:child_process'"));
  for (const replacement of ["import * as cp from 'node:child_process';",
    "import { spawn, execFileSync, exec } from 'node:child_process';",
    "import { spawn as run, execFileSync } from 'node:child_process';",
    "export { spawn, execFileSync } from 'node:child_process';"])
    change('import shape', importLine, replacement, 'spawn-import-shape');
  guardMutants.push([relative, replaceOnce(source, importLine,
    "import { spawn, execFileSync, exec } from 'node:child_process';"),
    '|| named.elements.length !== expected.length']);
  for (const binding of ['spawn', 'execFileSync']) {
    sensitive(`type-only ${binding}`, replaceOnce(source, importLine, importLine.replace(binding, `type ${binding}`)),
      'spawn-import-shape', '&& !e.isTypeOnly');
  }
  change('missing import', importLine, '', 'spawn-call-count');
  rows.push(['duplicate import', source + `\n${importLine}`, 'spawn-import-shape']);
  // Anchor each actual options object separately; nested env/argv spreads remain valid.
  const optionAnchors = production
    ? ["encoding: 'utf8', maxBuffer", 'cwd: repo, shell: false']
    : ["stdio: 'pipe', encoding", 'env: { ...process.env'];
  for (const anchor of optionAnchors) {
    for (const prefix of ['...options, ', "['shell']: false, ", '__proto__: options, ',
      'get shell() { return true; }, ', 'shell: true, '])
      change('options escape', anchor, prefix + anchor, 'spawn-options');
  }
  // Flip actual shell values instead of prepending a shadowed true property.
  for (const api of ['execFileSync', 'spawn']) {
    const options = sites.get(api).arguments[2];
    const optionText = options.getText(syntax);
    const shellTrue = optionText.includes('shell: false')
      ? optionText.replace('shell: false', 'shell: true') : optionText.replace('{', '{shell: true,');
    sensitive(`${api} effective shell true`, replaceNode(options, shellTrue), 'spawn-options',
      "|| (property.name.text === 'shell' && property.initializer.kind !== ts.SyntaxKind.FalseKeyword)");
    const duplicate = optionText.replace('{', "{encoding: 'utf8', encoding: 'utf8',");
    // Use a key already allowed by this profile, isolating duplicate detection.
    const duplicateKnown = api === 'spawn' ? optionText.replace('{', "{stdio: [], stdio: [],") : duplicate;
    sensitive(`${api} duplicate allowed option`, replaceNode(options, duplicateKnown), 'spawn-options',
      '|| keys.has(property.name.text)');
  }
  if (!production) {
    const options = sites.get('execFileSync').arguments[2];
    sensitive('test git missing shell', replaceNode(options, options.getText(syntax).replace(', shell: false', '')),
      'spawn-options', "if (pin.options.some((key) => !keys.has(key))) add(options, 'spawn-options');");
  } else {
    const options = sites.get('spawn').arguments[2];
    sensitive('production spawn forbidden env', replaceNode(options, options.getText(syntax).replace('{', '{env: {},')),
      'spawn-options', "|| (!pin.options.includes(property.name.text) && property.name.text !== 'shell')");
    sensitive('production argv wrapper deletion', replaceNode(sites.get('spawn').arguments[1], 'claudeArgs()'),
      'spawn-argv', "if (!argv || !ts.isArrayLiteralExpression(argv)) add(call, 'spawn-argv');");
  }
  if (production) {
    // git has the reviewed shell:false default; explicitly spelling false is also safe.
    const explicit = replaceOnce(source, "encoding: 'utf8', maxBuffer", "shell: false, encoding: 'utf8', maxBuffer");
    withFixture(explicit, (root) => { assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0); }, relative);
  }
  change('spawn shell missing', production ? 'cwd: repo, shell: false,' : "stdio: ['ignore', 'pipe', 'pipe'], shell: false,",
    production ? 'cwd: repo,' : "stdio: ['ignore', 'pipe', 'pipe'],", 'spawn-options');
  change('spawn shell true', production ? 'cwd: repo, shell: false,' : "stdio: ['ignore', 'pipe', 'pipe'], shell: false,",
    production ? 'cwd: repo, shell: true,' : "stdio: ['ignore', 'pipe', 'pipe'], shell: true,", 'spawn-options');
  change('spawn shell duplicate', production ? 'cwd: repo, shell: false,' : "stdio: ['ignore', 'pipe', 'pipe'], shell: false,",
    production ? 'cwd: repo, shell: false, shell: true,' : "stdio: ['ignore', 'pipe', 'pipe'], shell: false, shell: true,", 'spawn-options');
  // Computed/aliased options replace the object expression, preserving the other site.
  const astFreeOptions = production ? "{\n      cwd: repo, shell: false, detached: process.platform !== 'win32',\n      stdio: ['pipe', 'pipe', 'pipe'],\n    }"
    : "{\n      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, REVIEW_FAKE_MODE: mode,\n        REVIEW_FAKE_CAPTURE: resolve(f.root, 'received-prompt.txt') },\n      stdio: ['ignore', 'pipe', 'pipe'], shell: false,\n    }";
  change('computed options', astFreeOptions, 'options', 'spawn-options');
  withFixture(source, (root) => {
    const file = path.join(root, relative);
    assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0);
    for (const [name, mutant, code] of rows) {
      fs.writeFileSync(file, mutant);
      assert(checkDockerInvocation(root).some((v) => v.code === code), `${relative}: ${name}`);
      assertCli(root, 1);
      fs.writeFileSync(file, source);
      assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0);
      reviewMutants++;
    }
  }, relative);
}
// Delete each profile in a private copy of the production gate. The unchanged actual
// helper must become red through the CLI, and restoring the profile restores green.
withFixture('export {};', (root) => {
  const commandRoot = path.join(root, 'command');
  fs.mkdirSync(commandRoot);
  fs.cpSync(path.join(repo, 'scripts'), path.join(commandRoot, 'scripts'), { recursive: true });
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(commandRoot, 'node_modules'));
  const module = path.join(commandRoot, 'scripts/docker-invocation.mjs');
  const original = fs.readFileSync(module, 'utf8');
  const command = path.join(commandRoot, 'scripts/check-docker-invocation.mjs');
  for (const relative of reviewFiles) withFixture(reviewSources.get(relative), (target) => {
    assertCli(target, 0, command);
    const entry = `  '${relative}': ['node:child_process'],\n`;
    fs.writeFileSync(module, replaceOnce(original, entry, ''));
    assertCli(target, 1, command);
    fs.writeFileSync(module, original); assertCli(target, 0, command);
    // Removing just the syntax profile must also fail the positive expectation.
    const profileEntry = `  '${relative}': {`;
    fs.writeFileSync(module, replaceOnce(original, profileEntry, `  'removed/${relative}': {`));
    assertCli(target, 1, command);
    fs.writeFileSync(module, original); assertCli(target, 0, command);
  }, relative);
  // An isolated deleted guard must make its formerly rejected mutant green. Restoring
  // the guard must make it red again; this proves the negative assertions depend on it.
  for (const [relative, mutant, guard] of guardMutants) withFixture(mutant, (target) => {
    assert(checkDockerInvocation(target).length > 0);
    assertCli(target, 1, command);
    fs.writeFileSync(module, replaceOnce(original, guard, ''));
    assertCli(target, 0, command);
    fs.writeFileSync(module, original); assertCli(target, 1, command);
  }, relative);
});
console.log(`review subprocess profiles PASS (${reviewMutants} isolated source mutants red then restored green; ${guardMutants.length} isolated guard deletions and both profile deletions proved)`);
for (const source of ["require('node:' + 'net')", 'import(target)', 'require()', 'module.require(target)']) {
  rejected(source, 'computed-import');
}
for (const relative of ['scripts/unlisted.mjs', 'src/testbed/docker/exec.ts', 'scripts/check-test-entry.mjs',
  'scripts/check-test-execution.mjs', 'scripts/check-compose.mjs', 'scripts/compose-lint.mjs']) {
  rejected("import 'node:child_process';", 'capability-import', relative);
}
withFixture("import 'node:fs'; // import 'node:net';\nconst text = \"require('http')\";", (root) => assertCli(root, 0));
for (const directory of ['node_modules', 'dist', 'artifacts']) {
  withFixture('export const clean = true;', (root) => {
    fs.mkdirSync(path.join(root, directory)); fs.writeFileSync(path.join(root, directory, 'ignored.ts'), "import 'net';"); assertCli(root, 0);
  });
}
withFixture('export const clean = true;', (root) => {
  fs.symlinkSync('probe.ts', path.join(root, 'src/alias.ts'));
  assert.throws(() => checkDockerInvocation(root), { message: 'source-symlink' }); assertCli(root, 1);
  fs.rmSync(path.join(root, 'src/alias.ts')); assertCli(root, 0);
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  assert.throws(() => checkDockerInvocation(root), { message: 'source-empty' }); assertCli(root, 1);
  fs.writeFileSync(path.join(root, 'restored.ts'), ''); assertCli(root, 0);
  assertCli(path.join(root, 'missing'), 1);
});
console.log('docker invocation selftest PASS (11 rules; all import forms, extensions and script spawn pins red then green)');
gateCliSelftest((script, root, status, extra = []) => {
  const result = spawnSync(process.execPath, [path.join(root, script), '--root', root, ...extra], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, status, `${script}: ${result.stdout}\n${result.stderr}`);
  assert.match(status ? result.stderr : result.stdout, status ? /gate FAIL/ : /PASS/);
});
console.log('B2 production CLI selftest PASS (entry, compose, execution and claim-linkage callers proved)');

// M8-C2/C4: the new MCP profile has two exact API sites. Existing profiles stay unchanged.
const mcpMutants = [];
const mcpChange = (name, needle, replacement, code) =>
  mcpMutants.push([name, replaceOnce(mcpSource, needle, replacement), code]);
for (const executable of ["'docker'", 'executable', "process['execPath']"]) {
  mcpChange('node executable', 'process.execPath', executable, 'spawn-executable');
}
for (const executable of ["'ps'", "'/usr/bin/ps'", "'docker'", 'executable']) {
  mcpChange('ps executable', "'/bin/ps'", executable, 'spawn-executable');
}
for (const argv of ['{}', 'argv', "['-axo']", "['pid=,ppid=,comm=', '-axo']", "['-axo', 'args=']",
  "['-axo', 'pid=,ppid=,comm=', 'extra']", "['-axo', ...['pid=,ppid=,comm=']]",
  "['-axo', value]", "['-axo', 'pid=' + ',ppid=,comm=']"]) {
  mcpChange('ps argv', "['-axo', 'pid=,ppid=,comm=']", argv, 'spawn-argv');
}
mcpChange('node argv overload', '[],', '{ shell: true },', 'spawn-argv');
mcpChange('C4 shorthand env', 'env: {}', 'env', 'spawn-options');
for (const api of ['spawn', 'execFileSync']) {
  const anchor = api === 'spawn' ? "{ env: {}, stdio: 'pipe', shell: false }" : "{ encoding: 'utf8', shell: false }";
  for (const options of ['options', anchor.replace('shell: false', 'shell: true'),
    anchor.replace(', shell: false', ''), anchor.replace('{ ', '{ ...other, '),
    anchor.replace('shell: false', "['shell']: false"), anchor.replace('shell: false', 'shell: false, shell: false')]) {
    mcpChange(`${api} options`, anchor, options, 'spawn-options');
  }
  mcpChange(`${api} escaped reference`, `${api}(`, `${api}.call(null, `, 'spawn-reference');
  mcpChange(`${api} optional call`, `${api}(`, `${api}?.(`, 'spawn-reference');
  mcpChange(`${api} missing call`, `${api}(`, 'unlisted(', 'spawn-call-count');
  mcpMutants.push([`${api} extra reference`, `${mcpSource}\nconst escaped = ${api};`, 'spawn-reference']);
  const site = mcpSource.split('\n').find(line => line.startsWith(`${api}(`));
  mcpMutants.push([`${api} extra call`, `${mcpSource}\n${site}`, 'spawn-call-count']);
}
for (const encoding of ["'hex'", 'encoding', "'utf' + '8'"]) {
  mcpChange('ps encoding', "encoding: 'utf8'", `encoding: ${encoding}`, 'spawn-options');
}
for (const source of [mcpSource, fs.readFileSync(path.join(repo, mcpPath), 'utf8')]) withFixture(source, root => {
  assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0);
}, mcpPath);
for (const [name, source, code] of mcpMutants) withFixture(source, root => {
  assert(checkDockerInvocation(root).some(v => v.code === code), name); assertCli(root, 1);
  fs.writeFileSync(path.join(root, mcpPath), mcpSource);
  assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0);
}, mcpPath);
const fixedArgvGuard = "  if (pin.argv && (!argv || !ts.isArrayLiteralExpression(argv) || argv.elements.length !== pin.argv.length\n"
  + "    || argv.elements.some((element, index) => !ts.isStringLiteral(element) || element.text !== pin.argv[index]))) {\n"
  + "    add(call, 'spawn-argv');\n  }";
const encodingGuard = "    if (!encoding || !ts.isPropertyAssignment(encoding) || !ts.isStringLiteral(encoding.initializer)\n"
  + "      || encoding.initializer.text !== 'utf8') add(call, 'spawn-options');";
const mcpGuards = [
  [mcpSource.replace("'pid=,ppid=,comm='", "'args='"), fixedArgvGuard],
  [mcpSource.replace("encoding: 'utf8'", "encoding: 'hex'"), encodingGuard],
  [mcpSource.replace("'/bin/ps'", "'docker'"), "if (!allowed) add(node, 'spawn-executable');"],
  [mcpSource + '\nconst escaped = execFileSync;', "add(node, 'spawn-reference');"],
  [mcpSource + "\nexecFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8', shell: false });",
    "if (profile && Object.keys(profile).some((name) => counts.get(name) !== 1)) add(source, 'spawn-call-count');"],
  [mcpSource.replace("encoding: 'utf8', shell: false", "encoding: 'utf8', shell: true"),
    "|| (property.name.text === 'shell' && property.initializer.kind !== ts.SyntaxKind.FalseKeyword)"],
];
withFixture(mcpSource, target => {
  const commandRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-mcp-gate-copy-'));
  try {
    fs.cpSync(path.join(repo, 'scripts'), path.join(commandRoot, 'scripts'), { recursive: true });
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(commandRoot, 'node_modules'));
    const module = path.join(commandRoot, 'scripts/docker-invocation.mjs');
    const original = fs.readFileSync(module, 'utf8');
    const command = path.join(commandRoot, 'scripts/check-docker-invocation.mjs');
    assertCli(target, 0, command);
    for (const [needle, replacement] of [
      [`  '${mcpPath}': ['node:child_process'],\n`, ''],
      ["    execFileSync: { executable: '/bin/ps', options: ['encoding', 'shell'], argv: ['-axo', 'pid=,ppid=,comm='] },\n", ''],
    ]) {
      fs.writeFileSync(module, replaceOnce(original, needle, replacement)); assertCli(target, 1, command);
      fs.writeFileSync(module, original); assertCli(target, 0, command);
    }
    // Deleting the whole non-scripts profile removes its binding guard. Prove the
    // formerly rejected executable then passes, so the unchanged negative test kills it.
    fs.writeFileSync(path.join(target, mcpPath), mcpSource.replace("'/bin/ps'", "'docker'"));
    assertCli(target, 1, command);
    fs.writeFileSync(module, replaceOnce(original, `  '${mcpPath}': {`, `  'removed/${mcpPath}': {`));
    assertCli(target, 0, command);
    fs.writeFileSync(module, original); assertCli(target, 1, command);
    fs.writeFileSync(path.join(target, mcpPath), mcpSource); assertCli(target, 0, command);
    for (const [mutant, guard] of mcpGuards) {
      fs.writeFileSync(path.join(target, mcpPath), mutant); assertCli(target, 1, command);
      fs.writeFileSync(module, replaceOnce(original, guard, '')); assertCli(target, 0, command);
      fs.writeFileSync(module, original); assertCli(target, 1, command);
      fs.writeFileSync(path.join(target, mcpPath), mcpSource); assertCli(target, 0, command);
    }
  } finally { fs.rmSync(commandRoot, { recursive: true, force: true }); }
}, mcpPath);
console.log(`M8-C2/C4 MCP profile PASS (${mcpMutants.length} source mutants; ${mcpGuards.length} guard deletions; capability/profile/ps-binding deletions; C4 shorthand remains red)`);
