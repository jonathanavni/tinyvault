import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
const forbidden = ['onFill' + 'Authorization', 'create' + 'FillService', 'Fill' + 'AuthorizationLifecycle',
  'createFill' + 'AuthorizationDomain', 're' + 'new', 'author' + 'ization'];
const names = ['list_vault', 'fill_from_vault', 'request_vault_setup', 'browser_open_session',
  'browser_close_session', 'browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot'];
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(root, entry.name)) : entry.name.endsWith('.ts') ? [join(root, entry.name)] : []);
}
function inspect(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true); const errors: string[] = [];
  const test = file.endsWith('.test.ts'); const main = file.endsWith('/main.ts');
  if (!test && text.split('\n').length >= 400) errors.push('line-cap');
  const walk = (node: ts.Node) => {
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && forbidden.includes(node.text)) errors.push('forbidden-token');
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'console') errors.push('console');
    if (!test && !main && ts.isIdentifier(node) && node.text === 'process') errors.push('process');
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (/playwright|testbed|scripts/.test(spec) || !test && /redaction|sessionMutex|\/browser\//.test(spec)) errors.push('import');
      if (!test && node.importClause?.getText(source).split(/\W+/).some(value => ['Secret', 'SessionMutex'].includes(value))) errors.push('import');
    }
    if (!test && !main && ts.isIdentifier(node) && ['createSupervisedHost', 'composeSupervisedHost'].includes(node.text)) errors.push('host-factory');
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (main) {
    const calls: ts.CallExpression[] = []; const servers: ts.CallExpression[] = [];
    const find = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'createSupervisedHost') calls.push(node);
        if (node.expression.text === 'createServer') servers.push(node);
      }
      ts.forEachChild(node, find);
    }; find(source);
    if (calls.length !== 1 || servers.length !== 1) errors.push('composition-count');
    for (const call of calls) {
      const arg = call.arguments[0];
      if (call.arguments.length !== 1 || !arg || !ts.isObjectLiteralExpression(arg) ||
        arg.properties.length !== 3 || !arg.properties.every(prop =>
          (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && ts.isIdentifier(prop.name)) ||
        arg.properties.map(prop => prop.name?.getText(source)).sort().join(',') !== 'backend,canary,handleSignals') errors.push('host-options');
      const signal = arg && ts.isObjectLiteralExpression(arg) && arg.properties.find(prop =>
        ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'handleSignals');
      if (!signal || !ts.isPropertyAssignment(signal) || signal.initializer.kind !== ts.SyntaxKind.FalseKeyword) errors.push('signal-option');
      let parent: ts.Node | undefined = call.parent;
      while (parent && !ts.isFunctionDeclaration(parent) && !ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent)) parent = parent.parent;
      if (!parent || !ts.isFunctionDeclaration(parent) || parent.name?.text !== 'start') errors.push('startup-function');
      const awaited = call.parent; const assignment = awaited.parent;
      if (!ts.isAwaitExpression(awaited) || !ts.isBinaryExpression(assignment) || assignment.left.getText(source) !== 'host' ||
        servers[0]?.arguments[0]?.getText(source) !== 'host') errors.push('host-result');
    }
  }
  if (file.endsWith('/tools.ts')) {
    const switches: ts.SwitchStatement[] = [];
    const find = (node: ts.Node) => {
      if (ts.isSwitchStatement(node)) switches.push(node); ts.forEachChild(node, find);
    }; find(source);
    if (switches.length !== 1) errors.push('dispatch-count');
    const clauses = switches[0]?.caseBlock.clauses ?? [];
    if (clauses.filter(ts.isCaseClause).map(clause => ts.isStringLiteral(clause.expression) ? clause.expression.text : '').join(',') !== names.join(',')) errors.push('dispatch-names');
    for (const clause of clauses) {
      if (ts.isDefaultClause(clause)) { if (!clause.statements.some(ts.isThrowStatement)) errors.push('dispatch-default'); continue; }
      const statement = clause.statements[0];
      if (!statement || !ts.isReturnStatement(statement) || !statement.expression || !ts.isCallExpression(statement.expression) ||
        statement.expression.expression.getText(source) !== `host.tools.${(clause.expression as ts.StringLiteral).text}`) errors.push('dispatch-host');
    }
    if (!text.includes("from '../../agents/transcript'") || !text.includes('text: serializeExact(result)')) errors.push('serialization');
  }
  return errors;
}
describe('T-STRUCT adapter source pins', () => {
  it('checks all adapter files and exactly four bounded production files', () => {
    const all = files('src/adapters');
    expect(all.filter(file => !file.endsWith('.test.ts')).sort()).toEqual([
      'src/adapters/mcp/main.ts', 'src/adapters/mcp/protocol.ts', 'src/adapters/mcp/server.ts', 'src/adapters/mcp/tools.ts']);
    for (const file of all) expect(inspect(file, readFileSync(file, 'utf8')), file).toEqual([]);
  });
  it('requires the exact C5 signal option', () => {
    const file = 'src/adapters/mcp/main.ts'; const source = readFileSync(file, 'utf8');
    for (const replacement of ['handleSignals: true', 'handleSignals: false && false',
      "['handleSignals']: false", 'handleSignals', '...{ handleSignals: false }']) {
      expect(inspect(file, source.replace('handleSignals: false', replacement)).length).toBeGreaterThan(0);
    }
    expect(inspect(file, source.replace(', handleSignals: false', ''))).toContain('host-options');
  });
  it('rejects a local tool map in place of the injected host', () => {
    const file = 'src/adapters/mcp/tools.ts'; const source = readFileSync(file, 'utf8');
    expect(inspect(file, source)).toEqual([]);
    expect(inspect(file, source.replace('return host.tools.list_vault()', 'return local.tools.list_vault()'))).toContain('dispatch-host');
  });
  it('rejects factory relocation, extra options and an unawaited factory', () => {
    const file = 'src/adapters/mcp/main.ts'; const source = readFileSync(file, 'utf8');
    expect(inspect(file, source.replace('{ backend, canary, handleSignals: false }', '{ backend, canary, handleSignals: false, browser: fake }'))).toContain('host-options');
    expect(inspect(file, source.replace('await createSupervisedHost', 'createSupervisedHost'))).toContain('host-result');
    expect(inspect(file, source.replace('function start(', 'function perCall('))).toContain('startup-function');
  });
});
