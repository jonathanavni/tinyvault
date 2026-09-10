function parseElapsedSeconds(value) {
  const dayParts = value.split('-');
  if (dayParts.length > 2) return null;
  const hasDays = dayParts.length === 2;
  const clock = dayParts.at(-1).split(':');
  if (clock.length !== 2 && clock.length !== 3) return null;
  if (hasDays && clock.length !== 3) return null;
  const fields = [...dayParts.slice(0, -1), ...clock];
  if (fields.some((field) => !/^\d+$/u.test(field))) return null;
  const days = hasDays ? Number(dayParts[0]) : 0;
  const [hours, minutes, seconds] = clock.length === 2
    ? [0, Number(clock[0]), Number(clock[1])]
    : clock.map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const elapsed = (((days * 24) + hours) * 60 + minutes) * 60 + seconds;
  return Number.isSafeInteger(elapsed) ? elapsed : null;
}

export function parsePs(text) {
  const processes = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.+)$/u.exec(line);
    if (!match) continue;
    const etimes = parseElapsedSeconds(match[4]);
    if (etimes === null) continue;
    processes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pcpu: Number(match[3]),
      etimes,
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
