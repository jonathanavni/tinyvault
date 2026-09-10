export function parsePs(text) {
  const processes = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/u.exec(line);
    if (!match) continue;
    processes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pcpu: Number(match[3]),
      etimes: Number(match[4]),
      command: match[5],
    });
  }
  return processes;
}

export function parseLoadAverage(text) {
  const match = /load averages?:\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/iu.exec(text);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function parseInteger(text) {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function parsePackageVersion(text) {
  try {
    const version = JSON.parse(text).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

export function processCapture(text, exitCode) {
  const processes = exitCode === 0 ? parsePs(text) : [];
  const dataLines = text.split(/\r?\n/u).filter((line) => line.trim() !== ''
    && !/^\s*PID\s+PPID\s+%?CPU\s+ELAPSED\s+COMMAND\s*$/iu.test(line));
  const parsedAll = processes.length > 0 && processes.length === dataLines.length;
  return {
    status: exitCode !== 0 ? 'failed' : parsedAll ? 'ok' : 'unparseable',
    exit: exitCode,
    bytes: Buffer.byteLength(text),
    processes,
  };
}

export function parseChromiumIdentity(packageText, cacheText) {
  const playwrightCore = parsePackageVersion(packageText);
  const cacheDirectories = cacheText.split(/\r?\n/u).map((value) => value.trim())
    .filter((value) => /^(?:chromium|chromium_headless_shell)-\d+$/u.test(value));
  if (playwrightCore === null && cacheDirectories.length === 0) return null;
  return { playwrightCore, cacheDirectories };
}

export function optionalCapture(text, exitCode) {
  return exitCode === 0 ? text.trim() || null : null;
}
