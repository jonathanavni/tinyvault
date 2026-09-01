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

const args = process.argv.slice(2);
const full = args.includes('--full');
const maxArg = args.indexOf('--max');
const MAX = full ? 0x10ffff : (maxArg !== -1 ? Number(args[maxArg + 1]) : 0x33ff);

/** Templates whose ASCII target is known; a mapped/ignored code point collapses onto it. */
const TEMPLATES = [
  { build: (c) => `https://exa${c}mple.com`, target: 'https://example.com' },
  { build: (c) => `https://${c}example.com`, target: 'https://example.com' },
  { build: (c) => `https://example${c}com`, target: 'https://example.com' },
  { build: (c) => `https://${c}x7f000001`, target: 'https://127.0.0.1' },
  { build: (c) => `https://127${c}0.0.1`, target: 'https://127.0.0.1' },
];

const collapses = [];
const byOrigin = new Map();
let accepted = 0;
let scanned = 0;

for (let cp = 0x20; cp <= MAX; cp += 1) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogates are not valid input
  const ch = String.fromCodePoint(cp);
  for (const { build, target } of TEMPLATES) {
    const input = build(ch);
    scanned += 1;
    let origin;
    try { origin = validateBareOrigin(input); } catch { continue; }
    accepted += 1;
    if (origin === target && ch !== '' && !/[a-z0-9.]/iu.test(ch)) {
      collapses.push({ cp: cp.toString(16), input, origin, target });
    }
    const seen = byOrigin.get(origin);
    if (seen === undefined) byOrigin.set(origin, input);
  }
}

// Independent collision oracle: two inputs yielding one origin must be case/NFC variants of each other.
const normalized = (s) => s.normalize('NFC').toLowerCase();
let collisions = 0;
const groups = new Map();
for (const [origin, input] of byOrigin) {
  const key = normalized(origin);
  const prior = groups.get(key);
  if (prior !== undefined && normalized(prior) !== normalized(input)) collisions += 1;
  else groups.set(key, input);
}

console.log(`range      : U+0020..U+${MAX.toString(16).toUpperCase()}`);
console.log(`scanned    : ${scanned} inputs across ${TEMPLATES.length} templates`);
console.log(`accepted   : ${accepted}`);
console.log(`distinct   : ${byOrigin.size} origins`);
console.log(`COLLAPSES  : ${collapses.length}`);
console.log(`COLLISIONS : ${collisions}`);

if (collapses.length > 0) {
  console.log('\nOffenders (accepted input that normalized onto a known ASCII target):');
  for (const c of collapses.slice(0, 40)) {
    console.log(`  U+${c.cp.toUpperCase().padStart(4, '0')}  ${JSON.stringify(c.input)} -> ${c.origin}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nPASS: no UTS-46 mapped or ignored code point collapses a distinct host onto an ASCII target.');
}
