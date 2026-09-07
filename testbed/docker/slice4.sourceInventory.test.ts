// Bounded source gate, paired with actual startup and HTTP/control caller tests. Not general taint analysis.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { build } from 'esbuild';
import { FIXTURE_BUNDLE_INPUTS } from './integrationEvidence';
import { expect, it } from 'vitest';

async function sources(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await sources(path));
    else if (/\.(?:[cm]?js|ts)$/.test(entry.name) && !/\.(test|testkit)\.(?:[cm]?js|ts)$/.test(entry.name)) paths.push(path);
  }
  return paths;
}
it('private generation storage and signing uses stay in the closed fixture source and lexical caller inventory', async () => {
  const inventory: string[] = [];
  const root = process.cwd();
  for (const path of [...await sources(join(root, 'testbed/docker')), ...await sources(join(root, 'testbed/fixtures'))]) {
    const file = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && ['generateKeyPairSync', 'privateKey', 'signingKey'].includes(node.text)) {
        let owner: ts.Node | undefined = node.parent;
        while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
        inventory.push(`${relative(root, path)}:${owner && ts.isFunctionDeclaration(owner) ? owner.name?.text : '<module>'}:${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  expect(inventory.sort()).toEqual([
    'testbed/fixtures/shared/loginFixture.ts:<module>:generateKeyPairSync',
    'testbed/fixtures/shared/loginFixture.ts:<module>:signingKey',
    'testbed/fixtures/shared/loginFixture.ts:startLoginFixture:generateKeyPairSync',
    'testbed/fixtures/shared/loginFixture.ts:startLoginFixture:privateKey',
    'testbed/fixtures/shared/loginFixture.ts:startLoginFixture:privateKey',
    'testbed/fixtures/shared/loginFixture.ts:startLoginFixture:signingKey',
    'testbed/fixtures/shared/loginFixture.ts:attestFixtureEvents:signingKey',
    'testbed/fixtures/shared/loginFixture.ts:processLoginBody:signingKey',
    'testbed/fixtures/shared/eventsDigest.ts:signEventsDigest:signingKey',
    'testbed/fixtures/shared/eventsDigest.ts:signEventsDigest:signingKey',
  ].sort());
});
it('fixture transport return and container adapter expose only the closed public key boundary', async () => {
  const source = await readFile(new URL('../fixtures/shared/loginFixture.ts', import.meta.url), 'utf8');
  const file = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  let properties: string[] | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'transport' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      properties = node.initializer.properties.map((p) => p.name?.getText(file) ?? '<spread>');
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(properties?.sort()).toEqual(['origin', 'originRoles', 'architecture', 'reachability', 'verificationPublicKey', 'registerRun', 'getLoginPage',
    'submitLogin', 'takeReceipt', 'finalizeRun', 'acknowledgeReceipt', 'verifyCompletion', 'attestEvents', 'captureRequests',
    'unauthorizedRequests', 'close'].sort());
  const adapter = await readFile(new URL('./container/fixture.ts', import.meta.url), 'utf8');
  const adapterFile = ts.createSourceFile('adapter.ts', adapter, ts.ScriptTarget.Latest, true);
  const factory = adapterFile.statements.find((n): n is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(n) && n.name?.text === 'controlConfigForFixture');
  const returns = factory?.body?.statements.filter(ts.isReturnStatement) ?? [];
  expect(returns).toHaveLength(1);
  const config = returns[0].expression;
  expect(config && ts.isObjectLiteralExpression(config)).toBe(true);
  if (!config || !ts.isObjectLiteralExpression(config)) throw new Error('adapter return shape');
  expect(config.properties.map((p) => p.name?.getText(adapterFile) ?? '<spread>').sort(), 'exact adapter returned config keys')
    .toEqual(['diagnostics', 'epoch', 'fixtureId', 'hostname', 'keyPairProvider', 'operations']);
  const provider = config.properties.find((p) => p.name?.getText(adapterFile) === 'keyPairProvider');
  expect(provider && ts.isPropertyAssignment(provider) && ts.isArrowFunction(provider.initializer)).toBe(true);
  if (!provider || !ts.isPropertyAssignment(provider) || !ts.isArrowFunction(provider.initializer)) throw new Error('key provider shape');
  let body = provider.initializer.body;
  if (ts.isParenthesizedExpression(body)) body = body.expression;
  expect(ts.isObjectLiteralExpression(body) && body.properties.map((p) => p.name?.getText(adapterFile)), 'exact key provider keys').toEqual(['publicKey']);
  if (!ts.isObjectLiteralExpression(body)) throw new Error('key object shape');
  const publicKey = body.properties[0];
  expect(ts.isPropertyAssignment(publicKey) && ts.isPropertyAccessExpression(publicKey.initializer)
    && ts.isIdentifier(publicKey.initializer.expression) && publicKey.initializer.expression.text === 'fixture'
    && publicKey.initializer.name.text === 'verificationPublicKey', 'key provider returns actual fixture public key').toBe(true);
  expect(source).toContain("const { privateKey, publicKey } = generateKeyPairSync('ed25519');");
});
it('image build has only runtime container bundle entries and no key creation or host configuration inputs', async () => {
  const dockerfile = await readFile(new URL('./Dockerfile', import.meta.url), 'utf8');
  expect(dockerfile.match(/esbuild ([^-]+)/)?.[1].trim().split(' ')).toEqual(['testbed/docker/container/main.ts', 'testbed/docker/container/bridge.ts']);
  expect(dockerfile).toContain('COPY --from=builder /build/bundles/ /app/');
  for (const name of ['Dockerfile', 'compose.json', 'topology.json']) {
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    expect(source).not.toMatch(/generateKeyPair|privateKey|signingKey|BEGIN PRIVATE KEY|pkcs8/);
  }
});

it('actual container bundle compiles only the closed private-key source boundary', async () => {
  const result = await build({ entryPoints: ['testbed/docker/container/main.ts', 'testbed/docker/container/bridge.ts'],
    bundle: true, platform: 'node', target: 'node24', format: 'esm', write: false, outdir: 'tinyvault-bundle-proof', metafile: true,
    define: { TV_CONTAINER_TOPOLOGY: await readFile(new URL('./topology.json', import.meta.url), 'utf8'),
      TV_BENIGN_PAGE: JSON.stringify(await readFile(new URL('../fixtures/benign-login/index.html', import.meta.url), 'utf8')),
      TV_HIDDEN_PAGE: JSON.stringify(await readFile(new URL('../fixtures/dom-hidden-injection/index.html', import.meta.url), 'utf8')) } });
  expect(Object.keys(result.metafile!.inputs).sort()).toEqual([...FIXTURE_BUNDLE_INPUTS]);
  expect(result.outputFiles).toHaveLength(2);
});
