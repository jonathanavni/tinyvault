// No import of originGuard here: scripts/unicode-origin-sweep.mjs loads this file through Node's
// TypeScript loader, which cannot resolve extensionless relative imports, so the validator is injected.
type OriginValidator = (input: string) => string;

export type OriginSweepTemplate = Readonly<{
  build: (character: string) => string;
  target: string;
}>;

export type OriginSweepOptions = Readonly<{
  max: number;
  validate: OriginValidator;
  templates?: readonly OriginSweepTemplate[];
}>;

type CollapseExample = Readonly<{
  cp: string;
  input: string;
  origin: string;
  target: string;
}>;

type CollisionExample = Readonly<{
  origin: string;
  distinct: readonly string[];
}>;

export type OriginSweepResult = Readonly<{
  scanned: number;
  accepted: number;
  distinct: number;
  collapses: number;
  collisions: number;
  collapseExamples: readonly CollapseExample[];
  collisionExamples: readonly CollisionExample[];
}>;

export const DEFAULT_TEMPLATES: readonly OriginSweepTemplate[] = [
  { build: (c) => `https://exa${c}mple.com`, target: 'https://example.com' },
  { build: (c) => `https://${c}example.com`, target: 'https://example.com' },
  { build: (c) => `https://example${c}com`, target: 'https://example.com' },
  { build: (c) => `https://${c}x7f000001`, target: 'https://127.0.0.1' },
  { build: (c) => `https://127${c}0.0.1`, target: 'https://127.0.0.1' },
];

export function sweepOrigins({
  max,
  validate,
  templates = DEFAULT_TEMPLATES,
}: OriginSweepOptions): OriginSweepResult {
  if (!Number.isInteger(max) || max < 0x20 || max > 0x10ffff) {
    throw new RangeError('max must be an integer from 0x20 through 0x10FFFF');
  }
  if (typeof validate !== 'function') throw new TypeError('validate must be a function');
  const collapseExamples: CollapseExample[] = [];
  const byOrigin = new Map<string, string[]>();
  let accepted = 0;
  let scanned = 0;

  for (let cp = 0x20; cp <= max; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const character = String.fromCodePoint(cp);
    for (const { build, target } of templates) {
      const input = build(character);
      scanned += 1;
      let origin: string;
      try {
        origin = validate(input);
      } catch {
        continue;
      }
      accepted += 1;
      if (origin === target && character !== '' && !/[a-z0-9.]/iu.test(character)) {
        collapseExamples.push({ cp: cp.toString(16), input, origin, target });
      }
      // Keep EVERY input per origin. Keeping only the first made the collision
      // oracle structurally unable to fire (a permanently green metric).
      const seen = byOrigin.get(origin);
      if (seen === undefined) byOrigin.set(origin, [input]);
      else seen.push(input);
    }
  }

  const collisionExamples = findCollisions(byOrigin);
  return {
    scanned,
    accepted,
    distinct: byOrigin.size,
    collapses: collapseExamples.length,
    collisions: collisionExamples.reduce((sum, example) => sum + example.distinct.length - 1, 0),
    collapseExamples,
    collisionExamples: collisionExamples.slice(0, 20),
  };
}

function findCollisions(byOrigin: ReadonlyMap<string, readonly string[]>): CollisionExample[] {
  const collisionExamples: CollisionExample[] = [];
  for (const [origin, inputs] of byOrigin) {
    const distinct = [...new Set(inputs.map((input) => input.normalize('NFC').toLowerCase()))];
    if (distinct.length > 1) collisionExamples.push({ origin, distinct });
  }
  return collisionExamples;
}
