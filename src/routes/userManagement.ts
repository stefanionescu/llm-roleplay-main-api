import express from 'express';
import cors from 'cors';
import { Redis } from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';
import {
    addToWaitlistController,
    isOnWaitlistController,
    registerUserController,
    waitlistUserCanSignUpController,
} from '../controllers/userManagement/userManagementControllers.js';
import { env } from '../utils/envUtils.js';

/**
 * Creates and configures the Express Router for user management endpoints.
 * This includes routes for waitlist operations and user registration.
 *
 * @param {Redis | null} redisClient - An initialized ioredis client instance, or null if Redis is not available.
 * @param {SupabaseClient} supabaseClient - An initialized Supabase client instance.
 * @returns {express.Router} An Express router instance with the defined user management routes.
 */
export const userManagementRouter = (
    redisClient: Redis | null,
    supabaseClient: SupabaseClient,
) => {
    const router = express.Router();

    // Define allowed origins based on environment
    const allowedOrigins = process.env.NODE_ENV === 'production'
        ? env.AUTHED_ALLOWED_IPS
        : '*'; // Allow all for development

    const corsOptions = {
        origin: allowedOrigins,
        methods: ['GET', 'POST'], // Allow GET and POST requests
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 200 // For legacy browser support
    };

    // Use the cors middleware
    router.use(cors(corsOptions));

    /**
     * @route POST /add-to-waitlist
     * @description Endpoint to add a user (identified by username in the request body) to the waitlist.
     * Passes the request to the addToWaitlistController.
     * Requires Redis client.
     */
    router.post('/add-to-waitlist', async (req, res) => {
        // The non-null assertion (!) assumes redisClient will be available for routes needing it.
        // Proper error handling for null redisClient might be needed if its availability is optional.
        await addToWaitlistController(req, res, redisClient!, supabaseClient);
    });

    /**
     * @route GET /waitlist-user-can-sign-up
     * @description Endpoint to check if a user (identified by username query parameter) on the waitlist is eligible to sign up.
     * Passes the request to the waitlistUserCanSignUpController.
     * Requires Redis client.
     */
    router.get('/waitlist-user-can-sign-up', async (req, res) => {
        // Assumes redisClient is available.
        await waitlistUserCanSignUpController(
            req,
            res,
            redisClient!,
            supabaseClient,
        );
    });

    /**
     * @route GET /is-on-waitlist
     * @description Endpoint to check if a user (identified by username query parameter) is currently on the waitlist.
     * Passes the request to the isOnWaitlistController.
     * Requires Redis client.
     */
    router.get('/is-on-waitlist', async (req, res) => {
        // Assumes redisClient is available.
        await isOnWaitlistController(req, res, redisClient!); // Supabase not needed for this check
    });

    /**
     * @route POST /register-user
     * @description Endpoint to handle the normal user registration process.
     * Takes a username in the request body.
     * Passes the request to the registerUserController.
     * Requires both Redis and Supabase clients.
     */
    router.post('/register-user', async (req, res) => {
        // Assumes redisClient is available.
        await registerUserController(req, res, redisClient!, supabaseClient);
    });

    // Return the configured router instance.
    return router;
};
