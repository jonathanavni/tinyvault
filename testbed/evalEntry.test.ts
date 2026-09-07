import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as runner from './runner';
import { runEvalEntry } from './evalEntry';
import { InvalidEvaluationError } from './evaluationValidity';
const literal = 'A valid composed evaluation assumes the Docker Engine API is unreachable by the evaluated browser, page content and agent. Local endpoint validation does not verify this assumption. An unsatisfied assumption invalidates the evaluation.';
afterEach(() => vi.restoreAllMocks());
describe('eval adapter', () => {
  it('O-entry-composed calls real runEval export with composed assumed defaults', async () => {
    const failure = new Error('observed real runEval boundary');
    const call = vi.spyOn(runner, 'runEval').mockRejectedValue(failure);
    await expect(runEvalEntry({})).rejects.toBe(failure);
    expect(call).toHaveBeenCalledExactlyOnceWith({ architecture: 'composed', dockerDaemonIsolation: 'assumed', sampleSize: 10 });
  });
  it('O-env-parse propagates exact valid isolation and complete decimal N', async () => {
    const failure = new Error('boundary');
    const call = vi.spyOn(runner, 'runEval').mockRejectedValue(failure);
    for (const isolation of ['assumed', 'unsatisfied']) {
      await expect(runEvalEntry({ TINYVAULT_DOCKER_ISOLATION: isolation, TINYVAULT_N: '12' })).rejects.toBe(failure);
      expect(call).toHaveBeenLastCalledWith({ architecture: 'composed', dockerDaemonIsolation: isolation, sampleSize: 12 });
    }
  });
  it('O-env-parse rejects empty and nonliteral isolation and incomplete unsafe N before runner', async () => {
    const call = vi.spyOn(runner, 'runEval').mockRejectedValue(new Error('runner unexpectedly reached'));
    for (const isolation of ['', 'Assumed', ' assumed', 'unsatisfied ', 'false']) {
      await expect(runEvalEntry({ TINYVAULT_DOCKER_ISOLATION: isolation })).rejects.toThrow('Invalid TINYVAULT_DOCKER_ISOLATION');
    }
    for (const n of ['', '0', '-1', '+1', '1.5', '1tail', '1e2', ' 1', '1\n', '9007199254740992']) {
      await expect(runEvalEntry({ TINYVAULT_N: n })).rejects.toThrow('Invalid TINYVAULT_N');
    }
    expect(call).not.toHaveBeenCalled();
  });
  it('O-invalid-shape renders only typed invalidity once and preserves operational errors', async () => {
    const call = vi.spyOn(runner, 'runEval'); const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalid = new InvalidEvaluationError(); call.mockRejectedValue(invalid);
    await expect(runEvalEntry({ TINYVAULT_DOCKER_ISOLATION: 'unsatisfied' })).rejects.toBe(invalid);
    expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ status: 'invalid',
      reason: 'docker-daemon-isolation-unsatisfied', architecture: 'composed', requirement: literal }));
    log.mockClear(); const operational = new Error('operational'); call.mockRejectedValue(operational);
    await expect(runEvalEntry({})).rejects.toBe(operational); expect(log).not.toHaveBeenCalled();
  });
  it('O-invalid-command real adapter child reports invalid, exits nonzero and preserves historical artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-invalid-entry-'));
    const repo = process.cwd();
    const loader = join(root, 'loader.mjs');
    await writeFile(loader, `import {registerHooks,createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const ts=createRequire(${JSON.stringify(resolve(repo, 'package.json'))})('typescript');
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(e){if(!s.startsWith('.')&&!s.startsWith('/'))throw e;const u=new URL(s,c.parentURL);for(const suffix of ['.ts','/index.ts']){const candidate=new URL(u.href+suffix);if(existsSync(fileURLToPath(candidate)))return next(candidate.href,c)}throw e}},load(u,c,next){if(!u.endsWith('.ts'))return next(u,c);return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText}}});`);
    const entry = join(root, 'entry.mjs');
    await writeFile(entry, `import ${JSON.stringify(pathToFileURL(resolve(repo, 'testbed/docker/no-docker.setup.ts')).href)};\nconst {runEvalEntry}=await import(${JSON.stringify(pathToFileURL(resolve(repo, 'testbed/evalEntry.ts')).href)});\nawait runEvalEntry();\n`);
    await mkdir(join(root, 'artifacts/eval'), { recursive: true });
    const sentinel = join(root, 'artifacts/eval/scorecard.json'); await writeFile(sentinel, 'historical');
    const child = spawnSync(process.execPath, ['--import', loader, entry], {
      cwd: root, env: { ...process.env, TINYVAULT_DOCKER_ISOLATION: 'unsatisfied', TINYVAULT_N: '1' },
      shell: false, timeout: 30_000, maxBuffer: 256 * 1024, encoding: 'utf8',
    });
    expect(child.error).toBeUndefined(); expect(child.signal).toBeNull();
    const reports = child.stderr.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    expect(reports).toEqual([{ status: 'invalid', reason: 'docker-daemon-isolation-unsatisfied',
      architecture: 'composed', requirement: literal }]);
    expect(child.status, 'typed report must propagate to nonzero child status').not.toBe(0);
    expect(child.stdout).toBe('');
    expect(await readFile(sentinel, 'utf8')).toBe('historical');
  });
});
