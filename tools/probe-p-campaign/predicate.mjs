import path from 'node:path';

export const PREDICATE_VERSION = 5;

const REPOSITORY_NAME = 'tinyvault';
const RULE_B_CPU_PERCENT = 10;

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

function ancestors(processes, ownPid) {
  const ancestorPids = new Set();
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const visited = new Set();
  let pid = byPid.get(ownPid)?.ppid;
  while (Number.isInteger(pid) && !visited.has(pid)) {
    visited.add(pid);
    ancestorPids.add(pid);
    if (pid === 1) break;
    const parent = byPid.get(pid)?.ppid;
    if (!Number.isInteger(parent)) break;
    pid = parent;
  }
  return ancestorPids;
}

function basename(token) {
  return token.split('/').at(-1) ?? '';
}

function hasArg(args, alternatives) {
  return args.some((arg) => alternatives.includes(arg.replace(/^--?[^=]+=/u, '')));
}

function isPlaywrightManagedBrowser(command) {
  if (/(?:^|\/)(?:chrome_)?crashpad_handler(?:\s|$)/iu.test(command)) return false;
  const firstToken = command.split(/\s+/u)[0] ?? '';
  if (/(?:^|\/)ms-playwright(?:\/|$)/iu.test(firstToken)) return true;
  return /^(?:.*\/)?(?:Google Chrome for Testing(?: Helper(?: \([^)]+\))?)?|chrome-headless-shell)(?:\s|$)/iu.test(command);
}

function hasToolPath(tokens, tool) {
  return tokens.some((token) => token.split('/').some((part) => {
    const normalized = part.toLowerCase();
    return normalized === tool || normalized === `${tool}.mjs` || normalized === `@${tool}`;
  }));
}

function hasScopedPackage(token, scope, name) {
  const parts = token.toLowerCase().split('/');
  return parts.some((part, index) => part === `@${scope}` && parts[index + 1] === name);
}

function isTestRunner(tokens) {
  if (hasToolPath(tokens, 'vitest')) return true;
  if (tokens.some((token) => hasScopedPackage(token, 'playwright', 'test'))) return true;

  return tokens.some((token, index) => {
    const parts = token.toLowerCase().split('/');
    const tool = parts.at(-1) ?? '';
    const action = hasArg(tokens.slice(index + 1), ['test', 'run']);
    if ((tool === 'playwright' || tool === 'playwright.mjs') && action) return true;
    if (!parts.includes('playwright') && !parts.includes('playwright-core')) return false;
    const cli = parts.some((part) => part === 'cli' || part === 'cli.js');
    return cli && action;
  });
}

function isCodexTask(tokens) {
  const executable = tokens.findIndex((token) => basename(token).toLowerCase().startsWith('codex'));
  return executable >= 0
    && hasArg(tokens.slice(executable + 1), ['task', 'exec', 'review', 'adversarial-review']);
}

function isCompilerOrBundler(exe, args) {
  if (/^(?:tsc|esbuild)$/u.test(exe)) return true;
  if (exe === 'npx' && args.some((arg) => /^(?:tsc|esbuild)$/u.test(basename(arg)))) return true;
  if (exe !== 'node') return false;
  return args.some((arg) => /(?:^|\/)(?:typescript\/bin\/tsc|esbuild\/bin\/esbuild)$/u.test(arg));
}

function absolutePaths(command) {
  return command.match(/\/[^\s"'`]+/gu)?.map((candidate) => candidate.replace(/[),;\]}]+$/u, '')) ?? [];
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function referencesAnotherCheckout(command, checkoutRoot) {
  const repositoryName = new RegExp(`(?:^|[^A-Za-z0-9])${REPOSITORY_NAME}(?:[^A-Za-z0-9]|$)`, 'u');
  return absolutePaths(command).some((candidate) =>
    repositoryName.test(candidate) && !isWithin(candidate, checkoutRoot));
}

function matchesRuleA(process, checkoutRoot) {
  const command = process.command.trim();
  const tokens = command.split(/\s+/u);
  const exe = basename(tokens[0] ?? '').toLowerCase();
  const args = tokens.slice(1);
  if (isTestRunner(tokens)) return true;
  if (isPlaywrightManagedBrowser(command)) return true;
  if (exe === 'make' && hasArg(args, ['test', 'eval', 'baseline', 'test-docker'])) return true;
  if (/^(?:npm|npx)$/u.test(exe) && hasArg(args, ['test', 'eval', 'baseline', 'test:docker'])) return true;
  if ((exe === 'docker' && hasArg(args, ['build', 'compose'])) || exe === 'docker-compose') return true;
  if (isCompilerOrBundler(exe, args)) return true;
  if (isCodexTask(tokens)) return true;
  if (tokens.some((token) => basename(token).toLowerCase() === 'claude-review.mjs')) return true;
  return /^(?:node|npm|npx|make)$/u.test(exe) && referencesAnotherCheckout(command, checkoutRoot);
}

export function competingJobs(hostState, { ownPid, checkoutRoot }) {
  if (!Number.isInteger(ownPid)) throw new Error('ownPid must be an integer');
  if (typeof checkoutRoot !== 'string' || checkoutRoot === '') throw new Error('checkoutRoot is required');
  const ownTree = descendants(hostState.processes, ownPid);
  const ancestorChain = ancestors(hostState.processes, ownPid);
  const competing = [];
  const observed = [];
  for (const process of hostState.processes) {
    const own = ownTree.has(process.pid);
    const ruleA = !ancestorChain.has(process.pid) && matchesRuleA(process, checkoutRoot);
    if (!own && (ruleA || process.pcpu >= RULE_B_CPU_PERCENT)) competing.push(process);
    else observed.push(process);
  }
  return { competing, observed };
}
