// esbuild embeds the canonical JSON; source execution reads that same single home.
import { readFileSync } from 'node:fs';
import { validateTopology } from '../topology.mjs';
export const containerTopology = validateTopology(typeof TV_CONTAINER_TOPOLOGY === 'undefined'
  ? JSON.parse(readFileSync(new URL('../topology.json', import.meta.url), 'utf8')) : TV_CONTAINER_TOPOLOGY);
