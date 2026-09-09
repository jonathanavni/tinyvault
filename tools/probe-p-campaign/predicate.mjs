const DESKTOP_APPS = new Set(['Claude', 'Code Helper', 'Obsidian']);
const MCP_HELPER = /claude-code|@modelcontextprotocol|playwright-mcp/iu;

function descendants(processes, ownPid) {
  const excluded = new Set([ownPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (!excluded.has(process.pid) && excluded.has(process.ppid)) {
        excluded.add(process.pid);
        changed = true;
      }
    }
  }
  return excluded;
}

function executable(command) {
  const first = command.trim().split(/\s+/u)[0] ?? '';
  return first.split('/').at(-1) ?? '';
}

function hasArg(command, alternatives) {
  const args = command.trim().split(/\s+/u).slice(1);
  return args.some((arg) => alternatives.includes(arg.replace(/^--?[^=]+=/u, '')));
}

function referencesOutsideCheckout(command, checkoutRoot) {
  return command.trim().split(/\s+/u).slice(1).some((argument) => {
    const candidate = argument.replace(/^['"]|['",;:]$/gu, '');
    if (!candidate.startsWith('/')) return false;
    return candidate !== checkoutRoot && !candidate.startsWith(`${checkoutRoot}/`);
  });
}

function matchesFrozenPredicate(process, checkoutRoot) {
  const command = process.command.trim();
  const exe = executable(command);
  if (/^(codex|codex-cli|codex-companion(?:\.mjs)?|codex-app-server|app-server)$/iu.test(exe)) return true;
  if (/(?:^|[/\s])codex-companion\.mjs(?:$|\s)/iu.test(command)) return true;
  if (/(?:^|[/\s])claude-review\.mjs(?:$|\s)/u.test(command)) return true;
  if (/(?:^|[/\s])(?:vitest|playwright)(?:\.mjs)?(?:$|[/\s])/iu.test(command)) return true;
  if (/Chromium|Google Chrome for Testing|chrome-headless-shell/iu.test(command)) return true;
  if (exe === 'node' && referencesOutsideCheckout(command, checkoutRoot)) return true;
  if (exe === 'make') return true;
  if (exe === 'docker' && hasArg(command, ['build', 'compose', 'run'])) return true;
  if (/^(tsc|esbuild)$/u.test(exe)) return true;
  if (/^(npm|npx)$/u.test(exe) && hasArg(command, ['test', 'vitest', 'eval', 'baseline'])) return true;
  return MCP_HELPER.test(command) && process.pcpu >= 1;
}

export function competingJobs(hostState, { ownPid, checkoutRoot }) {
  if (!Number.isInteger(ownPid)) throw new Error('ownPid must be an integer');
  if (typeof checkoutRoot !== 'string' || checkoutRoot === '') throw new Error('checkoutRoot is required');
  const ownTree = descendants(hostState.processes, ownPid);
  const competing = [];
  const observed = [];
  for (const process of hostState.processes) {
    const command = process.command.trim();
    const exempt = ownTree.has(process.pid) || DESKTOP_APPS.has(command)
      || (MCP_HELPER.test(command) && process.pcpu < 1);
    if (!exempt && matchesFrozenPredicate(process, checkoutRoot)) competing.push(process);
    else observed.push(process);
  }
  return { competing, observed };
}
