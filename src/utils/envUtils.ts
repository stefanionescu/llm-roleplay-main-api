import { Env } from '../types.js';
import dotenv from 'dotenv';

/**
 * Initialize environment variables from .env file
 */
dotenv.config();

/**
 * Environment configuration validation and initialization
 *
 * Required environment variables:
 * - NODE_ENV: Node environment
 * - API_TOKEN: Authentication token for API requests
 * - SUPABASE_URL: Supabase instance URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 * - REDIS_REST_URL: Redis server URL
 * - REDIS_REST_PORT: Redis server port
 * - REDIS_PASSWORD: Redis authentication password
 */
export const env: Env = {
    NODE_ENV: process.env.NODE_ENV!,
    IP_CALL_LIMIT: parseInt(process.env.IP_CALL_LIMIT!),
    IP_CALL_WINDOW: parseInt(process.env.IP_CALL_WINDOW!),
    AUTHED_ALLOWED_IPS: process.env.AUTHED_ALLOWED_IPS!.split(','),
    API_TOKEN: process.env.API_TOKEN!,
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    REDIS_REST_URL: process.env.REDIS_REST_URL!,
    REDIS_REST_PORT: process.env.REDIS_REST_PORT!,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD!,
};
