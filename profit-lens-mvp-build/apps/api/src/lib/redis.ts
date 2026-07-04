import { Redis } from "ioredis";

/**
 * Creates a Redis connection suitable for BullMQ
 * (maxRetriesPerRequest must be null for blocking commands).
 */
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export type { Redis };
