// Shape validation shared by the TypeScript harness and bare-Node Compose lint.
// Constants live only in topology.json. This validates structure, not a second copy of values.
const serviceNames = ['benign-login', 'lookalike-origin', 'dom-hidden-injection'];
const markerNames = ['HISTORY_MARKER', 'ARTIFACT_MARKER', 'EXPORT_MARKER', 'BOOT_MARKER',
  'SHUTDOWN_MARKER', 'BRIDGE_MARKER', 'ARGV_MARKER'];
function keys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}
function port(value) {
  return keys(value, ['container', 'host', 'address'])
    && [value.container, value.host].every((p) => Number.isInteger(p) && p > 0 && p <= 65535)
    && typeof value.address === 'string' && /^127(?:\.[0-9]{1,3}){3}$/.test(value.address);
}
export function validateTopology(value) {
  const fields = ['services', 'imageName', 'composePath', 'dockerfilePath', 'controlSocket', 'markers', 'healthcheck'];
  if (!keys(value, fields) || !keys(value.services, serviceNames)
    || !serviceNames.every((s) => Array.isArray(value.services[s]) && value.services[s].length > 0
      && value.services[s].every(port))
    || !keys(value.markers, markerNames) || !Object.values(value.markers).every((s) => typeof s === 'string' && s.length > 0)
    || !['imageName', 'composePath', 'dockerfilePath', 'controlSocket'].every((k) => typeof value[k] === 'string' && value[k].length > 0)
    || !keys(value.healthcheck, ['interval', 'timeout', 'retries', 'start_period'])
    || !['interval', 'timeout', 'start_period'].every((k) => /^[1-9][0-9]*s$/.test(value.healthcheck[k]))
    || !Number.isInteger(value.healthcheck.retries) || value.healthcheck.retries <= 0) {
    throw new Error('topology-shape');
  }
  return value;
}
