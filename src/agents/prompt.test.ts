import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { BASELINE_SYSTEM, assertPromptBudget, projectTask, referenceSystem } from './prompt';
import { createNaiveBaselineProfile } from './naiveBaseline';
import { createReferenceProfile } from './reference';
import { createScenarioRegistry } from '../../testbed/scenarios';
import { CanaryGenerator } from '../../testbed/canary';

it('AM13 pins BASELINE_SYSTEM v2 bytes and digest', () => {
  expect.soft(Buffer.byteLength(BASELINE_SYSTEM)).toBe(526);
  expect(createHash('sha256').update(BASELINE_SYSTEM).digest('hex'))
    .toBe('62ba8ba466139d3a40f591fec9f3454b4590d87960bcf434542e4b58dbcbb2a3');
});

it('AM13 budgets every production-shaped scenario and agent bootstrap', async () => {
  const skillText = await readFile(new URL('../../SKILL.md', import.meta.url), 'utf8');
  const registry = createScenarioRegistry({ 'benign-login': 'http://127.0.0.1:55494',
    'lookalike-origin': 'http://127.0.0.1:55496', 'dom-hidden-injection': 'http://127.0.0.1:55497',
    'secret-echo': 'http://127.0.0.1:55498', 'fake-reauth': 'http://127.0.0.1:55499' });
  const rows = [];
  for (const scenario of registry.values()) for (const agent of ['tinyvault-ref', 'naive-baseline'] as const) {
    const runId = `AB123456-${scenario.id}-${agent}-09`;
    const task = scenario.publicTask(runId);
    const profile = agent === 'naive-baseline'
      ? createNaiveBaselineProfile({ runId, task, password: new CanaryGenerator().mint(scenario.id, runId) })
      : await createReferenceProfile({ runId, task, skillText,
        vault: { list_vault: async () => ({ items: [{ handle: `lv_${'a'.repeat(32)}`, label: 'Benign fixture login',
          kind: 'password', account: 'fixture-user', available: true }] }),
          request_vault_setup: async () => { throw new Error('Unexpected setup'); } },
        probeAvailability: async () => ({ available: true }), setupReasonFor: async () => null });
    expect(profile.status).toBe('ready');
    if (profile.status !== 'ready') throw new Error('Unexpected setup');
    rows.push({ scenario: scenario.id, agent, system: Buffer.byteLength(profile.system),
      bootstrap: Buffer.byteLength(JSON.stringify(profile.bootstrapTask)),
      combined: assertPromptBudget(profile.system, profile.bootstrapTask) });
  }
  for (const row of rows) expect(row.combined, `${row.scenario}/${row.agent}`).toBeLessThan(1024);
  process.stderr.write(`M7 prompt rows: ${JSON.stringify(rows)}\n`);
  expect(rows.map(row => row.combined)).toEqual([988, 938, 1003, 963, 1012, 962, 1006, 950, 1008, 954]);
  expect(Math.max(...rows.filter(row => row.agent === 'naive-baseline').map(row => row.combined))).toBe(963);
  expect(Math.max(...rows.filter(row => row.agent === 'tinyvault-ref').map(row => row.combined))).toBe(1012);
});

describe('S3 exact prompt and public task boundary', () => {
  it('uses every published SKILL byte without trimming or rewriting', async () => {
    const skill = await readFile(new URL('../../SKILL.md', import.meta.url), 'utf8');
    expect(referenceSystem(skill)).toBe(skill);
    expect(referenceSystem(`\n${skill} `)).toBe(`\n${skill} `);
  });
  it('counts UTF-8 and rejects overflow instead of truncating required content', () => {
    expect(assertPromptBudget('x'.repeat(1022), {})).toBe(1024);
    expect(() => assertPromptBudget('x'.repeat(1023), {})).toThrow('1024');
    expect(() => assertPromptBudget('é'.repeat(512), {})).toThrow('1024');
  });
  it('projects six public facts and preserves encoded query fields with run attribution', () => {
    const task = projectTask({ startUrl: 'http://fixture.test/?q=a%26b&runId=old',
      recoveryUrl: 'http://fixture.test/login?q=a%26b', username: 'u', usernameSelector: '#u',
      passwordSelector: '#p', submitSelector: '#s', password: 'excluded', receipt: 'excluded' } as never, 'run_A');
    expect(task).toEqual({ startUrl: 'http://fixture.test/?q=a%26b&runId=run_A',
      recoveryUrl: 'http://fixture.test/login?q=a%26b&runId=run_A', username: 'u',
      usernameSelector: '#u', passwordSelector: '#p', submitSelector: '#s' });
    expect(() => projectTask(task, '../bad')).toThrow();
  });
});
