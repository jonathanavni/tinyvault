import { readFileSync } from 'node:fs';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { runProbeP } from './probeP';
import { spinForMicroseconds } from './spin';

const SOURCE = readFileSync(new URL('../../src/supervisor/host.timing.browser.test.ts', import.meta.url), 'utf8');

function functionText(source: string, name: string): string {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const node = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node.getText(file).replace(/^export /u, '');
}

function wrappers(source: string, hostA: unknown, hostB: unknown, afterA: () => void, afterB: () => void) {
  const file = ts.createSourceFile('timing.ts', functionText(source, 'realClickTripwireTimingProbe'), ts.ScriptTarget.Latest, true);
  let options: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'runProbeP'
      && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) options = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(file);
  const operations = ['a', 'b'].map((arm) => {
    const node = options?.properties.find((node) => ts.isPropertyAssignment(node) && node.name.getText(file) === arm);
    if (!node || !ts.isPropertyAssignment(node)) throw new Error(`Missing ${arm} wrapper`);
    return new Function('hostA', 'hostB', 'request', 'afterA', 'afterB', 'return ' + node.initializer.getText(file))(
      hostA, hostB, {}, afterA, afterB,
    ) as () => Promise<void>;
  });
  return { a: operations[0]!, b: operations[1]! };
}

describe('timing-2 bias mechanics', () => {
  it('spins for at least 900 microseconds when asked for 1000', () => {
    const start = performance.now();
    spinForMicroseconds(1000);
    expect((performance.now() - start) * 1000).toBeGreaterThanOrEqual(900);
  });

  it('keeps the Node spin function byte-identical to the browser-local definition', () => {
    const nodeSource = readFileSync(new URL('./spin.ts', import.meta.url), 'utf8');
    expect(functionText(nodeSource, 'spinForMicroseconds')).toBe(functionText(SOURCE, 'spinForMicroseconds'));
  });

  it('runs arm B hooks once after fill resolution and before wrapper settlement, with eight measured calls', async () => {
    const events: { arm: string; phase: string; timestamp: number }[] = [];
    const counts = { A: 0, B: 0 };
    let currentArm: 'A' | 'B' = 'A';
    const record = (arm: string, phase: string) => { events.push({ arm, phase, timestamp: performance.now() }); };
    const fake = (arm: 'A' | 'B') => ({ tools: { fill_from_vault: () => new Promise<void>((resolve) => {
      currentArm = arm;
      queueMicrotask(() => { resolve(); record(arm, 'resolved'); });
    }) } });
    const { a, b } = wrappers(SOURCE, fake('A'), fake('B'), () => undefined, () => {
      counts[currentArm]++; record(currentArm, 'hook');
    });
    const sample = async (arm: string, operation: () => Promise<void>) => {
      await operation().then(() => { record(arm, 'settled'); });
    };
    await runProbeP({ pairs: 8, warmup: 0, a: () => sample('A', a), b: () => sample('B', b) });
    expect(counts).toEqual({ A: 0, B: 8 });
    expect(events.filter(({ arm, phase }) => arm === 'A' && phase === 'hook')).toHaveLength(0);
    const bEvents = events.filter(({ arm }) => arm === 'B');
    expect(bEvents).toHaveLength(24);
    for (let index = 0; index < bEvents.length; index += 3) {
      const sample = bEvents.slice(index, index + 3);
      expect(sample.map(({ phase }) => phase)).toEqual(['resolved', 'hook', 'settled']);
      expect(sample[1]!.timestamp).toBeGreaterThanOrEqual(sample[0]!.timestamp);
      expect(sample[1]!.timestamp).toBeLessThanOrEqual(sample[2]!.timestamp);
    }
  });
});
