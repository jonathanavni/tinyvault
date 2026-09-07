export function entrySelftest(check: (doc: unknown) => void,
  reset: (root: string, mode?: 'test' | 'docker' | 'eval') => void, rules: readonly string[]): void;
