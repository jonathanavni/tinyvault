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

function context(runs = 2, candidate = 'candidate') {
  const root = temporaryDirectory('probe-p-context-');
  const checkoutRoot = path.join(root, 'checkout');
  const harnessDirectory = path.join(checkoutRoot, 'harness');
  const policyFile = path.join(checkoutRoot, 'docs/policy.md');
  const out = path.join(root, 'evidence');
  fs.mkdirSync(harnessDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(policyFile), { recursive: true });
  fs.writeFileSync(path.join(harnessDirectory, 'one.mjs'), 'export const one = 1;\n');
  fs.writeFileSync(policyFile, 'frozen policy\n');
  const frozen = { checkoutRoot, harnessDirectory, policyFile };
  freezeCampaign({ out, runs, candidate, ...frozen });
  return { out, runs, candidate, ...frozen };
}

function begin(campaign: ReturnType<typeof context>, run: number) {
  fs.mkdirSync(path.join(campaign.out, `run-${String(run).padStart(2, '0')}`));
  return startRun({ out: campaign.out, run, candidate: campaign.candidate, ...campaign });
}

function writeRaw(raw: string, name: string, text: string, exitCode = 0) {
  fs.writeFileSync(path.join(raw, `${name}.txt`), text);
  fs.writeFileSync(path.join(raw, `${name}.exit`), `${exitCode}\n`);
}

function populateRaw(raw: string, processes = ' 99 1 0.0 5 /bin/bash run.sh\n') {
  writeRaw(raw, 'processes', processes);
  writeRaw(raw, 'cpus', '12\n');
  writeRaw(raw, 'uptime', 'load averages: 1.00 2.00 3.00\n');
  writeRaw(raw, 'power', 'pmset unavailable\n', 127);
  writeRaw(raw, 'thermal', 'CPU_Speed_Limit = 100\n');
  writeRaw(raw, 'node-version', 'v24.19.0\n');
  writeRaw(raw, 'git-head', 'candidate\n');
  writeRaw(raw, 'git-status', '');
  writeRaw(raw, 'captured-at', '2026-09-09T10:00:00Z\n');
  writeRaw(raw, 'playwright', '{"version":"1.62.1"}\n');
  writeRaw(raw, 'chromium-package', '{"version":"1.62.1"}\n');
  writeRaw(raw, 'chromium-cache', 'chromium-1194\n');
  writeRaw(raw, 'memory-free', '1024\n');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe('campaign lifecycle', () => {
  it('pins every resume field, exact labels, and mutable started labels', () => {
    const identity = campaignIdentity({ candidate: 'abc', harness: 'def', policyNote: 'ghi', runs: 2, cooldownSeconds: 0 });
    const existing = { ...identity, createdAt: '2026-09-09T10:00:00Z', startedLabels: ['run-01'] };
    expect(() => assertResumeMatches(existing, identity)).not.toThrow();
    expect(() => assertResumeMatches({ ...existing, labels: ['run-01'] }, identity)).toThrow('campaign mismatch: labels');
  });

  it('freezes the immutable run set and resumes an intact campaign', () => {
    const campaign = context();
    const frozen = JSON.parse(fs.readFileSync(path.join(campaign.out, 'campaign.json'), 'utf8'));
    expect(frozen).toMatchObject({ labels: ['run-01', 'run-02'], startedLabels: [] });
    expect(fs.existsSync(path.join(campaign.checkoutRoot, '.vitest/probe-p-campaign.pointer'))).toBe(false);
    expect(freezeCampaign({ out: campaign.out, runs: 2, candidate: campaign.candidate,
      resume: true, ...campaign })).toBe(1);
  });

  it('records a started label and refuses duplicate and out-of-range starts', () => {
    const campaign = context();
    const directory = begin(campaign, 1);
    expect(fs.readdirSync(directory).sort()).toEqual(['raw', 'started.json']);
    expect(JSON.parse(fs.readFileSync(path.join(campaign.out, 'campaign.json'), 'utf8')).startedLabels)
      .toEqual(['run-01']);
    expect(() => startRun({ out: campaign.out, run: 1, candidate: campaign.candidate, ...campaign }))
      .toThrow('run-01 was already started');
    expect(() => startRun({ out: campaign.out, run: 3, candidate: campaign.candidate, ...campaign }))
      .toThrow('outside the frozen run set');
    expect(nextRunNumber(campaign.out, 2)).toBe(1);
    expect(planLines(1, 2, campaign.out)).toEqual([
      'run-01: preserve incomplete started run', 'run-02: make test',
    ]);
  });

  it.each([
    ['candidate-head-mismatch', { candidate: 'changed' }, null],
    ['checkout-dirty', { status: '?? dirt' }, null],
    ['harness-sha-mismatch', {}, 'harness'],
    ['policy-sha-mismatch', {}, 'policy'],
  ])('leaves refused.json and no started.json for %s', (reason, changes, mutation) => {
    const campaign = context();
    if (mutation === 'harness') fs.appendFileSync(path.join(campaign.harnessDirectory, 'one.mjs'), '// drift\n');
    if (mutation === 'policy') fs.appendFileSync(campaign.policyFile, 'drift\n');
    const runDirectory = path.join(campaign.out, 'run-01');
    fs.mkdirSync(runDirectory);
    expect(() => startRun({ out: campaign.out, run: 1, candidate: campaign.candidate,
      ...campaign, ...changes })).toThrow(reason);
    expect(fs.existsSync(path.join(runDirectory, 'refused.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDirectory, 'started.json'))).toBe(false);
  });

  it('refuses resume after a recorded started run directory is deleted', () => {
    const campaign = context();
    begin(campaign, 1);
    fs.rmSync(path.join(campaign.out, 'run-01'), { recursive: true });
    expect(() => freezeCampaign({ out: campaign.out, runs: 2, candidate: campaign.candidate,
      resume: true, ...campaign })).toThrow('campaign is unresumable: missing started run run-01');
  });

  it('refuses a second output directory for the same incomplete candidate', () => {
    const campaign = context(20);
    const second = path.join(path.dirname(campaign.out), 'second-evidence');
    expect(() => freezeCampaign({ ...campaign, out: second, runs: 20, candidate: campaign.candidate }))
      .toThrow('candidate already has an incomplete campaign');
  });

  it('finishes without replacing reports and records missing reports', () => {
    const campaign = context();
    begin(campaign, 1);
    fs.mkdirSync(path.join(campaign.checkoutRoot, '.vitest'), { recursive: true });
    fs.writeFileSync(path.join(campaign.checkoutRoot, '.vitest/main.json'), '{"numFailedTests":0}');
    finishRun({ out: campaign.out, run: 1, exitCode: 7, durationMs: 123, checkoutRoot: campaign.checkoutRoot });
    expect(JSON.parse(fs.readFileSync(path.join(campaign.out, 'run-01/exit.json'), 'utf8')))
      .toMatchObject({ code: 7, durationMs: 123 });
    expect(JSON.parse(fs.readFileSync(path.join(campaign.out, 'run-01/reports.json'), 'utf8'))).toEqual({
      '.vitest/main.json': 'present', '.vitest/timing-1.json': 'missing',
      '.vitest/timing-2.json': 'missing', '.vitest/timing-2-probes.json': 'missing',
    });
  });

  it('normalizes process-capture and Chromium identity and writes predicate availability', () => {
    const campaign = context();
    const runDirectory = begin(campaign, 1);
    populateRaw(path.join(runDirectory, 'raw'), ' 99 1 0.0 5 /bin/bash run.sh\n 100 1 2.0 5 npx vitest run\n');
    const state = composeHostState({ runDirectory, ownPid: 99, checkoutRoot: campaign.checkoutRoot });
    expect(state).toMatchObject({
      processCapture: { status: 'ok', exit: 0 },
      chromium: { playwrightCore: '1.62.1', cacheDirectories: ['chromium-1194'] },
    });
    writeHostState({ out: campaign.out, run: 1, ownPid: 99, checkoutRoot: campaign.checkoutRoot });
    const verdict = JSON.parse(fs.readFileSync(path.join(runDirectory, 'competing.json'), 'utf8'));
    expect(verdict.predicateEvidence).toBe('available');
    expect(verdict.competing.map(({ pid }: { pid: number }) => pid)).toEqual([100]);
  });

  it('marks failed and unparseable ps capture as unavailable predicate evidence', () => {
    for (const [exitCode, text, status] of [[1, 'ps failed\n', 'failed'], [0, 'header only\n', 'unparseable']] as const) {
      const campaign = context();
      const runDirectory = begin(campaign, 1);
      populateRaw(path.join(runDirectory, 'raw'));
      writeRaw(path.join(runDirectory, 'raw'), 'processes', text, exitCode);
      writeHostState({ out: campaign.out, run: 1, ownPid: 99, checkoutRoot: campaign.checkoutRoot });
      const host = JSON.parse(fs.readFileSync(path.join(runDirectory, 'host-state.json'), 'utf8'));
      const verdict = JSON.parse(fs.readFileSync(path.join(runDirectory, 'competing.json'), 'utf8'));
      expect(host.processCapture.status).toBe(status);
      expect(verdict.predicateEvidence).toBe('unavailable');
    }
  });
});
