export const EXPECTED_TEST_COMMANDS: readonly string[];
export const ENTRY_RULES: readonly string[];
export function checkEntryDocuments(documents: unknown): void;
export function readEntryDocuments(root: string): unknown;
export function resetReports(root: string, docker?: boolean): void;
