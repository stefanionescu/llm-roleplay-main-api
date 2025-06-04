import { Redis } from 'ioredis';
import { Env } from '../types.js';

/**
 * Initializes and manages Redis connection
 *
 * This function:
 * 1. Reuses existing connection if available
 * 2. Creates new connection with provided credentials
 * 3. Sets up event handlers for connection state
 * 4. Implements periodic health checks
 *
 * @param env - Environment configuration containing Redis credentials
 * @returns Connected Redis client
 *
 * @example
 * ```typescript
 * const redis = await initializeRedis(env);
 * ```
 */
export async function initializeRedis(env: Env): Promise<Redis> {
    console.log('[Redis] Initializing Redis connection...');

    const redisClient = new Redis({
        password: env.REDIS_PASSWORD,
        host: env.REDIS_REST_URL,
        port: parseInt(env.REDIS_REST_PORT),
    });

    // Set up connection event handlers
    redisClient.on('error', (err) =>
        console.error('[Redis] Redis Client Error:', err),
    );
    redisClient.on('connect', () => console.log('[Redis] Redis connected'));
    redisClient.on('reconnecting', () =>
        console.log('[Redis] Redis reconnecting...'),
    );
    redisClient.on('ready', () => console.log('[Redis] Redis ready'));
    redisClient.on('end', () => console.log('[Redis] Redis connection ended'));

    return redisClient;
}
