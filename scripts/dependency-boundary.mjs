import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];

export function checkDependencyBoundary(root) {
  const srcRoot = path.join(root, 'src');
  const files = walk(srcRoot).filter(isProductionModule);
  const fileSet = new Set(files.map((file) => path.resolve(file)));
  const graph = new Map();
  const syntaxByEdge = new Map();

  for (const file of files) {
    const edges = dependencies(file, fs.readFileSync(file, 'utf8'))
      .map(({ specifier, syntax }) => ({ target: resolveSpecifier(file, specifier, fileSet), syntax }))
      .filter(({ target }) => target !== undefined);
    graph.set(path.resolve(file), edges.map(({ target }) => target));
    for (const { target, syntax } of edges) syntaxByEdge.set(`${path.resolve(file)}\0${target}`, syntax);
  }

  const roots = files.map((file) => path.resolve(file)).filter((file) => isDataPlane(file, srcRoot));
  const violations = [];
  for (const entry of roots) {
    const queue = [{ file: entry, path: [entry] }];
    const visited = new Set([entry]);
    while (queue.length > 0) {
      const current = queue.shift();
      for (const target of graph.get(current.file) ?? []) {
        const dependencyPath = [...current.path, target];
        if (isProtected(target, srcRoot)) {
          const syntax = syntaxByEdge.get(`${current.file}\0${target}`) ?? 'dependency';
          violations.push({ entry, target, syntax, path: dependencyPath });
          continue;
        }
        if (!visited.has(target)) {
          visited.add(target);
          queue.push({ file: target, path: dependencyPath });
        }
      }
    }
  }

  return { files: files.length, violations: dedupeViolations(violations) };
}

export function formatViolations(root, violations) {
  return violations.map((violation) => {
    const relativePath = violation.path.map((file) => path.relative(root, file)).join(' -> ');
    return `${violation.syntax}: ${relativePath}`;
  });
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

function isDataPlane(file, srcRoot) {
  return !isProtected(file, srcRoot);
}

function isProtected(file, srcRoot) {
  const relative = slash(path.relative(srcRoot, file));
  return relative === 'core/tripwire.ts' || relative.startsWith('supervisor/');
}

function dependencies(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found = [];
  const addLiteral = (node, syntax) => {
    if (node && ts.isStringLiteralLike(node)) found.push({ specifier: node.text, syntax });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) addLiteral(node.moduleSpecifier, 'static import');
    if (ts.isExportDeclaration(node)) addLiteral(node.moduleSpecifier, 're-export');
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addLiteral(node.arguments[0], 'dynamic import()');
      } else if (isRequireExpression(node.expression)) {
        addLiteral(node.arguments[0], 'require-style access');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isRequireExpression(expression) {
  return (ts.isIdentifier(expression) && expression.text === 'require')
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === 'require');
}

function resolveSpecifier(importer, specifier, fileSet) {
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

function dedupeViolations(violations) {
  const seen = new Set();
  return violations.filter((violation) => {
    const key = violation.path.join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slash(value) {
  return value.split(path.sep).join('/');
}
