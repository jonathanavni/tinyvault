import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// The second argument to import.meta.resolve is honored only with --experimental-import-meta-resolve;
// the load-time probe below makes omitting it fail closed. Every reachable external module is traversed.
// A scripts-rooted BFS tolerates unsupported, unscanned, or unresolved external-package loads inside
// node_modules; data-plane roots tolerate nothing; neither tier may reach a protected directory; production
// modules may not import scripts/ (directly or transitively).
// Residual: a scripts-rooted BFS cannot see non-literal/unresolved loads inside a toolchain package.

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

export function checkDependencyBoundary(root) {
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
  const violations = errors.map((message) => configurationViolation(absoluteRoot, message));
  addConfigurationViolations(
    violations, absoluteRoot, files, roots, protectedRealPaths,
  );

  const context = { graph, scriptsDirectory, absoluteRoot, protectedRealPaths };
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

function walkEntry(entry, context) {
  const { graph, scriptsDirectory } = context;
  const violations = [];
  const queue = [{ file: entry, dependencyPath: [entry] }];
  const visited = new Set([entry]);
  while (queue.length > 0) {
    const current = queue.shift();
    const node = graph.get(current.file);
    if (node === undefined) {
      // Unreachable by construction — every external target receives a graph node (see addExternalEntry);
      // kept fail-closed.
      if (!toleratesToolchainIssue(entry, current.file, scriptsDirectory, 'external-package')) {
        violations.push(edgeViolation(entry, current.file, 'unscanned module', current.dependencyPath));
      }
      continue;
    }
    for (const syntax of node.unsupported) {
      if (!toleratesToolchainIssue(entry, current.file, scriptsDirectory, syntax)) {
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
  if (edge.unresolved) {
    if (!toleratesToolchainIssue(entry, currentFile, scriptsDirectory, edge.syntax)) {
      violations.push(edgeViolation(
        entry,
        edge.target,
        edge.unresolvedSyntax ?? `unresolved relative ${edge.syntax}`,
        dependencyPath,
      ));
    }
    return { violations, traverse: false };
  }
  if (edge.unscanned) {
    if (!toleratesToolchainIssue(entry, currentFile, scriptsDirectory, edge.syntax)) {
      violations.push(edgeViolation(entry, edge.target, `unscanned ${edge.syntax}`, dependencyPath));
    }
    return { violations, traverse: false };
  }
  if (isProtected(edge.target, absoluteRoot, protectedRealPaths)) {
    violations.push(edgeViolation(entry, edge.target, edge.syntax, dependencyPath));
    return { violations, traverse: false };
  }
  return { violations, traverse: true };
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
