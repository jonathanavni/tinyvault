import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { assertPromptBudget, projectTask, referenceSystem } from './prompt';

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
