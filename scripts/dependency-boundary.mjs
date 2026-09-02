import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// The four zones are data plane (`src/**` except protected modules), control plane (`src/supervisor/**`),
// evaluator (`testbed/**`), and tooling (`scripts/**`). Every reachable external module is traversed.
// Data-plane entries may not reach the control plane or tooling; evaluator entries may reach the control plane;
// tooling keeps its package-local tolerance; vetted packages add only their manifest-scoped exceptions.
// Residual: the two Playwright bundles are opaque; the gate proves no scanned or resolved path through them.

const FLAG_ERROR = 'dependency gate requires --experimental-import-meta-resolve';
const flagProbe = import.meta.resolve(
  './probe.mjs',
  'file:///tinyvault-flag-probe/parent.mjs',
);
if (!flagProbe.startsWith('file:///tinyvault-flag-probe/')) throw new Error(FLAG_ERROR);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const PROTECTED_DIRECTORIES = ['src/supervisor'];
const BUILTIN_MODULES = new Set(builtinModules.map((specifier) => specifier.replace(/^node:/u, '')));
const MAX_EXTERNAL_MODULES = 10_000;
const GATE_MODULE = fs.realpathSync(fileURLToPath(import.meta.url));

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
    ],
    reason: 'browser driver; the two bundles carry non-literal and optional loads; the plaintext is handed to it by design',
  },
];

export function checkDependencyBoundary(
  root,
  { vetted = VETTED_EXTERNAL_PACKAGES } = {},
) {
  const absoluteRoot = fs.realpathSync(path.resolve(root));
  const { files: configuredFiles, errors, options } = configuredProductionFiles(absoluteRoot);
  const scriptsDirectory = path.join(absoluteRoot, 'scripts');
  const protectedRealPaths = new Set();
  const canonicalConfiguredFiles = canonicalizeFiles(
    configuredFiles, absoluteRoot, protectedRealPaths,
  );
  const scriptFiles = canonicalizeFiles(
    walk(scriptsDirectory).filter(isProductionModule), absoluteRoot, protectedRealPaths,
  );
  const files = [...new Set([...canonicalConfiguredFiles, ...scriptFiles])];
  const fileSet = new Set(files);
  const graph = buildGraph(files, fileSet, options);
  const roots = files.filter((file) => !isProtected(file, absoluteRoot, protectedRealPaths));
  const vettedConfiguration = configureVettedPackages(absoluteRoot, vetted);
  const configurationErrors = [...errors, ...vettedConfiguration.errors];
  const violations = configurationErrors.map(
    (message) => configurationViolation(absoluteRoot, message),
  );
  addConfigurationViolations(
    violations, absoluteRoot, files, roots, protectedRealPaths,
  );
  addVettedImporterViolations(
    violations, files, graph, vettedConfiguration.entries,
  );

  const context = {
    graph,
    scriptsDirectory,
    absoluteRoot,
    protectedRealPaths,
    vetted: vettedConfiguration.entries,
  };
  for (const entry of roots) violations.push(...walkEntry(entry, context));

  return { files: files.length, roots: roots.length, violations: dedupeViolations(violations) };
}

function addConfigurationViolations(violations, root, files, roots, protectedRealPaths) {
  for (const protectedDirectory of PROTECTED_DIRECTORIES) {
    const absoluteDirectory = path.join(root, protectedDirectory);
    const protectedFiles = files.filter((file) => isProtected(file, root, protectedRealPaths));
    if (!fs.existsSync(absoluteDirectory) || protectedFiles.length === 0) {
      violations.push(configurationViolation(
        root, `protected directory has no production module: ${protectedDirectory}`,
      ));
    }
  }
  if (files.length === 0) {
    violations.push(configurationViolation(root, 'production scan resolved zero files'));
  }
  if (roots.length === 0) {
    violations.push(configurationViolation(root, 'data-plane scan resolved zero roots'));
  }
}

function configureVettedPackages(root, vetted) {
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
  const packageNames = configuredStrings(entry?.packages, `${label} packages`, errors);
  const directImportOnly = configuredStrings(
    entry?.directImportOnly, `${label} directImportOnly`, errors,
  );
  const reachableFrom = configuredStrings(entry?.reachableFrom, `${label} reachableFrom`, errors)
    .map((relative) => path.join(root, relative));
  const importerFiles = configuredFiles(
    root, entry?.importerFiles, `${label} importerFiles`, errors,
  );
  const opaqueFiles = configuredOpaqueFiles(
    root, entry?.opaqueFiles, `${label} opaqueFiles`, errors,
  );
  const packages = packageNames.flatMap((name) => configureVettedPackage(
    root, lock, name, entry?.version, index, errors,
  ));
  return {
    packages,
    packageNames: new Set(packageNames),
    directImportOnly: new Set(directImportOnly),
    reachableFrom,
    importerFiles: new Set(importerFiles),
    opaqueFiles: new Set(opaqueFiles),
  };
}

function configuredStrings(value, label, errors) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${label} must be an array of strings`);
    return [];
  }
  return value;
}

function configuredFiles(root, value, label, errors) {
  return configuredStrings(value, label, errors).flatMap((relative) => {
    const file = configuredRepoPath(root, relative);
    if (file !== undefined) return [file];
    errors.push(`${label} path is missing: ${relative}`);
    return [];
  });
}

function configuredOpaqueFiles(root, value, label, errors) {
  return configuredStrings(value, label, errors).flatMap((relative) => {
    const file = configuredRepoPath(root, path.join('node_modules', relative));
    if (file !== undefined && realpathEndsWith(file, path.join('node_modules', relative))) {
      return [file];
    }
    errors.push(`${label} path is missing or has the wrong realpath suffix: ${relative}`);
    return [];
  });
}

function configuredRepoPath(root, relative) {
  if (path.isAbsolute(relative)) return undefined;
  const linkPath = path.resolve(root, relative);
  if (!isAtOrWithin(linkPath, root)) return undefined;
  return realFilePath(linkPath);
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

function addVettedImporterViolations(violations, files, graph, vetted) {
  for (const importer of files) {
    for (const edge of graph.get(importer)?.edges ?? []) {
      if (edge.unresolved || edge.unscanned) continue;
      const owner = vettedPackageForFile(edge.target, vetted);
      if (owner === undefined) continue;
      const dependencyPath = [importer, edge.target];
      if (!owner.manifest.importerFiles.has(importer)) {
        violations.push(edgeViolation(
          importer, edge.target, `vetted package importer file: ${owner.name}`, dependencyPath,
        ));
      }
      if (!owner.manifest.directImportOnly.has(owner.name)) {
        violations.push(edgeViolation(
          importer, edge.target, `vetted package direct import forbidden: ${owner.name}`, dependencyPath,
        ));
      }
    }
  }
}

function walkEntry(entry, context) {
  const { graph } = context;
  const violations = [];
  const queue = [{ file: entry, dependencyPath: [entry] }];
  const visited = new Set([entry]);
  while (queue.length > 0) {
    const current = queue.shift();
    const node = graph.get(current.file);
    if (node === undefined) {
      // Unreachable by construction — every external target receives a graph node (see addExternalEntry);
      // kept fail-closed.
      if (!toleratesTraversalIssue(entry, current.file, 'external-package', context)) {
        violations.push(edgeViolation(entry, current.file, 'unscanned module', current.dependencyPath));
      }
      continue;
    }
    for (const syntax of node.unsupported) {
      if (!toleratesTraversalIssue(entry, current.file, syntax, context)) {
        violations.push(edgeViolation(entry, current.file, syntax, current.dependencyPath));
      }
    }
    for (const edge of node.edges) {
      const dependencyPath = [...current.dependencyPath, edge.target];
      const classification = classifyEdge(edge, entry, current.file, dependencyPath, context);
      violations.push(...classification.violations);
      if (classification.traverse && !visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push({ file: edge.target, dependencyPath });
      }
    }
  }
  return violations;
}

function classifyEdge(edge, entry, currentFile, dependencyPath, context) {
  const { scriptsDirectory, absoluteRoot, protectedRealPaths } = context;
  const violations = [];
  if (!isWithin(entry, scriptsDirectory) && isWithin(edge.target, scriptsDirectory)) {
    violations.push(edgeViolation(
      entry, edge.target, `production-to-tooling ${edge.syntax}`, dependencyPath,
    ));
  }
  violations.push(...classifyVettedReach(
    edge, entry, dependencyPath, context,
  ));
  if (edge.unresolved) {
    if (!toleratesTraversalIssue(entry, currentFile, edge.syntax, context)) {
      violations.push(edgeViolation(
        entry,
        currentFile,
        edge.unresolvedSyntax ?? `unresolved relative ${edge.syntax}`,
        dependencyPath.slice(0, -1),
      ));
    }
    return { violations, traverse: false };
  }
  if (edge.unscanned) {
    if (!toleratesTraversalIssue(entry, currentFile, edge.syntax, context)) {
      violations.push(edgeViolation(entry, edge.target, `unscanned ${edge.syntax}`, dependencyPath));
    }
    return { violations, traverse: false };
  }
  if (isProtected(edge.target, absoluteRoot, protectedRealPaths)) {
    if (!isEvaluatorEntry(entry, absoluteRoot)) {
      violations.push(edgeViolation(entry, edge.target, edge.syntax, dependencyPath));
      return { violations, traverse: false };
    }
  }
  return { violations, traverse: true };
}

function classifyVettedReach(edge, entry, dependencyPath, context) {
  if (edge.unresolved || edge.unscanned) return [];
  const owner = vettedPackageForFile(edge.target, context.vetted);
  if (owner === undefined) return [];
  const violations = [];
  if (!entryMayReachVetted(entry, owner.manifest, context)) {
    violations.push(edgeViolation(
      entry, edge.target, `vetted package unreachable from entry: ${owner.name}`, dependencyPath,
    ));
  }
  return violations;
}

function entryMayReachVetted(entry, manifest, context) {
  if (isEvaluatorEntry(entry, context.absoluteRoot)) return true;
  if (isProtected(entry, context.absoluteRoot, context.protectedRealPaths)) return true;
  return manifest.reachableFrom.some((allowed) => isAtOrWithin(entry, allowed));
}

function isEvaluatorEntry(entry, root) {
  return isWithin(entry, path.join(root, 'testbed'));
}

function vettedPackageForFile(file, manifests) {
  for (const manifest of manifests) {
    for (const configuredPackage of manifest.packages) {
      if (isAtOrWithin(file, configuredPackage.root)) {
        return { name: configuredPackage.name, manifest };
      }
    }
  }
  return undefined;
}

function edgeViolation(entry, target, syntax, dependencyPath) {
  return { entry, target, syntax, path: dependencyPath };
}

export function formatViolations(root, violations) {
  return violations.map((violation) => {
    const relativePath = violation.path.map((file) => path.relative(root, file) || '.').join(' -> ');
    return `${violation.syntax}: ${relativePath}`;
  });
}

function configuredProductionFiles(root) {
  const configPath = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    return { files: [], errors: ['tsconfig.json was not found'], options: {} };
  }
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error !== undefined) {
    return { files: [], errors: [formatDiagnostic(read.error)], options: {} };
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
  return {
    files: parsed.fileNames.filter(isProductionModule),
    errors: parsed.errors.map(formatDiagnostic),
    options: parsed.options,
  };
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function isProductionModule(file) {
  return SOURCE_EXTENSIONS.includes(path.extname(file))
    && !/\.(?:test|spec)\.[^.]+$/u.test(file)
    && !file.endsWith('.d.ts');
}

function canonicalizeFiles(files, root, protectedRealPaths) {
  return files.map((file) => {
    const linkPath = path.resolve(file);
    const realPath = canonicalFile(linkPath);
    if (isProtected(linkPath, root, new Set())) protectedRealPaths.add(realPath);
    return realPath;
  });
}

function isProtected(file, root, protectedRealPaths) {
  if (protectedRealPaths.has(file)) return true;
  return PROTECTED_DIRECTORIES.some((directory) => isWithin(file, path.join(root, directory)));
}

function isWithin(file, directory) {
  const relative = path.relative(directory, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isAtOrWithin(file, directory) {
  return path.resolve(file) === path.resolve(directory) || isWithin(file, directory);
}

function realpathEndsWith(realFile, suffix) {
  const normalizedRealFile = path.resolve(realFile).split(path.sep).join('/');
  const normalizedSuffix = suffix.split(path.sep).join('/');
  return normalizedRealFile.endsWith(`/${normalizedSuffix}`);
}

function buildGraph(files, fileSet, compilerOptions) {
  const graph = new Map();
  const visitedExternalFiles = new Set();
  for (const file of files) {
    const parsed = dependencies(file, fs.readFileSync(file, 'utf8'));
    const edges = parsed.edges.flatMap(({ specifier, syntax }) => {
      if (isBuiltinSpecifier(specifier)) return [];
      const target = resolveSpecifier(file, specifier, syntax, fileSet, compilerOptions);
      if (target === undefined) return [unresolvedEdge(file, specifier, syntax)];
      if (!fileSet.has(target) && !specifier.startsWith('.')) {
        addExternalEntry(graph, target, fileSet, compilerOptions, visitedExternalFiles);
      }
      return [{
        target,
        syntax,
        unresolved: false,
        unscanned: !fileSet.has(target) && !visitedExternalFiles.has(target),
      }];
    });
    graph.set(file, { edges, unsupported: parsed.unsupported });
  }
  return graph;
}

function unresolvedEdge(file, specifier, syntax) {
  return {
    target: path.resolve(path.dirname(file), specifier),
    syntax,
    unresolvedSyntax: `${specifier.startsWith('.') ? 'unresolved relative' : 'unresolved'} ${syntax}: ${specifier}`,
    unresolved: true,
    unscanned: false,
  };
}

function dependencies(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edges = [];
  const unsupported = [];
  const isGateImplementation = realFilePath(file) === GATE_MODULE;
  const addLiteral = (node, syntax) => {
    if (node && ts.isStringLiteralLike(node)) {
      edges.push({ specifier: node.text, syntax });
    } else {
      unsupported.push(`non-literal ${syntax}`);
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      addLiteral(node.moduleSpecifier, 'static import');
      if (isCreateRequireImport(node) && !isGateImplementation) unsupported.push('createRequire access');
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      addLiteral(node.moduleSpecifier, 're-export');
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)) {
      addLiteral(node.moduleReference.expression, 'import = require()');
    }
    if (ts.isVariableDeclaration(node) && isRequireAlias(node.initializer)) {
      unsupported.push('aliased require access');
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addLiteral(node.arguments[0], 'dynamic import()');
      } else if (isRequireExpression(node.expression)) {
        addLiteral(node.arguments[0], 'require-style access');
      } else if (isCreateRequireExpression(node.expression) && !isGateImplementation) {
        unsupported.push('createRequire access');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { edges, unsupported };
}

function isCreateRequireImport(node) {
  if (!ts.isStringLiteralLike(node.moduleSpecifier)
    || !['node:module', 'module'].includes(node.moduleSpecifier.text)) return false;
  const bindings = node.importClause?.namedBindings;
  return bindings !== undefined
    && ts.isNamedImports(bindings)
    && bindings.elements.some((element) => (element.propertyName ?? element.name).text === 'createRequire');
}

function isRequireAlias(initializer) {
  return initializer !== undefined
    && ((ts.isIdentifier(initializer) && initializer.text === 'require')
      || (ts.isPropertyAccessExpression(initializer) && initializer.name.text === 'require'));
}

function isRequireExpression(expression) {
  return (ts.isIdentifier(expression) && expression.text === 'require')
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === 'require');
}

function isCreateRequireExpression(expression) {
  return (ts.isIdentifier(expression) && expression.text === 'createRequire')
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === 'createRequire');
}

function resolveSpecifier(importer, specifier, syntax, fileSet, compilerOptions) {
  const compilerResolved = ts.resolveModuleName(
    specifier,
    importer,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (compilerResolved !== undefined) {
    const target = realFilePath(compilerResolved);
    if (target !== undefined && !isDeclarationFile(target) && fileSet.has(target)) return target;
  }

  if (fileSet.has(path.resolve(importer)) && specifier.startsWith('.')) {
    const unresolved = path.resolve(path.dirname(importer), specifier);
    const candidates = [unresolved];
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${unresolved}${extension}`);
    if (/\.(?:js|mjs|cjs)$/u.test(unresolved)) {
      const stem = unresolved.replace(/\.(?:js|mjs|cjs)$/u, '');
      candidates.push(`${stem}.ts`, `${stem}.mts`, `${stem}.cts`);
    }
    for (const extension of SOURCE_EXTENSIONS) candidates.push(path.join(unresolved, `index${extension}`));
    const inRepoTarget = candidates
      .map((candidate) => realFilePath(candidate))
      .find((candidate) => candidate !== undefined
        && fileSet.has(candidate)
        && !isDeclarationFile(candidate));
    if (inRepoTarget !== undefined) return inRepoTarget;
  }

  return resolveRuntimeSpecifier(importer, specifier, syntax);
}

function addExternalEntry(graph, file, fileSet, compilerOptions, visited) {
  const pending = [realFilePath(file)];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = scanExternalFile(current, fileSet, compilerOptions, visited.size);
    graph.set(current, node);
    pending.push(...node.pending);
  }
}

function scanExternalFile(current, fileSet, compilerOptions, visitedCount) {
  if (visitedCount > MAX_EXTERNAL_MODULES) {
    return {
      edges: [], pending: [],
      unsupported: [`external package traversal exceeded ${MAX_EXTERNAL_MODULES} modules`],
    };
  }
  if (path.extname(current) === '.json') return { edges: [], unsupported: [], pending: [] };

  let parsed;
  try {
    parsed = dependencies(current, fs.readFileSync(current, 'utf8'));
  } catch (error) {
    return { edges: [], pending: [], unsupported: [`unreadable external module: ${error.message}`] };
  }
  const pending = [];
  const edges = parsed.edges.flatMap(({ specifier, syntax }) => {
    if (isBuiltinSpecifier(specifier)) return [];
    const target = resolveSpecifier(current, specifier, syntax, fileSet, compilerOptions);
    const absoluteTarget = target === undefined ? undefined : realFilePath(target);
    if (absoluteTarget === undefined) return [unresolvedExternalEdge(current, specifier, syntax, target)];
    if (!fileSet.has(absoluteTarget)) pending.push(absoluteTarget);
    return [{
      target: absoluteTarget,
      syntax: `external-package ${syntax}`,
      unresolved: false,
      unscanned: false,
    }];
  });
  return {
    edges,
    pending,
    unsupported: parsed.unsupported.map((syntax) => `external-package ${syntax}`),
  };
}

function unresolvedExternalEdge(current, specifier, syntax, target) {
  return {
    target: target === undefined ? path.resolve(path.dirname(current), specifier) : path.resolve(target),
    syntax: `external-package ${syntax}`,
    unresolvedSyntax: `external-package unresolved ${syntax}: ${specifier}`,
    unresolved: true,
    unscanned: false,
  };
}

function isBuiltinSpecifier(specifier) {
  return BUILTIN_MODULES.has(specifier.replace(/^node:/u, ''));
}

function resolveRuntimeSpecifier(importer, specifier, syntax) {
  try {
    const resolved = isRequireSyntax(syntax)
      ? createRequire(importer).resolve(specifier)
      : import.meta.resolve(specifier, pathToFileURL(importer).href);
    if (resolved.startsWith('node:')) return undefined;
    const target = resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved;
    if (isDeclarationFile(target)) return undefined;
    return realFilePath(target);
  } catch {
    return undefined;
  }
}

function isRequireSyntax(syntax) {
  return syntax === 'require-style access' || syntax === 'import = require()';
}

function isDeclarationFile(file) {
  return /\.d\.(?:ts|mts|cts)$/u.test(file);
}

function canonicalFile(file) {
  return fs.realpathSync(path.resolve(file));
}

function toleratesTraversalIssue(entry, currentFile, syntax, context) {
  if (syntax.includes('traversal exceeded')) return false;
  const owner = vettedPackageForFile(currentFile, context.vetted);
  if (owner !== undefined) {
    return syntax.startsWith('external-package')
      && owner.manifest.opaqueFiles.has(currentFile);
  }
  return toleratesToolchainIssue(entry, currentFile, context.scriptsDirectory, syntax);
}

function toleratesToolchainIssue(entry, currentFile, scriptsDirectory, syntax) {
  return isWithin(entry, scriptsDirectory)
    && isNodeModulesFile(currentFile)
    && syntax.startsWith('external-package');
}

function isNodeModulesFile(file) {
  return path.resolve(file).split(path.sep).includes('node_modules');
}

function realFilePath(file) {
  try {
    const target = fs.realpathSync(path.resolve(file));
    return fs.statSync(target).isFile() ? target : undefined;
  } catch {
    return undefined;
  }
}

function configurationViolation(root, message) {
  return { entry: root, target: root, syntax: `gate configuration: ${message}`, path: [root] };
}

function dedupeViolations(violations) {
  const seen = new Set();
  return violations.filter((violation) => {
    const key = `${violation.syntax}\0${violation.path.join('\0')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
