export function entrySelftest(check: (doc: unknown) => void,
  reset: (root: string, docker?: boolean) => void, rules: readonly string[]): void;
