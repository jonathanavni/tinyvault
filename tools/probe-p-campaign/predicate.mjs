export const PREDICATE_VERSION = 2;

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

function ownProcesses(processes, ownPid) {
  const own = descendants(processes, ownPid);
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const visited = new Set();
  let pid = ownPid;
  while (!visited.has(pid)) {
    visited.add(pid);
    own.add(pid);
    if (pid === 1) break;
    const parent = byPid.get(pid)?.ppid;
    if (!Number.isInteger(parent)) break;
    pid = parent;
  }
  return own;
}

function basename(token) {
  return token.split('/').at(-1) ?? '';
}

function hasArg(args, alternatives) {
  return args.some((arg) => alternatives.includes(arg.replace(/^--?[^=]+=/u, '')));
}

function isChromiumProcess(command) {
  if (/(?:^|\/)(?:chrome_)?crashpad_handler(?:\s|$)/iu.test(command)) return false;
  return /^(?:.*\/)?(?:Chromium(?: Helper(?: \([^)]+\))?)?|Google Chrome for Testing(?: Helper(?: \([^)]+\))?)?|chrome-headless-shell)(?:\s|$)/iu.test(command);
}

function matchesKnownWorkload(process) {
  const command = process.command.trim();
  const tokens = command.split(/\s+/u);
  const exe = basename(tokens[0] ?? '');
  const args = tokens.slice(1);
  const tools = tokens.map(basename);
  if (/(?:^|[/\s])(?:vitest|playwright)(?:\.mjs)?(?:$|[/\s])/iu.test(command)) return true;
  if (isChromiumProcess(command)) return true;
  if (exe === 'make' && hasArg(args, ['test'])) return true;
  if (exe === 'docker' && hasArg(args, ['build', 'compose', 'run'])) return true;
  if (/^(tsc|esbuild)$/u.test(exe)) return true;
  if (/^(npm|npx)$/u.test(exe) && hasArg(args, ['test', 'vitest', 'eval', 'baseline'])) return true;
  if (exe === 'codex' && hasArg(args, ['task', 'exec', 'review'])) return true;
  if (tools.includes('codex-companion.mjs') && hasArg(args, ['task'])) return true;
  return tools.includes('claude-review.mjs');
}

export function competingJobs(hostState, { ownPid, checkoutRoot }) {
  if (!Number.isInteger(ownPid)) throw new Error('ownPid must be an integer');
  if (typeof checkoutRoot !== 'string' || checkoutRoot === '') throw new Error('checkoutRoot is required');
  const ownTree = ownProcesses(hostState.processes, ownPid);
  const competing = [];
  const observed = [];
  for (const process of hostState.processes) {
    const exempt = ownTree.has(process.pid);
    if (!exempt && (matchesKnownWorkload(process) || process.pcpu >= 10)) competing.push(process);
    else observed.push(process);
  }
  return { competing, observed };
}
