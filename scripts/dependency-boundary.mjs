import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// The second argument to import.meta.resolve is honored only with --experimental-import-meta-resolve;
// the load-time probe below makes omitting it fail closed. Every reachable external module is traversed.
// Only a scripts-rooted BFS may tolerate unsupported/unscanned external-package work inside node_modules;
// data-plane roots tolerate nothing, and neither tier may reach a protected directory.

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
  const canonicalConfiguredFiles = configuredFiles.map(canonicalFile);
  const configuredFileSet = new Set(canonicalConfiguredFiles);
  const scriptFiles = walk(scriptsDirectory).filter(isProductionModule).map(canonicalFile);
  const files = [...new Set([...canonicalConfiguredFiles, ...scriptFiles])];
  const fileSet = new Set(files);
  const graph = new Map();
  const visitedExternalFiles = new Set();

  for (const file of files) {
    const parsed = dependencies(file, fs.readFileSync(file, 'utf8'));
    const edges = parsed.edges.flatMap(({ specifier, syntax }) => {
      if (isBuiltinSpecifier(specifier)) return [];
      const target = resolveSpecifier(file, specifier, syntax, fileSet, options);
      if (target === undefined) {
        return [{
          target: path.resolve(path.dirname(file), specifier),
          syntax,
          unresolvedSyntax: `${specifier.startsWith('.') ? 'unresolved relative' : 'unresolved'} ${syntax}: ${specifier}`,
          unresolved: true,
          unscanned: false,
        }];
      }
      if (!fileSet.has(target)) {
        addExternalEntry(graph, target, fileSet, options, visitedExternalFiles);
      }
      return [{
        target,
        syntax,
        unresolved: false,
        unscanned: !fileSet.has(target) && !visitedExternalFiles.has(target),
        productionToTooling: configuredFileSet.has(file) && isWithin(target, scriptsDirectory),
      }];
    });
    graph.set(file, { edges, unsupported: parsed.unsupported });
  }

  const roots = files.filter((file) => !isProtected(file, absoluteRoot));
  const violations = errors.map((message) => configurationViolation(absoluteRoot, message));

  for (const protectedDirectory of PROTECTED_DIRECTORIES) {
    const absoluteDirectory = path.join(absoluteRoot, protectedDirectory);
    const protectedFiles = files.filter((file) => isWithin(file, absoluteDirectory));
    if (!fs.existsSync(absoluteDirectory) || protectedFiles.length === 0) {
      violations.push(configurationViolation(
        absoluteRoot,
        `protected directory has no production module: ${protectedDirectory}`,
      ));
    }
  }
  if (files.length === 0) {
    violations.push(configurationViolation(absoluteRoot, 'production scan resolved zero files'));
  }
  if (roots.length === 0) {
    violations.push(configurationViolation(absoluteRoot, 'data-plane scan resolved zero roots'));
  }

  for (const entry of roots) {
    const queue = [{ file: entry, dependencyPath: [entry] }];
    const visited = new Set([entry]);
    while (queue.length > 0) {
      const current = queue.shift();
      const node = graph.get(current.file);
      if (node === undefined) {
        if (!toleratesToolchainIssue(entry, current.file, scriptsDirectory, 'external-package')) {
          violations.push({
            entry,
            target: current.file,
            syntax: 'unscanned module',
            path: current.dependencyPath,
          });
        }
        continue;
      }
      for (const syntax of node?.unsupported ?? []) {
        if (toleratesToolchainIssue(entry, current.file, scriptsDirectory, syntax)) continue;
        violations.push({
          entry,
          target: current.file,
          syntax,
          path: current.dependencyPath,
        });
      }
      for (const edge of node?.edges ?? []) {
        const dependencyPath = [...current.dependencyPath, edge.target];
        if (edge.productionToTooling) {
          violations.push({
            entry,
            target: edge.target,
            syntax: `production-to-tooling ${edge.syntax}`,
            path: dependencyPath,
          });
        }
        if (edge.unresolved) {
          if (toleratesToolchainIssue(entry, current.file, scriptsDirectory, edge.syntax)) continue;
          violations.push({
            entry,
            target: edge.target,
            syntax: edge.unresolvedSyntax ?? `unresolved relative ${edge.syntax}`,
            path: dependencyPath,
          });
          continue;
        }
        if (edge.unscanned) {
          if (toleratesToolchainIssue(entry, current.file, scriptsDirectory, edge.syntax)) continue;
          violations.push({
            entry,
            target: edge.target,
            syntax: `unscanned ${edge.syntax}`,
            path: dependencyPath,
          });
          continue;
        }
        if (isProtected(edge.target, absoluteRoot)) {
          violations.push({ entry, target: edge.target, syntax: edge.syntax, path: dependencyPath });
          continue;
        }
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push({ file: edge.target, dependencyPath });
        }
      }
    }
  }

  return { files: files.length, roots: roots.length, violations: dedupeViolations(violations) };
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

function isProtected(file, root) {
  return PROTECTED_DIRECTORIES.some((directory) => isWithin(file, path.join(root, directory)));
}

function isWithin(file, directory) {
  const relative = path.relative(directory, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
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

    if (visited.size > MAX_EXTERNAL_MODULES) {
      graph.set(current, {
        edges: [],
        unsupported: [`external package traversal exceeded ${MAX_EXTERNAL_MODULES} modules`],
      });
      continue;
    }

    if (path.extname(current) === '.json') {
      graph.set(current, { edges: [], unsupported: [] });
      continue;
    }

    let parsed;
    try {
      parsed = dependencies(current, fs.readFileSync(current, 'utf8'));
    } catch (error) {
      graph.set(current, {
        edges: [],
        unsupported: [`unreadable external module: ${error.message}`],
      });
      continue;
    }

    const edges = parsed.edges.flatMap(({ specifier, syntax }) => {
      if (isBuiltinSpecifier(specifier)) return [];
      const target = resolveSpecifier(current, specifier, syntax, fileSet, compilerOptions);
      if (target === undefined) {
        return [{
          target: path.resolve(path.dirname(current), specifier),
          syntax: `external-package ${syntax}`,
          unresolvedSyntax: `external-package unresolved ${syntax}: ${specifier}`,
          unresolved: true,
          unscanned: false,
        }];
      }

      const absoluteTarget = realFilePath(target);
      if (absoluteTarget === undefined) {
        return [{
          target: path.resolve(target),
          syntax: `external-package ${syntax}`,
          unresolvedSyntax: `external-package unresolved ${syntax}: ${specifier}`,
          unresolved: true,
          unscanned: false,
        }];
      }
      if (!fileSet.has(absoluteTarget)) pending.push(absoluteTarget);
      return [{
        target: absoluteTarget,
        syntax: `external-package ${syntax}`,
        unresolved: false,
        unscanned: false,
      }];
    });
    graph.set(current, {
      edges,
      unsupported: parsed.unsupported.map((syntax) => `external-package ${syntax}`),
    });
  }
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
