import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('A/K fill-service structural confinement', () => {
  it('kills extra consume/expose sites, Secret.prototype access, and redaction importer expansion', async () => {
    const files = await sourceFiles('src');
    const production = files.filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file));
    const texts = await Promise.all(production.map(async (file) => [file, await readFile(file, 'utf8')] as const));
    const valueSites = texts.filter(([file]) => file !== 'src/core/redaction.ts').flatMap(([file, source]) =>
      [...source.matchAll(/\.(?:expose|consume)\s*\(/gu)].map((match) => `${file}:${match[0]}`));
    expect(valueSites).toEqual(['src/browser/session.ts:.consume(']);
    expect(texts.flatMap(([file, source]) => source.includes('Secret.prototype') ? [file] : []))
      .toEqual([]);

    const importers = texts.flatMap(([file, source]) =>
      /from\s+['"][^'"]*redaction['"]/u.test(source) ? [file] : []);
    expect(importers).toEqual([
      'src/backends/backend.ts',
      'src/backends/localFile.ts',
      'src/browser/session.ts',
      'src/core/browserPort.ts',
      'src/core/fillService.ts',
    ]);
  });

  it('kills a core-to-browser edge and a value import of redaction in fillService.ts', async () => {
    const source = await readFile('src/core/fillService.ts', 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:\/|^)browser(?:\/|['"])/u);
    expect(source).toMatch(/import\s+type\s+\{\s*Secret\s*\}\s+from\s+['"]\.\/redaction['"]/u);
    expect(source).not.toMatch(/import\s+\{[^}]*Secret[^}]*\}\s+from\s+['"]\.\/redaction['"]/u);
  });

  it('kills source growth beyond the locked auditability limits', async () => {
    for (const file of [
      'src/core/fillService.ts',
      'src/supervisor/host.ts',
      'src/core/fillService.test.ts',
      'src/core/fillService.browser.test.ts',
      'src/supervisor/host.test.ts',
      'src/supervisor/host.browser.test.ts',
      'src/supervisor/host.timing.browser.test.ts',
    ]) {
      const lines = (await readFile(file, 'utf8')).split('\n').length;
      expect(lines, `${file} must remain under 800 lines`).toBeLessThan(800);
    }
  });
});

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(target);
  }
  return files.sort();
}
