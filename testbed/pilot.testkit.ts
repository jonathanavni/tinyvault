import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UnqualifiedComparisonError } from './runner';
import type { OfflineDiagnosticReport } from './evaluationValidity';
import type { EvaluationProvenance } from './evaluationProvenance';
import type { RunRecord } from './scorecard.schema';

/** A rejection is insufficient: pilot readiness requires this exact persisted reason list. */
export async function expectPilot(execute: Promise<unknown>, directory: () => string | Promise<string>) {
  await assert.rejects(execute, UnqualifiedComparisonError);
  const root = await directory();
  const qualification = JSON.parse(await readFile(join(root, 'qualification.json'), 'utf8'));
  assert.equal(qualification.status, 'unqualified');
  assert.deepEqual(qualification.reasons, ['pilot-not-qualification']);
  await assert.rejects(access(join(root, 'scorecard.json')));
  const diagnostic: OfflineDiagnosticReport = JSON.parse(await readFile(join(root, 'diagnostic.json'), 'utf8'));
  const runs: RunRecord[] = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
  const provenance: EvaluationProvenance = JSON.parse(await readFile(join(root, 'provenance.json'), 'utf8'));
  assert.equal(qualification.provenanceId, provenance.provenanceId);
  assert.equal(diagnostic.status, 'validated');
  assert.equal(diagnostic.cohortFailure, undefined);
  assert.deepEqual(diagnostic.missingPositiveControlCells, []);
  assert.deepEqual(diagnostic.verifiedRuns, runs);
  assert.equal(diagnostic.runs.length, runs.length);
  assert.equal(diagnostic.runs.every(row => row.status === 'verified'), true);
  for (const row of runs) {
    await access(row.eventsPath); await access(row.transcriptPath);
  }
  return { directory: root, runs, provenance, diagnostic };
}
