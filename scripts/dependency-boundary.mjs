import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const PROTECTED_DIRECTORIES = ['src/supervisor'];

export function checkDependencyBoundary(root) {
  const absoluteRoot = path.resolve(root);
  const { files: configuredFiles, errors, options } = configuredProductionFiles(absoluteRoot);
  const scriptFiles = walk(path.join(absoluteRoot, 'scripts')).filter(isProductionModule);
  const files = [...new Set([...configuredFiles, ...scriptFiles].map((file) => path.resolve(file)))];
  const fileSet = new Set(files);
  const graph = new Map();

  for (const file of files) {
    const parsed = dependencies(file, fs.readFileSync(file, 'utf8'));
    const edges = parsed.edges.map(({ specifier, syntax }) => {
      const target = resolveSpecifier(file, specifier, fileSet, options);
      if (target !== undefined && isNodeModulesFile(target)) {
        addExternalEntry(graph, target, fileSet, options);
      }
      return target === undefined && specifier.startsWith('.')
        ? {
            target: path.resolve(path.dirname(file), specifier),
            syntax,
            unresolved: true,
            unscanned: false,
          }
        : {
            target,
            syntax,
            unresolved: false,
            unscanned: target !== undefined
              && !fileSet.has(target)
              && !isNodeModulesFile(target),
          };
    }).filter(({ target }) => target !== undefined);
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
      for (const syntax of node?.unsupported ?? []) {
        violations.push({
          entry,
          target: current.file,
          syntax,
          path: current.dependencyPath,
        });
      }
      for (const edge of node?.edges ?? []) {
        const dependencyPath = [...current.dependencyPath, edge.target];
        if (edge.unresolved) {
          violations.push({
            entry,
            target: edge.target,
            syntax: `unresolved relative ${edge.syntax}`,
            path: dependencyPath,
          });
          continue;
        }
        if (edge.unscanned) {
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
      if (isCreateRequireImport(node)) unsupported.push('createRequire access');
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
      } else if (isCreateRequireExpression(node.expression)) {
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

function resolveSpecifier(importer, specifier, fileSet, compilerOptions) {
  const compilerResolved = ts.resolveModuleName(
    specifier,
    importer,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (compilerResolved !== undefined) {
    const target = path.resolve(compilerResolved);
    if (isRealFile(target)) return target;
  }

  if (!specifier.startsWith('.')) return undefined;
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [unresolved];
  for (const extension of SOURCE_EXTENSIONS) candidates.push(`${unresolved}${extension}`);
  if (/\.(?:js|mjs|cjs)$/u.test(unresolved)) {
    const stem = unresolved.replace(/\.(?:js|mjs|cjs)$/u, '');
    candidates.push(`${stem}.ts`, `${stem}.mts`, `${stem}.cts`);
  }
  for (const extension of SOURCE_EXTENSIONS) candidates.push(path.join(unresolved, `index${extension}`));
  return candidates.map((candidate) => path.resolve(candidate)).find((candidate) => fileSet.has(candidate));
}

function addExternalEntry(graph, file, fileSet, compilerOptions) {
  if (graph.has(file)) return;
  const parsed = dependencies(file, fs.readFileSync(file, 'utf8'));
  const edges = parsed.edges.flatMap(({ specifier, syntax }) => {
    const target = resolveSpecifier(file, specifier, fileSet, compilerOptions);
    if (target === undefined || isNodeModulesFile(target)) return [];
    return [{
      target,
      syntax: `external-package ${syntax}`,
      unresolved: false,
      unscanned: !fileSet.has(target),
    }];
  });
  graph.set(file, { edges, unsupported: [] });
}

function isRealFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
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
