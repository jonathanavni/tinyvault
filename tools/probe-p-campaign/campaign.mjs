#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  optionalCapture, parseChromiumIdentity, parseInteger, parseLoadAverage, parsePackageVersion,
  processCapture,
} from './hostState.mjs';
import { competingJobs } from './predicate.mjs';

export const CAMPAIGN_SCHEMA = 'probe-p-campaign/1';
export const PREDICATE_VERSION = 1;
const MODULE_FILE = decodeURIComponent(new URL(import.meta.url).pathname);
const TOOL_DIRECTORY = path.dirname(MODULE_FILE);
const CHECKOUT_ROOT = path.resolve(TOOL_DIRECTORY, '../..');
const REPORT_FILES = [
  '.vitest/main.json', '.vitest/timing-1.json', '.vitest/timing-2.json',
  '.vitest/timing-2-probes.json',
];

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function filesBelow(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(target, relative));
    else if (entry.isFile()) files.push({ relative, target });
    else throw new Error(`harness contains non-regular entry: ${relative}`);
  }
  return files;
}

export function harnessDigest(directory = TOOL_DIRECTORY) {
  const hash = crypto.createHash('sha256');
  for (const file of filesBelow(directory).sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative); hash.update('\0');
    hash.update(fs.readFileSync(file.target)); hash.update('\0');
  }
  return hash.digest('hex');
}

export function campaignIdentity({ candidate, harness, policyNote, runs, cooldownSeconds }) {
  return {
    schema: CAMPAIGN_SCHEMA, candidate, harness, policyNote, runs,
    predicateVersion: PREDICATE_VERSION, cooldownSeconds,
    labels: Array.from({ length: runs }, (_, index) => `run-${String(index + 1).padStart(2, '0')}`),
  };
}

export function assertResumeMatches(existing, expected) {
  if (!Number.isFinite(Date.parse(existing.createdAt))) throw new Error('campaign mismatch: createdAt');
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(existing[key]) !== JSON.stringify(value)) throw new Error(`campaign mismatch: ${key}`);
  }
  if (!Array.isArray(existing.startedLabels)
    || new Set(existing.startedLabels).size !== existing.startedLabels.length
    || existing.startedLabels.some((label) => !expected.labels.includes(label))) {
    throw new Error('campaign mismatch: startedLabels');
  }
  const allowed = new Set(['createdAt', 'startedLabels', ...Object.keys(expected)]);
  const extras = Object.keys(existing).filter((key) => !allowed.has(key));
  if (extras.length > 0) throw new Error(`campaign mismatch: unexpected ${extras.join(',')}`);
}

function runDirectories(out, runs) {
  const found = new Map();
  for (const name of fs.readdirSync(out)) {
    const match = /^run-(\d{2})$/u.exec(name);
    if (!match) continue;
    const number = Number(match[1]);
    if (number < 1 || number > runs) throw new Error(`out-of-range run directory: ${name}`);
    found.set(number, path.join(out, name));
  }
  return found;
}

export function nextRunNumber(out, runs) {
  const found = runDirectories(out, runs);
  for (let number = 1; number <= runs; number += 1) {
    const directory = found.get(number);
    if (!directory || !fs.existsSync(path.join(directory, 'ended.json'))) return number;
  }
  return runs + 1;
}

export function planLines(start, runs, out) {
  const lines = [];
  for (let number = start; number <= runs; number += 1) {
    const label = String(number).padStart(2, '0');
    const started = fs.existsSync(path.join(out, `run-${label}`, 'started.json'));
    lines.push(`run-${label}: ${started ? 'preserve incomplete started run' : 'make test'}`);
  }
  return lines;
}

function writeJson(file, value, flag = 'wx') {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag });
}

function overwriteJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

function campaignComplete(pointer) {
  try {
    const campaign = JSON.parse(fs.readFileSync(path.join(pointer.out, 'campaign.json'), 'utf8'));
    return campaign.labels.every((label) => fs.existsSync(path.join(pointer.out, label, 'ended.json')));
  } catch {
    return false;
  }
}

function assertPointerAllows(pointerFile, candidate, out) {
  if (!fs.existsSync(pointerFile)) return;
  const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
  if (pointer.candidate === candidate && path.resolve(pointer.out) !== path.resolve(out)
    && !campaignComplete(pointer)) {
    throw new Error(`candidate already has an incomplete campaign: ${pointer.out}`);
  }
}

function assertStartedRunsPresent(out, campaign) {
  for (const label of campaign.startedLabels) {
    if (!fs.existsSync(path.join(out, label, 'started.json'))) {
      throw new Error(`campaign is unresumable: missing started run ${label}`);
    }
  }
}

function assertCampaignLedger(campaign) {
  const labels = Array.from({ length: campaign.runs },
    (_, index) => `run-${String(index + 1).padStart(2, '0')}`);
  if (campaign.schema !== CAMPAIGN_SCHEMA || JSON.stringify(campaign.labels) !== JSON.stringify(labels)
    || !Array.isArray(campaign.startedLabels) || new Set(campaign.startedLabels).size !== campaign.startedLabels.length
    || campaign.startedLabels.some((label) => !labels.includes(label))) {
    throw new Error('campaign ledger is invalid');
  }
}

export function freezeCampaign({
  out, runs, candidate, cooldownSeconds = 0, resume = false,
  checkoutRoot = CHECKOUT_ROOT, harnessDirectory = TOOL_DIRECTORY,
  policyFile = path.join(checkoutRoot, 'docs/probe-p-timing2-policy.md'),
}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error('runs must be a positive integer');
  if (typeof candidate !== 'string' || candidate === '') throw new Error('candidate is required');
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0) throw new Error('invalid cooldown');
  const relativeOut = path.relative(checkoutRoot, path.resolve(out));
  if (relativeOut === '' || (!relativeOut.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeOut))) {
    throw new Error('campaign output directory must be outside the checkout');
  }
  const identity = campaignIdentity({
    candidate, harness: harnessDigest(harnessDirectory), policyNote: sha256(fs.readFileSync(policyFile)),
    runs, cooldownSeconds,
  });
  const pointerFile = path.join(checkoutRoot, '.vitest/probe-p-campaign.pointer');
  if (runs === 20) assertPointerAllows(pointerFile, candidate, out);
  fs.mkdirSync(out, { recursive: true });
  const campaignFile = path.join(out, 'campaign.json');
  if (resume) {
    const existing = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
    assertResumeMatches(existing, identity);
    assertCampaignLedger(existing);
    assertStartedRunsPresent(out, existing);
  }
  else {
    if (fs.readdirSync(out).length !== 0) throw new Error('new campaign output directory is not empty');
    writeJson(campaignFile, { ...identity, createdAt: new Date().toISOString(), startedLabels: [] });
  }
  if (runs === 20) {
    fs.mkdirSync(path.dirname(pointerFile), { recursive: true });
    overwriteJson(pointerFile, { candidate, out: path.resolve(out) });
  }
  return nextRunNumber(out, runs);
}

function refuseStart(directory, reasons, now) {
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, 'refused.json'), { refusedAt: now, reasons });
  throw new Error(`run start refused: ${reasons.join(', ')}`);
}

function startRefusalReasons(campaign, { candidate, status, harnessDirectory, policyFile }) {
  const reasons = [];
  if (candidate !== campaign.candidate) reasons.push('candidate-head-mismatch');
  if (status !== '') reasons.push('checkout-dirty');
  if (harnessDigest(harnessDirectory) !== campaign.harness) reasons.push('harness-sha-mismatch');
  if (sha256(fs.readFileSync(policyFile)) !== campaign.policyNote) reasons.push('policy-sha-mismatch');
  return reasons;
}

export function startRun({
  out, run, candidate, status = '', now = new Date().toISOString(),
  checkoutRoot = CHECKOUT_ROOT, harnessDirectory = TOOL_DIRECTORY,
  policyFile = path.join(checkoutRoot, 'docs/probe-p-timing2-policy.md'),
}) {
  const campaignFile = path.join(out, 'campaign.json');
  const campaign = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
  assertCampaignLedger(campaign);
  if (!Number.isInteger(run) || run < 1 || run > campaign.runs) throw new Error('run is outside the frozen run set');
  const label = campaign.labels[run - 1];
  const actualDirectory = path.join(out, label);
  if (campaign.startedLabels.includes(label) || fs.existsSync(path.join(actualDirectory, 'started.json'))) {
    throw new Error(`${label} was already started`);
  }
  const reasons = startRefusalReasons(campaign, {
    candidate, status, harnessDirectory, policyFile,
  });
  if (reasons.length > 0) refuseStart(actualDirectory, reasons, now);
  if (!fs.existsSync(actualDirectory)) fs.mkdirSync(actualDirectory);
  if (fs.readdirSync(actualDirectory).length !== 0) throw new Error(`${label} is not empty`);
  overwriteJson(campaignFile, { ...campaign, startedLabels: [...campaign.startedLabels, label] });
  writeJson(path.join(actualDirectory, 'started.json'), { startedAt: now, run: label });
  fs.mkdirSync(path.join(actualDirectory, 'raw'));
  return actualDirectory;
}

function rawCapture(raw, name) {
  const text = fs.readFileSync(path.join(raw, `${name}.txt`), 'utf8');
  const exitCode = parseInteger(fs.readFileSync(path.join(raw, `${name}.exit`), 'utf8'));
  return { text, exitCode };
}

function requiredRaw(raw, name) {
  const capture = rawCapture(raw, name);
  return capture.exitCode === 0 ? capture.text.trim() : null;
}

export function composeHostState({ runDirectory, ownPid, checkoutRoot }) {
  const raw = path.join(runDirectory, 'raw');
  const uptime = rawCapture(raw, 'uptime');
  const power = rawCapture(raw, 'power');
  const thermal = rawCapture(raw, 'thermal');
  const playwright = rawCapture(raw, 'playwright');
  const chromiumPackage = rawCapture(raw, 'chromium-package');
  const chromiumCache = rawCapture(raw, 'chromium-cache');
  const processRaw = rawCapture(raw, 'processes');
  const processState = processCapture(processRaw.text, processRaw.exitCode);
  const status = requiredRaw(raw, 'git-status');
  return {
    capturedAt: requiredRaw(raw, 'captured-at'),
    loadavg: uptime.exitCode === 0 ? parseLoadAverage(uptime.text) : null,
    cpus: parseInteger(requiredRaw(raw, 'cpus') ?? ''),
    memoryFree: parseInteger(requiredRaw(raw, 'memory-free') ?? ''),
    processes: processState.processes,
    processCapture: { status: processState.status, exit: processState.exit, bytes: processState.bytes },
    power: optionalCapture(power.text, power.exitCode),
    thermal: optionalCapture(thermal.text, thermal.exitCode),
    node: requiredRaw(raw, 'node-version'),
    playwright: playwright.exitCode === 0 ? parsePackageVersion(playwright.text) : null,
    chromium: parseChromiumIdentity(
      chromiumPackage.exitCode === 0 ? chromiumPackage.text : '',
      chromiumCache.exitCode === 0 ? chromiumCache.text : '',
    ),
    git: { head: requiredRaw(raw, 'git-head'), dirty: status === null || status !== '', status },
    ownPid, checkoutRoot,
  };
}

export function writeHostState({ out, run, ownPid, checkoutRoot }) {
  const runDirectory = path.join(out, `run-${String(run).padStart(2, '0')}`);
  const state = composeHostState({ runDirectory, ownPid, checkoutRoot });
  writeJson(path.join(runDirectory, 'host-state.json'), state);
  const verdict = competingJobs(state, { ownPid, checkoutRoot });
  writeJson(path.join(runDirectory, 'competing.json'), {
    predicateVersion: PREDICATE_VERSION, ownPid, checkoutRoot,
    predicateEvidence: state.processCapture.status === 'ok' ? 'available' : 'unavailable', ...verdict,
  });
}

export function finishRun({ out, run, exitCode, durationMs, checkoutRoot, now = new Date().toISOString() }) {
  const runDirectory = path.join(out, `run-${String(run).padStart(2, '0')}`);
  if (!fs.existsSync(path.join(runDirectory, 'started.json'))) throw new Error('run was not started');
  writeJson(path.join(runDirectory, 'exit.json'), { code: exitCode, signal: null, durationMs });
  const reports = {};
  for (const relative of REPORT_FILES) {
    const source = path.join(checkoutRoot, relative);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(runDirectory, path.basename(relative)), fs.constants.COPYFILE_EXCL);
      reports[relative] = 'present';
    } else reports[relative] = 'missing';
  }
  writeJson(path.join(runDirectory, 'reports.json'), reports);
  writeJson(path.join(runDirectory, 'ended.json'), { endedAt: now });
}

function parseOptions(argv) {
  const options = { resume: false, cooldownSeconds: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--resume') options.resume = true;
    else if (key === '--cooldown-seconds') options.cooldownSeconds = Number(argv[++index]);
    else if (['--out', '--runs', '--candidate', '--git-status', '--run', '--own-pid', '--checkout-root', '--exit', '--duration-ms'].includes(key)) {
      const name = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
      options[name] = argv[++index];
    } else throw new Error(`unknown argument: ${key}`);
  }
  return options;
}

function numberOption(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${name} must be a non-negative integer`);
  return number;
}

function positiveOption(value, name) {
  const number = numberOption(value, name);
  if (number === 0) throw new Error(`${name} must be positive`);
  return number;
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const command = argv[0];
  const options = parseOptions(argv.slice(1));
  const out = path.resolve(options.out ?? cwd);
  if (command === 'freeze') {
    const runs = positiveOption(options.runs, '--runs');
    console.log(freezeCampaign({ ...options, out, runs })); return;
  }
  const run = positiveOption(options.run, '--run');
  if (command === 'start') startRun({ out, run, candidate: options.candidate, status: options.gitStatus });
  else if (command === 'host-state') writeHostState({ out, run, ownPid: numberOption(options.ownPid, '--own-pid'), checkoutRoot: path.resolve(options.checkoutRoot) });
  else if (command === 'finish') finishRun({ out, run, exitCode: numberOption(options.exit, '--exit'), durationMs: numberOption(options.durationMs, '--duration-ms'), checkoutRoot: path.resolve(options.checkoutRoot) });
  else throw new Error('command must be freeze, start, host-state, or finish');
}

if (process.argv[1]
  && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(MODULE_FILE)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
