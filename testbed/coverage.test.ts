import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { CHANNELS } from './checkers/offline';
import { CHANNEL_COVERAGE } from './coverage';
import { HARNESS_PRODUCERS } from './harnessGate';

describe('M5 capture coverage contract', () => {
  it('kills a deleted or renamed channel row by matching CHANNELS as sets', () => {
    expect(new Set(Object.keys(CHANNEL_COVERAGE))).toEqual(CHANNELS);
  });

  it('keeps exactly the screenshot channel declared rather than observed', () => {
    const declared = Object.entries(CHANNEL_COVERAGE).filter(([, row]) =>
      row.status === 'not-yet-instrumented');
    expect(declared).toEqual([['screenshot-text', {
      status: 'not-yet-instrumented',
      reason: 'v0.1 exposes no screenshot control; browser_snapshot is text and is measured on tool-result',
      registerId: 'M5-C1',
    }]]);
  });

  it('binds every instrumented table row to the gate registry sub-producer IDs', () => {
    for (const [channel, coverage] of Object.entries(CHANNEL_COVERAGE)) {
      if (coverage.status !== 'instrumented') continue;
      expect(HARNESS_PRODUCERS.filter((producer) => producer.channel === channel)
        .map((producer) => producer.id)).toEqual(coverage.producers);
    }
  });

  it('kills disabled browser producers by forbidding skip, todo, and only markers', async () => {
    const source = await readFile(new URL('./coverage.browser.test.ts', import.meta.url), 'utf8');
    const file = ts.createSourceFile('coverage.browser.test.ts', source, ts.ScriptTarget.Latest, true);
    const forbidden: string[] = [];
    const visit = (node: ts.Node) => {
      if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node))
        && /^(?:skip|todo|only)$/u.test(node.text)) {
        forbidden.push(node.getText(file));
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(forbidden).toEqual([]);
  });
});
