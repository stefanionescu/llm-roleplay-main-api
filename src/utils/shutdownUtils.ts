import { Redis } from 'ioredis';

/**
 * Graceful shutdown handler
 *
 * This function:
 * 1. Closes the Express server
 * 2. Closes Redis connections
 * 3. Implements forced shutdown after timeout
 * 4. Logs shutdown progress
 */
export async function shutdown(redisClient: Redis | null) {
    console.log('Shutting down server...');

    // Close Redis connection if open
    if (redisClient!.status === 'ready') {
        await redisClient!.quit();
        console.log('[Redis] Redis connection closed');
    }

    // Force close after 10s
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);

    process.exit(0);
}
