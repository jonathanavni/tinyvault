import { test } from 'vitest';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, candidate, validateEvents } from './claude-review.mjs';

const helper = fileURLToPath(new URL('./claude-review.mjs', import.meta.url));
const report = (status) => `## Status: ${status}\n## Findings\nNone\n## Test Gaps\nNot run: tests\n## Residual Risk\nNone\n## Deviations From Handoff\nNone\n`;
const events = (status = 'PASS') => [
  { type: 'system', subtype: 'init', model: MODEL, tools: ['Read', 'Glob', 'Grep'], mcp_servers: [], permissionMode: 'dontAsk' },
  { type: 'assistant', message: { model: MODEL, content: [{ type: 'text', text: report(status) }] } },
  { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', permission_denials: [], result: report(status) },
];

test('accepts a completed finding report, but rejects false completion and model/tool drift', () => {
  assert.equal(validateEvents(events('NEEDS-ATTENTION')).status, 'NEEDS-ATTENTION');
  const mutations = [
    (es) => { es[0].model = 'claude-opus-4-8'; },
    (es) => { es[1].message.model = 'claude-sonnet-5'; },
    (es) => { es[0].tools.push('Bash'); },
    (es) => { es[0].mcp_servers.push({ name: 'writer' }); },
    (es) => { es[0].permissionMode = 'bypassPermissions'; },
    (es) => { es[1].message.content.push({ type: 'tool_use', name: 'Write' }); },
    (es) => { es[2].is_error = true; },
    (es) => { es[2].stop_reason = 'max_tokens'; },
    (es) => { es[2].permission_denials.push({ tool_name: 'Read' }); },
    (es) => { es[2].result = 'PASS'; },
    (es) => { es[2].result += '## Status: NEEDS-ATTENTION\n'; },
    (es) => { es.pop(); },
    (es) => { es.push(es[2]); },
  ];
  for (const mutate of mutations) {
    const es = events(); mutate(es);
    assert.throws(() => validateEvents(es));
  }
});

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'tinyvault-claude-review-test-'));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const repo = resolve(root, 'repo'), bin = resolve(root, 'bin');
  mkdirSync(repo); mkdirSync(bin);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe', encoding: 'utf8', shell: false });
  git('init', '-q');
  writeFileSync(resolve(repo, 'source.txt'), 'original\n');
  writeFileSync(resolve(repo, 'CLAUDE.md'), '# Fixture project\nProject context from the reviewed checkout.\n');
  git('add', 'source.txt', 'CLAUDE.md');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=/dev/null',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  const packet = resolve(root, 'packet.md');
  writeFileSync(packet, 'Review source.txt against the stated contract.\n');
  const fake = `#!${process.execPath}
import {readFileSync,writeFileSync} from 'node:fs';
let prompt='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',(text)=>{prompt+=text;});
process.stdin.on('end',()=>{
writeFileSync(process.env.REVIEW_FAKE_CAPTURE,prompt);
const args=process.argv.slice(2);
const value=(key)=>args[args.indexOf(key)+1];
if(value('--model')!=='claude-opus-5'||!args.includes('--safe-mode')||value('--tools')!=='Read,Glob,Grep'||value('--allowedTools')!=='Read,Glob,Grep'||value('--permission-mode')!=='dontAsk'||!args.includes('--no-session-persistence')||args.includes('--fallback-model')) process.exit(9);
const mode=process.env.REVIEW_FAKE_MODE;
if(mode==='hang'){setInterval(()=>{},1000);return;}
if(mode==='nonzero'){process.stderr.write('authentication unavailable');process.exit(7);}
if(mode==='malformed'){process.stdout.write('bad json\\n');return;}
const es=${JSON.stringify(events())};
if(mode==='finding')es[2].result=${JSON.stringify(report('NEEDS-ATTENTION'))};
if(mode==='model')es[1].message.model='claude-sonnet-5';
if(mode==='mutate')writeFileSync('source.txt','changed during review');
if(mode==='denied')es[2].permission_denials=[{tool_name:'Read'}];
for(const e of es)process.stdout.write(JSON.stringify(e)+'\\n');
});
`;
  writeFileSync(resolve(bin, 'claude'), fake, { mode: 0o700 });
  // A .js-less executable is CommonJS unless its parent declares ESM.
  writeFileSync(resolve(bin, 'package.json'), '{"type":"module"}');
  return { root, repo, bin, packet, git };
}

function invoke(f, mode, output = resolve(f.root, mode), entry = helper) {
  return new Promise((accept) => {
    const child = spawn(process.execPath, [entry, '--repo', f.repo, '--packet', f.packet,
      '--channel', 'qa', '--output', output, '--timeout-seconds', '1'], {
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, REVIEW_FAKE_MODE: mode,
        REVIEW_FAKE_CAPTURE: resolve(f.root, 'received-prompt.txt') },
      stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('close', (code) => accept({ code, stdout, stderr, output }));
  });
}

test('real helper process separates findings from success, failure, denial, stale candidate and timeout', async (t) => {
  const f = fixture(t);
  for (const [mode, expected] of [['pass', 0], ['finding', 2], ['nonzero', 1], ['malformed', 1],
    ['model', 1], ['denied', 1], ['mutate', 1], ['hang', 124]]) {
    const run = await invoke(f, mode);
    assert.equal(run.code, expected, `${mode}: ${run.stderr}`);
    assert.ok(existsSync(resolve(run.output, 'summary.json')),
      `${mode}: missing summary; stderr=${run.stderr}; stdout=${run.stdout}`);
    const summary = JSON.parse(readFileSync(resolve(run.output, 'summary.json')));
    assert.equal(summary.executionStatus, expected === 0 || expected === 2 ? 'completed' : 'failed');
    assert.equal(existsSync(resolve(run.output, 'report.md')), expected === 0 || expected === 2);
    assert.ok(existsSync(resolve(run.output, 'events.jsonl')));
  }

  // Exercise the actual helper under the same dynamic rebinding with the wrapper
  // present, deleted, and restored. Deletion must reach only our existing fake CLI.
  const original = readFileSync(helper, 'utf8');
  const signature = 'export function runClaude({ repo, prompt, timeoutMs, onStdout = () => {}, onStderr = () => {} }) {';
  assert.equal(original.split(signature).length, 2);
  assert.equal(original.split('[...claudeArgs()]').length, 2);
  const rebound = original.replace(signature, signature + '\n  eval("claudeArgs = () => ({shell:true})");');
  const deleted = rebound.replace('[...claudeArgs()]', 'claudeArgs()');
  // Node resolves import.meta.url through macOS /var symlinks; match its entry check.
  const entry = resolve(realpathSync(f.root), 'helper-mutant.mjs');
  const capture = resolve(f.root, 'received-prompt.txt');
  for (const [name, text, launched, expected] of [
    ['argv-guarded', rebound, false, 1],
    ['argv-deleted', deleted, true, 1],
    ['argv-restored', rebound, false, 1],
    ['argv-ordinary', original, true, 0],
  ]) {
    rmSync(capture, { force: true });
    writeFileSync(entry, text);
    const run = await invoke(f, 'pass', resolve(f.root, name), entry);
    assert.equal(run.code, expected, `${name}: ${run.stderr}; stdout=${run.stdout}`);
    assert.equal(existsSync(capture), launched, `${name}: fake Claude launch marker`);
    if (!launched) assert.match(run.stderr, /iterable/);
  }
}, 30_000);

test('refuses in-repo or existing report directories, including symlinked parents', async (t) => {
  const f = fixture(t);
  const link = resolve(f.root, 'link');
  symlinkSync(f.repo, link);
  for (const output of [resolve(f.repo, 'evidence'), resolve(link, 'evidence'), f.bin]) {
    const run = await invoke(f, 'pass', output);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /outside all source worktrees|must be new/);
  }
  assert.equal(existsSync(resolve(f.repo, 'evidence')), false);
}, 30_000);

test('candidate digest sees untracked changes, tracked deletions, and rejects symlinks', (t) => {
  const f = fixture(t), head = f.git('rev-parse', 'HEAD').trim();
  const first = candidate(f.repo, head);
  writeFileSync(resolve(f.repo, 'new.txt'), 'new');
  assert.notEqual(candidate(f.repo, head).digest, first.digest);
  rmSync(resolve(f.repo, 'source.txt'));
  assert.ok(candidate(f.repo, head).files.find((file) => file.path === 'source.txt').deleted);
  symlinkSync(f.packet, resolve(f.repo, 'external.txt'));
  assert.throws(() => candidate(f.repo, head), /symlink/);
}, 30_000);

test('supplies the reviewed checkout CLAUDE.md without packet instructions and records its exact snapshot', async (t) => {
  const f = fixture(t);
  const context = '# Checkout-specific context\nThe unique project invariant is α-context-92851.\n';
  writeFileSync(resolve(f.repo, 'CLAUDE.md'), context);
  assert.equal(readFileSync(f.packet, 'utf8').includes('CLAUDE.md'), false);
  const run = await invoke(f, 'pass');
  assert.equal(run.code, 0, run.stderr);
  const received = readFileSync(resolve(f.root, 'received-prompt.txt'), 'utf8');
  assert.ok(received.includes(context), 'CLI must receive the actual checkout context');
  assert.equal(readFileSync(resolve(run.output, 'project-context.md'), 'utf8'), context);
  const request = JSON.parse(readFileSync(resolve(run.output, 'request.json')));
  assert.equal(request.projectContext.sha256, createHash('sha256').update(context).digest('hex'));
  const snapshot = JSON.parse(readFileSync(resolve(run.output, 'candidate.json')));
  assert.equal(snapshot.files.find((file) => file.path === 'CLAUDE.md').sha256, request.projectContext.sha256);
}, 30_000);

test('missing or empty CLAUDE.md fails before launching Claude', async (t) => {
  const f = fixture(t);
  rmSync(resolve(f.repo, 'CLAUDE.md'));
  const missing = await invoke(f, 'missing-context');
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Required CLAUDE.md is missing/);
  writeFileSync(resolve(f.repo, 'CLAUDE.md'), ' \n');
  const empty = await invoke(f, 'empty-context');
  assert.equal(empty.code, 1);
  assert.match(empty.stderr, /Required CLAUDE.md is empty/);
  assert.equal(existsSync(resolve(f.root, 'received-prompt.txt')), false);
}, 30_000);

for (const stream of ['stdout', 'stderr']) {
  test(`real helper records ${stream} read errors and preserves prior malformed failure`, async (t) => {
    const f = fixture(t);
    const original = readFileSync(helper, 'utf8');
    const entry = resolve(realpathSync(f.root), 'helper-read-error.mjs');
    const inject = `child.${stream}.emit('error', Object.assign(new Error('probe-read-reset'), { code: 'ECONNRESET' }));`;
    for (const phase of ['read', 'after-malformed']) {
      const anchor = phase === 'read'
        ? "    child.stdout.setEncoding('utf8');"
        : '      } catch (error) { stop(`Invalid Claude event: ${error.message}`); }';
      assert.equal(original.split(anchor).length, 2);
      const replacement = phase === 'read'
        ? `    setImmediate(() => { ${inject} });\n${anchor}`
        : '      } catch (error) { stop(`Invalid Claude event: ${error.message}`); ' + inject + ' }';
      writeFileSync(entry, original.replace(anchor, replacement));
      const run = await invoke(f, phase === 'read' ? 'pass' : 'malformed', resolve(f.root, `${stream}-${phase}`), entry);
      assert.equal(run.code, 1, `${phase}: ${run.stderr}`);
      assert.ok(existsSync(resolve(run.output, 'summary.json')),
        `${phase}: missing failed summary; stderr=${run.stderr}; stdout=${run.stdout}`);
      const summary = JSON.parse(readFileSync(resolve(run.output, 'summary.json')));
      assert.equal(summary.executionStatus, 'failed');
      if (phase === 'read') assert.equal(summary.error, `Cannot read reviewer ${stream}`);
      else assert.match(summary.error, /^Invalid Claude event:/);
      assert.equal(existsSync(resolve(run.output, 'report.md')), false);
      assert.ok(existsSync(resolve(run.output, 'events.jsonl')));
    }
  }, 30_000);
}

async function checkSignalFailure(t, reason, errorCode) {
  const f = fixture(t);
  const output = resolve(f.root, 'signal-failure');
  const signalLog = resolve(f.root, 'signals.log');
  const closeLog = resolve(f.root, 'actual-close.json');
  writeFileSync(signalLog, '');
  // Keep the fake alive until the real escalation timer fires. A finite watchdog
  // prevents an orphan if a mutant removes escalation; no provider is invoked.
  const fakePath = resolve(f.bin, 'claude');
  const fake = readFileSync(fakePath, 'utf8');
  const fakeAnchor = 'const es=';
  assert.equal(fake.split(fakeAnchor).length, 2);
  writeFileSync(fakePath, fake.replace(fakeAnchor, `
if(mode==='signal-failure'){
process.stderr.write('signal-probe-ready\\n');
${reason === 'malformed' ? "process.stdout.write('bad json\\n');" : ''}
const poll=setInterval(()=>{
  if(readFileSync(${JSON.stringify(signalLog)},'utf8').includes('SIGKILL')){
    clearInterval(poll);clearTimeout(watchdog);
    process.stderr.write('controlled natural exit\\n');
  }
},10);
const watchdog=setTimeout(()=>{clearInterval(poll);process.exitCode=8;},10000);
return;
}
${fakeAnchor}`));

  let source = readFileSync(helper, 'utf8');
  const signalAnchor = "if (process.platform === 'win32') child.kill(signal);\n        else process.kill(-child.pid, signal);";
  assert.equal(source.split(signalAnchor).length, 2);
  source = source.replace(signalAnchor,
    `appendFileSync(${JSON.stringify(signalLog)}, signal + '\\n');\n` +
    `        throw Object.assign(new Error('probe signal denied'), { code: ${JSON.stringify(errorCode)} });`);
  const closeAnchor = "    child.on('close', (code, signal) => {";
  assert.equal(source.split(closeAnchor).length, 2);
  source = source.replace(closeAnchor, closeAnchor +
    `\n      writeFileSync(${JSON.stringify(closeLog)}, JSON.stringify({ code, signal, summaryAlreadyExists: existsSync(${JSON.stringify(resolve(output, 'summary.json'))}) }));`);
  if (reason === 'interrupted') {
    const readyAnchor = "    child.stdout.setEncoding('utf8');";
    assert.equal(source.split(readyAnchor).length, 2);
    source = source.replace(readyAnchor, "    child.stderr.once('data', () => process.emit('SIGINT'));\n" + readyAnchor);
  }
  const entry = resolve(realpathSync(f.root), 'helper-signal-failure.mjs');
  writeFileSync(entry, source);
  const run = await invoke(f, 'signal-failure', output, entry);
  assert.equal(run.code, reason === 'timeout' ? 124 : reason === 'interrupted' ? 130 : 1, run.stderr);
  assert.ok(existsSync(resolve(output, 'summary.json')), `missing failed summary: ${run.stderr}`);
  const summary = JSON.parse(readFileSync(resolve(output, 'summary.json')));
  assert.equal(summary.executionStatus, 'failed');
  if (reason === 'malformed') {
    assert.match(summary.error, /^Invalid Claude event:/);
    assert.doesNotMatch(summary.error, /EPERM|ESRCH|probe signal denied/);
  } else assert.equal(summary.error, reason === 'timeout' ? 'Timed out' : 'Interrupted');
  assert.deepEqual(JSON.parse(readFileSync(closeLog)), { code: 0, signal: null, summaryAlreadyExists: false });
  assert.deepEqual(summary.signalFailures, errorCode === 'ESRCH' ? undefined : [
    { signal: 'SIGTERM', code: errorCode }, { signal: 'SIGKILL', code: errorCode },
  ]);
  assert.equal(readFileSync(signalLog, 'utf8'), 'SIGTERM\nSIGKILL\n');
  assert.match(readFileSync(resolve(output, 'stderr.log'), 'utf8'), /controlled natural exit/);
  assert.equal(existsSync(resolve(output, 'report.md')), false);
}

test('real helper preserves malformed failure and records denied signals only after child close', async (t) => {
  await checkSignalFailure(t, 'malformed', 'EPERM');
}, 30_000);

test('real helper preserves timeout exit 124 when both signals fail', async (t) => {
  await checkSignalFailure(t, 'timeout', 'EPERM');
}, 30_000);

test('real helper preserves interrupted exit 130 when both signals fail', async (t) => {
  await checkSignalFailure(t, 'interrupted', 'EPERM');
}, 30_000);

test('real helper ignores ESRCH while waiting for actual child close', async (t) => {
  await checkSignalFailure(t, 'malformed', 'ESRCH');
}, 30_000);
