export type Topology = {
  services: Record<'benign-login' | 'lookalike-origin' | 'dom-hidden-injection',
    { container: number; host: number; address: string }[]>;
  imageName: string; composePath: string; dockerfilePath: string; controlSocket: string;
  markers: Record<'HISTORY_MARKER' | 'ARTIFACT_MARKER' | 'EXPORT_MARKER' | 'BOOT_MARKER'
    | 'SHUTDOWN_MARKER' | 'BRIDGE_MARKER' | 'ARGV_MARKER', string>;
  healthcheck: { interval: string; timeout: string; retries: number; start_period: string };
};
export function validateTopology(value: unknown): Topology;
