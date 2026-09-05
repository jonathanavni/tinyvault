import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import {
  configureVettedPackages,
  isAtOrWithin,
  isWithin,
  realDirectoryPath,
  realFilePath,
  realpathEndsWith,
  VETTED_EXTERNAL_PACKAGES,
  zoneConfigurationErrors,
} from './dependency-boundary.vetted.mjs';

export { VETTED_EXTERNAL_PACKAGES, realpathEndsWith } from './dependency-boundary.vetted.mjs';

// The four zones are data plane (`src/**` except protected modules), control plane (`src/supervisor/**`),
// evaluator (`testbed/**`), and tooling (`scripts/**`). Every reachable external module is traversed.
// Data-plane entries may not reach the control plane or tooling; evaluator entries may reach the control plane;
// tooling keeps its package-local tolerance. Vetted packages add only their manifest-scoped `opaqueFiles`,
// `importerFiles`/`directImportOnly`, and `reachableFrom` relaxations.
// Honest boundary claim: no data-plane module has a scanned or resolved path to the supervisor, and none outside
// src/browser has one to the browser driver; within src/browser only playwright.ts imports it, and only the
// playwright package.
// Residuals: lockfile v1 fails closed while v2/v3 are accepted; nested/shadow copies are unpinned but held to the
// general rules; lockfile integrity is recorded, not verified against installed bytes; the three Playwright loader
// files are opaque, so the gate proves only that no other scanned or resolved path was found through them.

const FLAG_ERROR = 'dependency gate requires --experimental-import-meta-resolve';
const flagProbe = import.meta.resolve(
  './probe.mjs',
  'file:///tinyvault-flag-probe/parent.mjs',
);
if (!flagProbe.startsWith('file:///tinyvault-flag-probe/')) throw new Error(FLAG_ERROR);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const PROTECTED_DIRECTORIES = ['src/supervisor'];
const SOURCE_DIRECTORIES = ['src', 'testbed', 'scripts'];
const BUILTIN_MODULES = new Set(builtinModules.map((specifier) => specifier.replace(/^node:/u, '')));
const MAX_EXTERNAL_MODULES = 10_000;
const GATE_DIRECTORY = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));

export function checkDependencyBoundary(
  root,
  { vetted = VETTED_EXTERNAL_PACKAGES } = {},
) {
  const scan = initializeBoundaryScan(root);
  const {
    absoluteRoot, allSourceFiles, errors, files, graph, locationsByRealPath,
    options, protectedRealPaths, roots, scriptsDirectory,
  } = scan;
  const vettedConfiguration = configureVettedPackages(absoluteRoot, vetted);
  const configurationErrors = [
    ...errors,
    ...sourceDirectorySymlinkErrors(absoluteRoot),
    ...vettedConfiguration.errors,
    ...zoneConfigurationErrors(absoluteRoot, locationsByRealPath),
  ];
  const violations = configurationErrors.map(
    (message) => configurationViolation(absoluteRoot, message),
  );
  addConfigurationViolations(
    violations, absoluteRoot, files, roots, protectedRealPaths,
  );
  addVettedImporterViolations(
    violations,
    allSourceFiles,
    options,
    vettedConfiguration.entries,
  );
  addForbiddenModuleLoaderViolations(violations, allSourceFiles);

  const context = {
    graph,
    scriptsDirectory,
    absoluteRoot,
    protectedRealPaths,
    locationsByRealPath,
    vetted: vettedConfiguration.entries,
  };
  for (const entry of roots) violations.push(...walkEntry(entry, context));

  return { files: files.length, roots: roots.length, violations: dedupeViolations(violations) };
}
function initializeBoundaryScan(root) {
  const absoluteRoot = fs.realpathSync(path.resolve(root));
  const { files: configuredFiles, errors, options } = configuredProductionFiles(absoluteRoot);
  const scriptsDirectory = path.join(absoluteRoot, 'scripts');
  const protectedRealPaths = new Set();
  const locationsByRealPath = new Map();
  const canonicalConfiguredFiles = canonicalizeFiles(
    configuredFiles, absoluteRoot, protectedRealPaths, locationsByRealPath,
  );
  const scriptFiles = canonicalizeFiles(
    walk(scriptsDirectory).filter(isProductionModule),
    absoluteRoot, protectedRealPaths, locationsByRealPath,
  );
  const allSourceFiles = SOURCE_DIRECTORIES.flatMap((directory) =>
    walk(path.join(absoluteRoot, directory)).filter(isSourceModule));
  recordFileLocations(allSourceFiles, absoluteRoot, protectedRealPaths, locationsByRealPath);
  const files = [...new Set([...canonicalConfiguredFiles, ...scriptFiles])];
  const fileSet = new Set(files);
  const graph = buildGraph(files, fileSet, options);
  const roots = files.filter((file) => !isProtected(file, absoluteRoot, protectedRealPaths));
  return {
    absoluteRoot, allSourceFiles, errors, files, graph, locationsByRealPath,
    options, protectedRealPaths, roots, scriptsDirectory,
  };
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
function addVettedImporterViolations(violations, sourceFiles, compilerOptions, vetted) {
  for (const importerLinkPath of sourceFiles) {
    const importerRealPath = realFilePath(importerLinkPath);
    if (importerRealPath === undefined) continue;
    const parsed = dependencies(importerLinkPath, fs.readFileSync(importerLinkPath, 'utf8'));
    for (const edge of parsed.edges) {
      const target = resolveImporterSpecifier(
        importerLinkPath, edge.specifier, edge.syntax, compilerOptions,
      );
      const owner = vettedPackageForSpecifier(edge.specifier, vetted)
        ?? (target === undefined ? undefined : vettedPackageForFile(target, vetted));
      if (owner === undefined) continue;
      const resolvedTarget = target ?? owner.root;
      const dependencyPath = [importerLinkPath, resolvedTarget];
      if (!owner.manifest.importerFiles.has(importerLinkPath)
        || !owner.manifest.importerFiles.has(importerRealPath)) {
        violations.push(edgeViolation(
          importerLinkPath,
          resolvedTarget,
          `vetted package importer file: ${owner.name}`,
          dependencyPath,
        ));
      }
      if (!owner.manifest.directImportOnly.has(owner.name)) {
        violations.push(edgeViolation(
          importerLinkPath,
          resolvedTarget,
          `vetted package direct import forbidden: ${owner.name}`,
          dependencyPath,
        ));
      }
    }
  }
}
function addForbiddenModuleLoaderViolations(violations, sourceFiles) {
  for (const file of sourceFiles) {
    if (isProductionModule(file)) continue;
    const parsed = dependencies(file, fs.readFileSync(file, 'utf8'));
    for (const syntax of parsed.unsupported.filter((item) => item.startsWith('module loader '))) {
      violations.push(edgeViolation(file, file, syntax, [file]));
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
  if (isForbiddenBrowserZoneEdge(currentFile, edge.target, context)) {
    violations.push(edgeViolation(
      entry, edge.target, `data-plane-to-browser ${edge.syntax}`, dependencyPath,
    ));
  }
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
    if (!isEvaluatorEntry(entry, context)) {
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
  if (isEvaluatorEntry(entry, context)) return true;
  return fileLocations(entry, context.locationsByRealPath).every((location) =>
    manifest.reachableFrom.some((allowed) => isAtOrWithin(location, allowed)));
}
function isEvaluatorEntry(entry, context) {
  return fileLocations(entry, context.locationsByRealPath).every((location) =>
    isWithin(location, path.join(context.absoluteRoot, 'testbed')));
}
function vettedPackageForFile(file, manifests) {
  for (const manifest of manifests) {
    for (const configuredPackage of manifest.packages) {
      if (isAtOrWithin(file, configuredPackage.root)) {
        return { ...configuredPackage, manifest };
      }
    }
  }
  return undefined;
}
function vettedPackageForSpecifier(specifier, manifests) {
  for (const manifest of manifests) {
    for (const configuredPackage of manifest.packages) {
      if (specifier === configuredPackage.name
        || specifier.startsWith(`${configuredPackage.name}/`)) {
        return { ...configuredPackage, manifest };
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
    const relativePath = violation.path.map((file) => formatBoundaryPath(root, file)).join(' -> ');
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
  const walkedFiles = ['src', 'testbed'].flatMap((directory) =>
    walk(path.join(root, directory)).filter(isProductionModule));
  return {
    files: [...new Set([...parsed.fileNames.filter(isProductionModule), ...walkedFiles])],
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
function sourceDirectorySymlinkErrors(root) {
  return SOURCE_DIRECTORIES.flatMap((directory) =>
    directorySymlinkErrors(path.join(root, directory), root));
}
function directorySymlinkErrors(directory, root) {
  if (!fs.existsSync(directory)) return [];
  if (isDirectorySymlink(directory)) {
    return [`source directory symlink is forbidden: ${formatBoundaryPath(root, directory)}`];
  }
  if (!fs.lstatSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink() && isDirectorySymlink(target)) {
      return [`source directory symlink is forbidden: ${formatBoundaryPath(root, target)}`];
    }
    return entry.isDirectory() ? directorySymlinkErrors(target, root) : [];
  });
}
function isDirectorySymlink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink() && fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}
function isProductionModule(file) {
  return isSourceModule(file)
    && !/\.(?:test|spec)\.[^.]+$/u.test(file)
    && !file.endsWith('.d.ts');
}
function isSourceModule(file) {
  return SOURCE_EXTENSIONS.includes(path.extname(file));
}
function canonicalizeFiles(files, root, protectedRealPaths, locationsByRealPath) {
  return files.map((file) => {
    const linkPath = path.resolve(file);
    const realPath = canonicalFile(linkPath);
    addFileLocation(locationsByRealPath, realPath, linkPath);
    if (isProtected(linkPath, root, new Set())) protectedRealPaths.add(realPath);
    return realPath;
  });
}
function recordFileLocations(files, root, protectedRealPaths, locationsByRealPath) {
  for (const file of files) {
    const linkPath = path.resolve(file);
    const realPath = realFilePath(linkPath);
    if (realPath === undefined) continue;
    addFileLocation(locationsByRealPath, realPath, linkPath);
    if (isProtected(linkPath, root, new Set())) protectedRealPaths.add(realPath);
  }
}
function addFileLocation(locationsByRealPath, realPath, linkPath) {
  const locations = locationsByRealPath.get(realPath) ?? new Set([realPath]);
  locations.add(linkPath);
  locationsByRealPath.set(realPath, locations);
}
function fileLocations(file, locationsByRealPath) {
  return [...(locationsByRealPath.get(file) ?? new Set([file]))];
}
function isProtected(file, root, protectedRealPaths) {
  if (protectedRealPaths.has(file)) return true;
  return PROTECTED_DIRECTORIES.some((directory) => isWithin(file, path.join(root, directory)));
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
  const isGateImplementation = isGateImplementationFile(file);
  const addLiteral = (node, syntax) => {
    if (node && ts.isStringLiteralLike(node)) {
      edges.push({ specifier: node.text, syntax });
      if (['module', 'node:module'].includes(node.text) && !isGateImplementation) {
        unsupported.push(`module loader ${syntax}`);
      }
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
function isGateImplementationFile(file) {
  const real = realFilePath(file);
  return real !== undefined
    && path.dirname(real) === GATE_DIRECTORY
    && /^dependency-boundary.*\.mjs$/u.test(path.basename(real));
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
function resolveImporterSpecifier(importer, specifier, syntax, compilerOptions) {
  const compilerResolved = ts.resolveModuleName(
    specifier,
    importer,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  const compilerTarget = compilerResolved === undefined ? undefined : realFilePath(compilerResolved);
  if (compilerTarget !== undefined) return compilerTarget;
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
  if (syntax.startsWith('external-package module loader ')) return false;
  return toleratesToolchainIssue(entry, currentFile, context.scriptsDirectory, syntax);
}

function isForbiddenBrowserZoneEdge(currentFile, target, context) {
  const restricted = ['src/core', 'src/backends', 'src/agents', 'src/shared']
    .map((directory) => path.join(context.absoluteRoot, directory));
  const browser = path.join(context.absoluteRoot, 'src/browser');
  const currentLocations = fileLocations(currentFile, context.locationsByRealPath);
  const targetLocations = fileLocations(target, context.locationsByRealPath);
  return currentLocations.some((location) => restricted.some((directory) => isWithin(location, directory)))
    && targetLocations.some((location) => isWithin(location, browser));
}
function toleratesToolchainIssue(entry, currentFile, scriptsDirectory, syntax) {
  return isWithin(entry, scriptsDirectory)
    && isNodeModulesFile(currentFile)
    && syntax.startsWith('external-package');
}
function isNodeModulesFile(file) {
  return path.resolve(file).split(path.sep).includes('node_modules');
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
