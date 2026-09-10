import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateTopology } from './topology.mjs';
import { PORTS, HISTORY_MARKER, ARTIFACT_MARKER, COMPOSE_FILE, IMAGE_NAME } from './compose';
const read = () => JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8'));
describe('single topology home', () => {
  it('retains the locked ports, paths, image and B1 marker exports', () => {
    const topology = validateTopology(read());
    expect(PORTS).toEqual({ 'benign-login': [47110], 'lookalike-origin': [47120, 47121], 'dom-hidden-injection': [47130], 'secret-echo': [47140], 'fake-reauth': [47150] });
    expect(Object.values(topology.services).flat().map((p) => [p.address, p.container]))
      .toEqual([['127.0.0.1', 8080], ['127.0.0.1', 8080], ['127.0.0.1', 8081], ['127.0.0.1', 8080], ['127.0.0.1', 8080], ['127.0.0.1', 8080]]);
    expect(IMAGE_NAME).toBe('tinyvault-fixture:local');
    expect(COMPOSE_FILE).toBe(fileURLToPath(new URL('./compose.json', import.meta.url)));
    expect(topology.controlSocket).toBe('/tmp/tinyvault/control.sock');
    expect(HISTORY_MARKER).toBe('com.tinyvault.marker=history-surface');
    expect(ARTIFACT_MARKER).toBe('tinyvault-artifact-scan-close-v1');
  });
  it.each(['root', 'services', 'port', 'markers', 'healthcheck'])('rejects unknown keys at %s', (level) => {
    const doc = read();
    const target = level === 'root' ? doc : level === 'port' ? doc.services['benign-login'][0] : doc[level];
    target.unknown = true;
    expect(() => validateTopology(doc)).toThrow('topology-shape');
    expect(() => validateTopology(read())).not.toThrow();
  });
  it.each([null, [], {}, { services: null }])('rejects malformed topology %j', (doc) => {
    expect(() => validateTopology(doc)).toThrow('topology-shape');
  });
});
