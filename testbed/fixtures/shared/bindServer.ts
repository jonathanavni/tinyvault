import type { Server } from 'node:net';
import type { FixtureReachability } from '../transport';

export type BindOptions = Readonly<{
  host?: string; port?: number; onListenPermissionError?: 'substitute' | 'fail';
}>;
export type FixtureListenOptions = BindOptions & Readonly<{ publicOrigin?: string; page?: string }>;

// The single EPERM substitution site. Container callers require a real listening socket.
export async function bindServer(server: Server, options: BindOptions = {}): Promise<FixtureReachability> {
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => { server.off('error', failed); reject(error); };
      server.once('error', failed);
      try {
        server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
          server.off('error', failed);
          resolve();
        });
      } catch (error) { server.off('error', failed); reject(error); }
    });
    return 'http';
  } catch (error) {
    if (options.onListenPermissionError === 'fail') throw error;
    if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    return 'no-socket';
  }
}
