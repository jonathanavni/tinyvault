// Reviewed root of trust, not an external security boundary: a coordinated hostile edit of these
// pins and the entry points is outside the locked threat model. Every pin change must be reviewed.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkEntryDocuments, readEntryDocuments, resetReports, ENTRY_RULES } from '../scripts/check-test-entry.mjs';
import { entrySelftest } from '../scripts/test-entry.selftest.mjs';
import { executionSelftest } from '../scripts/test-execution.selftest.mjs';
import { composeSelftest } from '../scripts/compose-lint.selftest.mjs';

const PINS: Record<string, string> = {
  // ROOT_PINS_START
  'package.json#scripts': '874ba78e220fe306007f841eee3432f57a52902aa6a2995512fe8df6bc81d443',
  'Makefile': 'bbbc696a09d394163007c475344c9fffe1e25d29ed3ce73123441694bb68d852',
  'vitest.config.ts': '03dfc84e160f68fd8b6638ca35b8627b458df0fbc041b3ea06f6637651533295',
  'vitest.docker.config.ts': '29d58d87067410e0618eb4f7cc3970a313987d3a61ba7eb00ffbebc90c61cd25',
  'scripts/check-acceptance-j-results.mjs': '9e17514308965aa87c109bba38b95ff6dc2ec726ceaa77023842725c1469275c',
  'scripts/check-compose.mjs': '4ac5a900d02b846b9eab26ab9c0a76a99f6cc8e21879188847808693046fcf2a',
  'scripts/check-dependency-boundary.mjs': 'd3daa64172bb50b1d72f11048d50678e2e439e64225662fab84da04aaebb4437',
  'scripts/check-docker-invocation.mjs': '5d67b214f5cbc31db626161693efa084735ad874e1f094b04b5703238f42ceb3',
  'scripts/check-test-entry.mjs': '80c27b4a1e8a4b50c0f93bf1ce3de4acbbbdf0da874dce65ca118fa7fe04c735',
  'scripts/check-test-execution.mjs': '00cce78fd7abb8caaf04a4d8d4acb86e9c590b11bf3c758a716447bf320281fd',
  // ROOT_PINS_END
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function currentPins(): Record<string, string> {
  const files = ['Makefile', 'vitest.config.ts', 'vitest.docker.config.ts',
    ...readdirSync('scripts').filter((file) => /^check-.*\.mjs$/.test(file)).map((file) => `scripts/${file}`)];
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  return { 'package.json#scripts': hash(JSON.stringify(scripts)),
    ...Object.fromEntries(files.map((file) => [file, hash(readFileSync(file, 'utf8'))])) };
}
function verifyPins(actual: Record<string, string>): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(PINS).sort());
  for (const [file, digest] of Object.entries(PINS)) expect(actual[file], file).toBe(digest);
}
describe('reviewed root of trust', () => {
  it('pins the exact scripts block, Makefile, both configurations and every check script', () => {
    verifyPins(currentPins());
  });
  it.each(Object.keys(PINS))('kills a content mutation to %s, then accepts the restored bytes', (file) => {
    const actual = currentPins();
    const mutated = { ...actual, [file]: hash(`mutant:${actual[file]}`) };
    expect(() => verifyPins(mutated)).toThrow();
    verifyPins(actual);
  });
  it('kills added or removed checker pins, then accepts the restored inventory', () => {
    const actual = currentPins();
    expect(() => verifyPins({ ...actual, 'scripts/check-unreviewed.mjs': hash('') })).toThrow();
    const missing = { ...actual }; delete missing['scripts/check-test-entry.mjs'];
    expect(() => verifyPins(missing)).toThrow();
    verifyPins(actual);
  });
});
describe('B2 gate rejection paths and restored controls', () => {
  it('kills every entry grammar mutant and stale-report reset deletion', () => {
    entrySelftest(checkEntryDocuments, resetReports, ENTRY_RULES);
    checkEntryDocuments(readEntryDocuments(process.cwd()));
  });
  it('kills every execution-proof mutant, including skipped, absent and stale reports', executionSelftest);
  it('kills every closed-schema Compose and Dockerfile mutant by named code', composeSelftest);
});
