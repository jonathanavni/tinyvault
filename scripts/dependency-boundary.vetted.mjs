import fs from 'node:fs';
import path from 'node:path';

const PROTECTED_DIRECTORIES = ['src/supervisor'];

export const VETTED_EXTERNAL_PACKAGES = [
  {
    packages: ['playwright', 'playwright-core'],
    version: '1.62.1',
    importerFiles: ['src/browser/playwright.ts'],
    directImportOnly: ['playwright'],
    reachableFrom: ['src/browser', 'testbed'],
    opaqueFiles: [
      'playwright-core/lib/coreBundle.js',
      'playwright-core/lib/utilsBundle.js',
      'playwright-core/lib/bootstrap.js',
    ],
    reason: 'browser driver; the two bundles carry non-literal and optional loads; the plaintext is handed to it by design',
  },
];

export function configureVettedPackages(root, vetted) {
  if (!Array.isArray(vetted)) {
    return { entries: [], errors: ['vetted package manifest must be an array'] };
  }
  if (vetted.length === 0) return { entries: [], errors: [] };
  const errors = [];
  const lock = readPackageLock(root, errors);
  const entries = vetted.map((entry, index) => configureVettedEntry(
    root, lock, entry, index, errors,
  ));
  return { entries, errors };
}

function configureVettedEntry(root, lock, entry, index, errors) {
  const label = `vetted manifest entry ${index}`;
  const errorsBefore = errors.length;
  const packageNames = configuredNonEmptyStrings(entry?.packages, `${label} packages`, errors);
  const directImportOnly = configuredStrings(
    entry?.directImportOnly, `${label} directImportOnly`, errors,
  );
  const reachableFrom = configuredReachableDirectories(
    root, entry?.reachableFrom, `${label} reachableFrom`, errors,
  );
  const importerFiles = configuredImporterFiles(
    root, entry?.importerFiles, `${label} importerFiles`, errors,
  );
  const opaqueFiles = configuredOpaqueFiles(
    root, entry?.opaqueFiles, `${label} opaqueFiles`, errors,
  );
  const packages = packageNames.flatMap((name) => configureVettedPackage(
    root, lock, name, entry?.version, index, errors,
  ));
  const valid = errors.length === errorsBefore;
  return {
    packages,
    directImportOnly: new Set(valid ? directImportOnly : []),
    reachableFrom: valid ? reachableFrom : [],
    importerFiles: new Set(valid ? importerFiles : []),
    opaqueFiles: new Set(valid ? opaqueFiles : []),
  };
}

function configuredStrings(value, label, errors) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${label} must be an array of strings`);
    return [];
  }
  return value;
}

function configuredNonEmptyStrings(value, label, errors) {
  const configured = configuredStrings(value, label, errors);
  if (configured.length === 0) errors.push(`${label} must not be empty`);
  return configured;
}

function configuredImporterFiles(root, value, label, errors) {
  return configuredNonEmptyStrings(value, label, errors).flatMap((relative) => {
    const linkPath = configuredLinkPath(root, relative);
    const file = configuredRepoPath(root, relative);
    if (linkPath !== undefined && file !== undefined) return [linkPath, file];
    errors.push(`${label} path is missing: ${relative}`);
    return [];
  });
}

function configuredReachableDirectories(root, value, label, errors) {
  return configuredStrings(value, label, errors).flatMap((relative) => {
    if (!isNormalizedRepoPath(relative)) {
      errors.push(`${label} path must be a normalized, non-empty, in-repo directory: ${relative}`);
      return [];
    }
    const directory = path.resolve(root, relative);
    const realDirectory = realDirectoryPath(directory);
    if (!isWithin(directory, root)
      || realDirectory === undefined
      || !isWithin(realDirectory, root)) {
      errors.push(`${label} path must be a normalized, non-empty, in-repo directory: ${relative}`);
      return [];
    }
    return [directory];
  });
}

function isNormalizedRepoPath(relative) {
  return relative.length > 0
    && !path.isAbsolute(relative)
    && path.normalize(relative) === relative;
}

function configuredOpaqueFiles(root, value, label, errors) {
  return configuredStrings(value, label, errors).flatMap((relative) => {
    const suffix = path.join('node_modules', relative);
    const file = configuredRepoPath(root, suffix);
    if (file !== undefined && realpathEndsWith(file, suffix)) return [file];
    errors.push(`${label} path is missing or has the wrong realpath suffix: ${relative}`);
    return [];
  });
}

function configuredRepoPath(root, relative) {
  const linkPath = configuredLinkPath(root, relative);
  if (linkPath === undefined) return undefined;
  return realFilePath(linkPath);
}

function configuredLinkPath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) return undefined;
  const linkPath = path.resolve(root, relative);
  return isAtOrWithin(linkPath, root) ? linkPath : undefined;
}

function readPackageLock(root, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  } catch {
    errors.push('package-lock.json is missing or invalid for vetted packages');
    return {};
  }
}

function configureVettedPackage(root, lock, name, version, index, errors) {
  const label = `vetted manifest entry ${index} package ${name}`;
  const packageJson = readInstalledPackage(root, name);
  if (packageJson === undefined) {
    errors.push(`${label} is not installed`);
    return [];
  }
  if (typeof version !== 'string' || packageJson.contents.version !== version) {
    errors.push(`${label} version mismatch: expected ${String(version)}, found ${packageJson.contents.version}`);
  }
  validateLockedPackage(lock, name, version, label, errors);
  return [{ name, root: packageJson.directory }];
}

function readInstalledPackage(root, name) {
  const packageFile = path.join(root, 'node_modules', name, 'package.json');
  try {
    const contents = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    return { contents, directory: fs.realpathSync(path.dirname(packageFile)) };
  } catch {
    return undefined;
  }
}

function validateLockedPackage(lock, name, version, label, errors) {
  const locked = lock.packages?.[`node_modules/${name}`];
  if (locked?.version !== version) {
    errors.push(`${label} lockfile version mismatch: expected ${String(version)}, found ${String(locked?.version)}`);
  }
  if (typeof locked?.integrity !== 'string' || locked.integrity.length === 0) {
    errors.push(`${label} lockfile integrity is missing`);
  }
}

export function zoneConfigurationErrors(root, locationsByRealPath) {
  const errors = [];
  for (const [realPath, locations] of locationsByRealPath) {
    const zones = new Set([...locations].map((location) => sourceZone(location, root)).filter(Boolean));
    if (zones.size < 2) continue;
    errors.push(
      `source file resolves across zones (${[...zones].sort().join(', ')}): ${formatBoundaryPath(root, realPath)}`,
    );
  }
  return errors;
}

function sourceZone(file, root) {
  if (PROTECTED_DIRECTORIES.some((directory) => isWithin(file, path.join(root, directory)))) {
    return 'protected';
  }
  if (isWithin(file, path.join(root, 'src/browser'))) return 'src/browser';
  if (isWithin(file, path.join(root, 'src'))) return 'data plane';
  if (isWithin(file, path.join(root, 'testbed'))) return 'evaluator';
  if (isWithin(file, path.join(root, 'scripts'))) return 'tooling';
  return undefined;
}

export function isWithin(file, directory) {
  const relative = path.relative(directory, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function isAtOrWithin(file, directory) {
  return path.resolve(file) === path.resolve(directory) || isWithin(file, directory);
}

export function realpathEndsWith(realFile, suffix) {
  const normalizedRealFile = path.resolve(realFile).split(path.sep).join('/');
  const normalizedSuffix = suffix.split(path.sep).join('/');
  return normalizedRealFile.endsWith(`/${normalizedSuffix}`);
}

function formatBoundaryPath(root, file) {
  const absoluteFile = path.resolve(file);
  const absoluteRoot = realDirectoryPath(root) ?? path.resolve(root);
  if (isAtOrWithin(absoluteFile, absoluteRoot)) {
    return path.relative(absoluteRoot, absoluteFile) || '.';
  }
  const segments = absoluteFile.split(path.sep);
  const nodeModulesIndex = segments.lastIndexOf('node_modules');
  if (nodeModulesIndex >= 0) {
    const suffix = segments.slice(nodeModulesIndex).join(path.sep);
    if (realpathEndsWith(absoluteFile, suffix)) return suffix;
  }
  return absoluteFile;
}

export function realFilePath(file) {
  try {
    const target = fs.realpathSync(path.resolve(file));
    return fs.statSync(target).isFile() ? target : undefined;
  } catch {
    return undefined;
  }
}

export function realDirectoryPath(directory) {
  try {
    const target = fs.realpathSync(path.resolve(directory));
    return fs.statSync(target).isDirectory() ? target : undefined;
  } catch {
    return undefined;
  }
}
