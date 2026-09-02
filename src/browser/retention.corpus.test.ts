import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { retentionViolations } from '../../scripts/retention/rules';


describe('secret-retention named mutant corpus', () => {
  it('keeps the retention rule files and inspectSecretUses within their review budgets', async () => {
    for (const path of [
      'src/browser/retention.test.ts',
      'src/browser/retention.corpus.test.ts',
      'src/browser/retention.round8.test.ts',
      'scripts/retention/rules.ts',
      'scripts/retention/round8.rules.ts',
      'scripts/retention/allowlists.ts',
    ]) {
      expect((await readFile(resolve(path), 'utf8')).split('\n').length - 1, path).toBeLessThanOrEqual(800);
    }
    const source = await readFile(resolve('scripts/retention/rules.ts'), 'utf8');
    const start = source.indexOf('function inspectSecretUses(');
    const end = source.indexOf('\n}\n\nfunction inspectTaintedUses', start) + 2;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end).split('\n').length).toBeLessThanOrEqual(50);
    const roundEight = await readFile(resolve('scripts/retention/round8.rules.ts'), 'utf8');
    const sinkStart = roundEight.indexOf('function inspectCdpSink(');
    const sinkEnd = roundEight.indexOf('\n}\n\nfunction classifyCdpStatement', sinkStart) + 2;
    expect(sinkStart).toBeGreaterThanOrEqual(0);
    expect(roundEight.slice(sinkStart, sinkEnd).split('\n').length).toBeLessThanOrEqual(50);
  });

  it('allows only const locals, analysed pure helpers, and the one local CDP sink', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    expect(source).toContain(marker);
    const mutants = [
      ['original property', source.replace(marker, `${marker}\n    this.#lastPadded = hex;`)],
      ['original helper call', source.replace(marker, `${marker}\n    retain(hex);`)],
      ['original derived length', source.replace(marker, `${marker}\n    this.#lastLen = value.length;`)],
      ['original destructuring', source.replace(marker,
        `${marker}\n    const { length } = value;\n    moduleStash = length;`)],
      ['original module let', `let moduleStash;\n${source.replace(marker,
        `${marker}\n    moduleStash = hex;`)}`],
      ['template propagation', source.replace(marker, `${marker}\n    retain(\`${'${value}'}\`);`)],
      ['spread propagation', source.replace(marker, `${marker}\n    retain([...value]);`)],
      ['arguments propagation', source.replace(marker, `${marker}\n    retain(arguments);`)],
      ['M-A taint entry property', source.replace(
        'state.taint.push({ identity, backendNodeId, epoch: state.epoch });',
        'state.taint.push({ identity, backendNodeId, epoch: state.epoch, keep: value });',
      )],
      ['M-B non-allowlisted encoder', `let moduleStash;\nfunction leakEncode(input: string) {\n`
        + `  moduleStash = input;\n  return toFixedHex(input);\n}\n${source.replace(
          'const hex = toFixedHex(value);', 'const hex = leakEncode(value);',
        )}`],
      ['M-C toFixedHex stash', `let moduleStash;\n${source.replace(
        'function toFixedHex(value: string): string {',
        'function toFixedHex(value: string): string {\n  moduleStash = value;',
      )}`],
      ['computed assignment key', source.replace(marker,
        `${marker}\n    const retainedByKey: Record<string, boolean> = {};\n`
          + '    retainedByKey[value] = true;')],
      ['receiver-agnostic String sink', source.replace(marker,
        `${marker}\n    (globalThis as any).sink.String(value);`)],
      ['receiver-agnostic callFunctionOn sink', source.replace(marker,
        `${marker}\n    (globalThis as any).sink.callFunctionOn(value);`)],
      ['receiver-agnostic toFixedHex sink', source.replace(marker,
        `${marker}\n    (globalThis as any).sink.toFixedHex(value);`)],
    ] as const;
    for (const [name, mutant] of mutants) {
      expect(retentionViolations(mutant, fileName), name).not.toEqual([]);
    }
  });

  it('kills final-round tainted-string retention mutants S1 through S15', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const injectMarker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    const helperMarker = "  const padded = value.padEnd(MAX_SECRET_CODE_UNITS, 'A');";
    const mutants = [
      ['S1 replace callback', `let moduleStash = '';\n${source.replace(injectMarker,
        `${injectMarker}\n    value.replace(/[\\s\\S]/gu, u => { moduleStash += u; return u; });`)}`],
      ['S2 array forEach', `let moduleStash = '';\n${source.replace(injectMarker,
        `${injectMarker}\n    [hex].forEach(h => { moduleStash = h; });`)}`],
      ['S3 split callback', `const moduleUnits: string[] = [];\n${source.replace(injectMarker,
        `${injectMarker}\n    value.split('').forEach(u => moduleUnits.push(u));`)}`],
      ['S4 throw derived hex', source.replace(injectMarker,
        `${injectMarker}\n    if (state.epoch < 0) throw hex;`)],
      ['S5 helper throw', source.replace(
        'function toFixedHex(value: string): string {',
        'function toFixedHex(value: string): string {\n  if (value.length < 0) throw value;',
      )],
      ['S6 shadowed String function', `let shadowStash: unknown;\nfunction String(input: unknown) {\n`
        + `  shadowStash = input; return \`${'${input}'}\`;\n}\n${source.replace(injectMarker,
          `${injectMarker}\n    void String(value);`)}`],
      ['S7 for-of source', `let moduleStash = '';\n${source.replace(injectMarker,
        `${injectMarker}\n    for (const ch of value) moduleStash += ch;`)}`],
      ['S8 prototype accessor', source.replace(injectMarker,
        `${injectMarker}\n    void value.captureForTest;`)],
      ['S9 helper for-of source', `let probeStash = '';\n${source.replace(helperMarker,
        `${helperMarker}\n  for (const unit of padded) probeStash += unit;`)}`],
      ['S10 helper prototype accessor', source.replace(helperMarker,
        `${helperMarker}\n  void (padded as any).captureForTest;`)],
      ['S11 helper replace callback', `let probeStash = '';\n${source.replace(helperMarker,
        `${helperMarker}\n  padded.replace(/[\\s\\S]/gu, u => { probeStash += u; return u; });`)}`],
      ['S12 helper module callback', `let probeStash = '';\nfunction captureUnit(unit: string) {\n`
        + `  probeStash += unit; return unit;\n}\n${source.replace(helperMarker,
          `${helperMarker}\n  value.replace(/[\\s\\S]/gu, captureUnit);`)}`],
      ['S13 module const String', `let stash: unknown;\nconst String = (v: unknown) => {\n`
        + `  stash = globalThis.String(v); return \`${'${v}'}\`;\n};\n${source}`],
      ['S14 local toFixedHex arrow', `let stash: unknown;\n${source.replace(
        '    const hex = toFixedHex(value);',
        '    const toFixedHex = (v: string) => { stash = v; return globalThis.String(v); };\n'
          + '    const hex = toFixedHex(value);',
      )}`],
      ['S15 local callFunctionOn wrapper', `let stash: unknown;\n${source.replace(
        '    const out = await callFunctionOn<unknown>',
        '    const callFunctionOn = (...args: any[]) => { stash = args[1]; return args[0]; };\n'
          + '    const out = await callFunctionOn<unknown>',
      )}`],
    ] as const;
    for (const [name, mutant] of mutants) {
      expect(retentionViolations(mutant, fileName), name).not.toEqual([]);
    }
  });

  it('kills round-eight mutants S16 through S22 by their named assertions', async () => {
    const sessionName = 'src/browser/session.ts';
    const session = await readFile(resolve(sessionName), 'utf8');
    const injectMarker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    const sinkMarker = '): Promise<T> {\n  const response = await cdp.send';
    const localName = 'src/backends/localFile.ts';
    const local = await readFile(resolve(localName), 'utf8');
    const secretMarker = "      return new Secret(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));";
    const sessionMutants = [
      // S16/S17 are killed by the loop-condition prohibition, independently of the write sink.
      ['S16 length loop condition', `let moduleCounter = 0;\n${session.replace(injectMarker,
        `${injectMarker}\n    for (let i = 0; i < value.length; i += 1) moduleCounter += 1;`)}`],
      ['S17 charCodeAt loop condition', `let moduleCounter = 0;\n${session.replace(injectMarker,
        `${injectMarker}\n    for (let i = 0; i < value.charCodeAt(0); i += 1) moduleCounter += 1;`)}`],
      // S18/S19 are killed by the fixed-return-if consequent assertion; S19 also pins includes context.
      ['S18 charCodeAt non-local conditional write', `let moduleStash = '';\n${session.replace(injectMarker,
        `${injectMarker}\n    if (value.charCodeAt(0) === 115) moduleStash = 's';`)}`],
      ['S19 includes non-local conditional write', `let zzBit = 0;\n${session.replace(injectMarker,
        `${injectMarker}\n    if (value.includes('\\n')) zzBit = 1;`)}`],
      // S20 is killed by the callFunctionOn parameter-derived non-escape assertion.
      ['S20 callFunctionOn argument stash', `const zzStash: string[] = [];\n${session.replace(
        sinkMarker,
        `): Promise<T> {\n  zzStash.push(JSON.stringify(args));\n  const response = await cdp.send`,
      )}`],
      // S21 is killed by the direct PropertyAccessExpression .consume assertion.
      ['S21 computed Secret access', session.replace(
        '  const value = secret.consume();',
        "  const value = (secret as unknown as Record<string, () => string>)['expo' + 'se']();",
      )],
    ] as const;
    for (const [name, mutant] of sessionMutants) {
      expect(retentionViolations(mutant, sessionName), name).not.toEqual([]);
    }

    // S22 is killed by localFile.ts's exact fail-closed plaintext occurrence list.
    const localMutant = `const zzStash: Uint8Array[] = [];\n${local.replace(
      secretMarker, `      zzStash.push(plaintext);\n${secretMarker}`,
    )}`;
    expect(retentionViolations(localMutant, localName), 'S22 local-file plaintext stash').not.toEqual([]);
  });

  it('kills final syntactic-round mutants S23 through S27', async () => {
    const sessionName = 'src/browser/session.ts';
    const session = await readFile(resolve(sessionName), 'utf8');
    const injectMarker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    const returnMarker = '  return response.result?.value as T;';
    const guard = "  if (response.exceptionDetails !== undefined || !Object.hasOwn(response.result ?? {}, 'value')) {\n"
      + "    throw new Error('Browser function failed');\n  }\n";
    const mutants = [
      ['S23 taint in nested try/finally', session.replace(injectMarker,
        `${injectMarker}\n    try {\n      if (value.includes('\\n')) return unplaceableOutcome();\n`
          + '    } finally {\n      void 0;\n    }')],
      ['S24 CDP return accessor exposes args', session.replace(returnMarker,
        '  return { get argsForTest() { return args; } } as T;')],
      ['S26 non-allowlisted includes', session.replace(injectMarker,
        `${injectMarker}\n    if (value.includes('s')) return unplaceableOutcome();`)],
      ['S27 length-derived state write', session.replace(injectMarker,
        `${injectMarker}\n    const n = value.length;\n    state.epoch = n;`)],
      ['J-Q2 removed CDP guard', session.replace(guard, '')],
    ] as const;
    for (const [name, mutant] of mutants) {
      expect(retentionViolations(mutant, sessionName), name).not.toEqual([]);
    }

    const localName = 'src/backends/localFile.ts';
    const local = await readFile(resolve(localName), 'utf8');
    const construction = "      return new Secret(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));";
    const localMutant = local.replace(construction,
      "      const secret = new Secret(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));\n"
      + "      secret.consume = () => 'overridden';\n      return secret;");
    expect(retentionViolations(localMutant, localName), 'S25 Secret.consume override').not.toEqual([]);
  });

  it('kills expanded-file-set mutants S28 through S30', async () => {
    const localName = 'src/backends/localFile.ts';
    const local = await readFile(resolve(localName), 'utf8');
    const keyMarker = '    key = await fs.readFile(keyPath);';
    const s28 = `const zzStash: Uint8Array[] = [];\n${local.replace(
      keyMarker, `${keyMarker}\n      zzStash.push(key);`,
    )}`;
    expect(retentionViolations(s28, localName), 'S28 openRecordSecret key stash').not.toEqual([]);

    const redactionName = 'src/core/redaction.ts';
    const redaction = await readFile(resolve(redactionName), 'utf8');
    const valueMarker = '    const value = this.expose();';
    const s29 = `let zzStash = '';\n${redaction.replace(
      valueMarker, `${valueMarker}\n    zzStash = value;`,
    )}`;
    expect(retentionViolations(s29, redactionName), 'S29 Secret.consume stash').not.toEqual([]);

    const sodiumName = 'src/backends/localFileSodium.ts';
    const sodium = await readFile(resolve(sodiumName), 'utf8');
    const s30 = `const zzStash: Uint8Array[] = [];\n${sodium
      .replace('    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(',
        '    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(')
      .replace('      key,\n    );\n  },\n  async memzero',
        '      key,\n    );\n    zzStash.push(plaintext);\n    return plaintext;\n  },\n  async memzero')}`;
    expect(retentionViolations(s30, sodiumName), 'S30 sodium open stash').not.toEqual([]);
  });

  it('kills propertyReadAllowed and fixed-consequent checker mutants by source shape', async () => {
    const source = await readFile(resolve('scripts/retention/round8.rules.ts'), 'utf8');
    const start = source.indexOf('function propertyReadAllowed(');
    const end = source.indexOf('\n}\n\nfunction isStringConstInitializer', start) + 2;
    const body = source.slice(start, end);
    expect(body).toContain("access.name.text === 'includes'");
    expect(body).toContain("argument.text === '\\n' || argument.text === '\\r'");
    expect(body).toContain('isRoundEightConditionOccurrence(identifier, owner)');
    expect(body).not.toMatch(/\{\s*return true;\s*\}/u);
    expect(source).toContain("'tooLongOutcome', 'unplaceableOutcome', 'transportOutcome'");
  });

  it('demonstrates that the S8 accessor can recover the source string at runtime', () => {
    let stash = '';
    Object.defineProperty(String.prototype, 'captureForTest', {
      configurable: true,
      get() { stash = String(this); return undefined; },
    });
    try {
      void ('S8-runtime-canary' as any).captureForTest;
      expect(stash).toBe('S8-runtime-canary');
    } finally {
      Reflect.deleteProperty(String.prototype, 'captureForTest');
    }
  });
});
