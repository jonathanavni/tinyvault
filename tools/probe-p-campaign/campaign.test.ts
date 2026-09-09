import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertResumeMatches, campaignIdentity, composeHostState, finishRun, freezeCampaign,
  nextRunNumber, planLines, startRun, writeHostState,
} from './campaign.mjs';

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function writeRaw(raw: string, name: string, text: string, exitCode = 0) {
  fs.writeFileSync(path.join(raw, `${name}.txt`), text);
  fs.writeFileSync(path.join(raw, `${name}.exit`), `${exitCode}\n`);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe('campaign lifecycle', () => {
  const identity = campaignIdentity({
    candidate: 'abc', harness: 'def', policyNote: 'ghi', runs: 20, cooldownSeconds: 0,
  });

  it('pins every resume field including cooldown', () => {
    const createdAt = '2026-09-09T10:00:00Z';
    expect(() => assertResumeMatches({ ...identity, createdAt }, identity)).not.toThrow();
    expect(() => assertResumeMatches({ ...identity, cooldownSeconds: 1, createdAt }, identity))
      .toThrow('campaign mismatch: cooldownSeconds');
  });

  it('freezes and re-verifies a campaign in an existing empty directory', () => {
    const out = temporaryDirectory('probe-p-freeze-');
    expect(freezeCampaign({ out, runs: 2, candidate: 'candidate', cooldownSeconds: 3 })).toBe(1);
    const frozen = JSON.parse(fs.readFileSync(path.join(out, 'campaign.json'), 'utf8'));
    expect(frozen).toMatchObject({ runs: 2, candidate: 'candidate', cooldownSeconds: 3 });
    expect(freezeCampaign({ out, runs: 2, candidate: 'candidate', cooldownSeconds: 3, resume: true })).toBe(1);
    expect(() => freezeCampaign({ out, runs: 2, candidate: 'changed', cooldownSeconds: 3, resume: true }))
      .toThrow('campaign mismatch: candidate');
  });

  it('writes started.json first and preserves an incomplete run in the plan', () => {
    const out = temporaryDirectory('probe-p-start-');
    freezeCampaign({ out, runs: 2, candidate: 'candidate' });
    fs.mkdirSync(path.join(out, 'run-01'));
    const runDirectory = startRun({ out, run: 1, now: '2026-09-09T10:00:00Z' });
    expect(fs.readdirSync(runDirectory).sort()).toEqual(['raw', 'started.json']);
    expect(nextRunNumber(out, 2)).toBe(1);
    expect(planLines(1, 2, out)).toEqual([
      'run-01: preserve incomplete started run', 'run-02: make test',
    ]);
  });

  it('finishes without replacing reports and records missing reports', () => {
    const out = temporaryDirectory('probe-p-finish-');
    const checkout = temporaryDirectory('probe-p-checkout-');
    fs.mkdirSync(path.join(out, 'run-01'));
    startRun({ out, run: 1 });
    fs.mkdirSync(path.join(checkout, '.vitest'));
    fs.writeFileSync(path.join(checkout, '.vitest/main.json'), '{"numFailedTests":0}');
    finishRun({ out, run: 1, exitCode: 7, durationMs: 123, checkoutRoot: checkout });
    expect(JSON.parse(fs.readFileSync(path.join(out, 'run-01/exit.json'), 'utf8'))).toMatchObject({ code: 7, durationMs: 123 });
    expect(JSON.parse(fs.readFileSync(path.join(out, 'run-01/reports.json'), 'utf8'))).toEqual({
      '.vitest/main.json': 'present', '.vitest/timing-1.json': 'missing',
      '.vitest/timing-2.json': 'missing', '.vitest/timing-2-probes.json': 'missing',
    });
    expect(nextRunNumber(out, 2)).toBe(2);
    expect(() => finishRun({ out, run: 1, exitCode: 0, durationMs: 1, checkoutRoot: checkout }))
      .toThrow();
  });

  it('normalizes raw host state and writes the objective predicate verdict', () => {
    const out = temporaryDirectory('probe-p-host-');
    fs.mkdirSync(path.join(out, 'run-01'));
    const runDirectory = startRun({ out, run: 1 });
    const raw = path.join(runDirectory, 'raw');
    writeRaw(raw, 'processes', ' 99 1 0.0 5 /bin/bash run.sh\n 100 1 2.0 5 npx vitest run\n');
    writeRaw(raw, 'cpus', '12\n');
    writeRaw(raw, 'uptime', 'load averages: 1.00 2.00 3.00\n');
    writeRaw(raw, 'power', 'pmset unavailable\n', 127);
    writeRaw(raw, 'thermal', 'CPU_Speed_Limit = 100\n');
    writeRaw(raw, 'node-version', 'v24.19.0\n');
    writeRaw(raw, 'git-head', 'abcdef\n');
    writeRaw(raw, 'git-status', '');
    writeRaw(raw, 'captured-at', '2026-09-09T10:00:00Z\n');
    writeRaw(raw, 'playwright', '{"version":"1.62.1"}\n');
    writeRaw(raw, 'memory-free', '1024\n');
    const state = composeHostState({ runDirectory, ownPid: 99, checkoutRoot: '/checkout' });
    expect(state).toMatchObject({ cpus: 12, memoryFree: 1024, loadavg: [1, 2, 3], power: null });
    writeHostState({ out, run: 1, ownPid: 99, checkoutRoot: '/checkout' });
    const verdict = JSON.parse(fs.readFileSync(path.join(runDirectory, 'competing.json'), 'utf8'));
    expect(verdict.competing.map(({ pid }: { pid: number }) => pid)).toEqual([100]);
  });
});
