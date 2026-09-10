export function spinForMicroseconds(microseconds: number): void {
  const end = performance.now() + microseconds / 1_000;
  while (performance.now() < end) { /* test-side calibration spin */ }
}
