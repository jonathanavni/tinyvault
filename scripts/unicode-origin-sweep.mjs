#!/usr/bin/env node
/**
 * Reproducible UTS-46 collapse sweep for the bare-origin validator.
 *
 * WHY THIS EXISTS: the final M2 confirmation reported "750,327 accepted origins, 0 collisions" as prose.
 * On a project whose thesis is *measure, don't assert*, an unreproducible measurement is an assertion.
 * This script re-derives that claim on demand.
 *
 * WHAT IT PROVES (independently of the validator's own rule): for every code point in a chosen range,
 * inject it into host templates whose plain-ASCII form is known, then group every ACCEPTED input by the
 * origin it returned. Any group whose members are not mere case/NFC variants is a COLLAPSE — two visually
 * distinct authorities normalizing to one origin, which is exactly the defect origin pinning exists to
 * prevent (finding F-1).
 *
 *   node scripts/unicode-origin-sweep.mjs            # default range, ~30s
 *   node scripts/unicode-origin-sweep.mjs --full     # U+0020..U+10FFFF
 *   node scripts/unicode-origin-sweep.mjs --max 0x2FFF
 *
 * Exit 0 = no collapse. Exit 1 = collapse found (prints offenders).
 */
import { validateBareOrigin } from '../src/core/originGuard.ts';
import { DEFAULT_TEMPLATES, sweepOrigins } from '../src/core/originSweep.ts';

const args = process.argv.slice(2);
const full = args.includes('--full');
const maxArg = args.indexOf('--max');
const MAX = full ? 0x10ffff : (maxArg !== -1 ? Number(args[maxArg + 1]) : 0x33ff);

const result = sweepOrigins({ max: MAX, validate: validateBareOrigin });

console.log(`range      : U+0020..U+${MAX.toString(16).toUpperCase()}`);
console.log(`scanned    : ${result.scanned} inputs across ${DEFAULT_TEMPLATES.length} templates`);
console.log(`accepted   : ${result.accepted}`);
console.log(`distinct   : ${result.distinct} origins`);
console.log(`COLLAPSES  : ${result.collapses}`);
console.log(`COLLISIONS : ${result.collisions}`);

if (result.collisions > 0) {
  console.log('\nCollisions (distinct authorities normalizing onto one origin):');
  for (const c of result.collisionExamples) {
    console.log(`  ${c.origin}  <=  ${c.distinct.slice(0, 4).map((d) => JSON.stringify(d)).join(' , ')}`);
  }
}

if (result.collapses > 0 || result.collisions > 0) {
  console.log('\nOffenders (accepted input that normalized onto a known ASCII target):');
  for (const c of result.collapseExamples.slice(0, 40)) {
    console.log(`  U+${c.cp.toUpperCase().padStart(4, '0')}  ${JSON.stringify(c.input)} -> ${c.origin}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nPASS: no collapse onto a known ASCII target, and no distinct authorities sharing an origin.');
}
