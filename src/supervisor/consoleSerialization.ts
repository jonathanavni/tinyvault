const CONSOLE_ARG_LIMIT = 32;
const CONSOLE_ARG_BYTES = 8 * 1024;
const CONSOLE_EVENT_BYTES = 64 * 1024;
const CONSOLE_PREVIEW_PROPERTY_LIMIT = 64;
const CONSOLE_PREVIEW_NAME_BYTES = 256;
const CONSOLE_PREVIEW_VALUE_BYTES = 512;
const TRUNCATION_MARKER = '…[truncated]';
const PREVIEW_OVERFLOW_MARKER = '…[preview-overflow]';
const ABBREVIATED_MARKER = '…[abbreviated]';
const ARGUMENT_BUDGET_MARKER = 'x-tinyvault-console-arguments-truncated';
const EVENT_BUDGET_MARKER = 'x-tinyvault-console-event-truncated';
export const CONSOLE_BUDGET_EXCEEDED = 'x-tinyvault-console-budget-exceeded';

export type RemoteObjectLike = Readonly<{
  type?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  preview?: Readonly<{
    overflow?: boolean;
    properties?: readonly Readonly<{
      name: string;
      value?: string;
      description?: string;
    }>[];
  }>;
}>;

export function consoleEventBytes(type: string, remoteArgs: readonly RemoteObjectLike[]): string {
  const args = remoteArgs.slice(0, CONSOLE_ARG_LIMIT).map(serializeConsoleArgument);
  if (remoteArgs.length > CONSOLE_ARG_LIMIT) args.push(ARGUMENT_BUDGET_MARKER);
  const boundedType = boundedString(type, CONSOLE_PREVIEW_VALUE_BYTES);
  let bytes = JSON.stringify({ type: boundedType, args });
  if (Buffer.byteLength(bytes, 'utf8') <= CONSOLE_EVENT_BYTES) return bytes;
  while (args.length > 0) {
    args.pop();
    const candidate = JSON.stringify({ type: boundedType, args: [...args, EVENT_BUDGET_MARKER] });
    if (Buffer.byteLength(candidate, 'utf8') <= CONSOLE_EVENT_BYTES) return candidate;
  }
  bytes = JSON.stringify({ type: boundedType, args: [EVENT_BUDGET_MARKER] });
  return bytes;
}

function serializeConsoleArgument(remote: RemoteObjectLike): unknown {
  let value: unknown;
  if (Object.hasOwn(remote, 'value')) value = boundedConsolePrimitive(remote.value);
  else if (remote.unserializableValue !== undefined) {
    value = boundedString(remote.unserializableValue, CONSOLE_PREVIEW_VALUE_BYTES);
  } else if (remote.preview?.properties !== undefined) {
    const properties: Array<readonly [string, unknown]> = remote.preview.properties
      .slice(0, CONSOLE_PREVIEW_PROPERTY_LIMIT).map((property) => {
        const source = property.value ?? property.description ?? '';
        const abbreviated = property.value?.includes('…') === true;
        return [
          boundedString(property.name, CONSOLE_PREVIEW_NAME_BYTES),
          abbreviated
            ? appendMarkerBounded(source, CONSOLE_PREVIEW_VALUE_BYTES, ABBREVIATED_MARKER)
            : boundedString(source, CONSOLE_PREVIEW_VALUE_BYTES),
        ] as const;
      });
    if (remote.preview.overflow === true || remote.preview.properties.length > CONSOLE_PREVIEW_PROPERTY_LIMIT) {
      properties.push([PREVIEW_OVERFLOW_MARKER, true]);
    }
    value = Object.fromEntries(properties);
  } else value = boundedString(remote.description ?? remote.type ?? '', CONSOLE_PREVIEW_VALUE_BYTES);
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') <= CONSOLE_ARG_BYTES) return value;
  // This fallback becomes a JSON string in the enclosing event. Its source is already JSON-escaped, so reserve
  // the worst-case second escaping of every byte plus the outer quotes before returning it.
  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  const safeBytes = Math.floor((CONSOLE_ARG_BYTES - markerBytes - 2) / 2);
  return `${truncateUtf8(serialized, safeBytes)}${TRUNCATION_MARKER}`;
}

function boundedConsolePrimitive(value: unknown): unknown {
  // Reserve the enclosing JSON string quotes so an ordinary long string uses the full argument budget once.
  if (typeof value === 'string') return boundedString(value, CONSOLE_ARG_BYTES - 2);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return boundedString(String(value), CONSOLE_PREVIEW_VALUE_BYTES);
  return '';
}

function boundedString(value: string, limit: number, marker = TRUNCATION_MARKER): string {
  if (value.length <= limit && Buffer.byteLength(value, 'utf8') <= limit) return value;
  return `${truncateUtf8(value, limit - Buffer.byteLength(marker, 'utf8'))}${marker}`;
}

function appendMarkerBounded(value: string, limit: number, marker: string): string {
  return `${truncateUtf8(value, limit - Buffer.byteLength(marker, 'utf8'))}${marker}`;
}

function truncateUtf8(value: string, limit: number): string {
  const candidate = value.length > limit ? value.slice(0, limit) : value;
  const bytes = Buffer.from(candidate, 'utf8');
  if (bytes.length <= limit) return candidate;
  return bytes.subarray(0, limit).toString('utf8').replace(/\uFFFD$/u, '');
}
