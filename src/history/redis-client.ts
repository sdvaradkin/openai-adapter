import { Redis } from 'ioredis';

/**
 * Creates a lazily-connected Redis client with graceful degradation.
 * The client will not throw on connection failure — errors are logged as warnings.
 *
 * @param redisUrl - Redis connection URL (e.g. redis://localhost:6379)
 * @returns A configured Redis instance (not yet connected)
 */
export function createRedisClient(redisUrl: string): Redis {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times: number): number | null {
      if (times >= 3) {
        return null;
      }
      return Math.min(times * 100, 3000);
    },
  });

  client.on('error', (err: Error) => {
    console.warn(
      JSON.stringify({ level: 'warn', msg: 'Redis connection error', error: err.message }),
    );
  });

  return client;
}
