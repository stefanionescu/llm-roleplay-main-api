import { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';
import {
    getPositionByIdentifier,
    insertUser,
    isOnWaitlist,
} from '../../utils/waitlistUtils.js';
import { getCurrentOnboardingSettings } from '../../supabase/queries.js';
import {
    validateAndSanitizeUsername,
    checkUserExists,
    handleExistingUserRegistration,
    handleUserLimitReached,
    handleWaitlistOnlyRegistration,
    checkWaitlistRegistrationBlocks,
    attemptUserRegistration,
} from '../../utils/controller/userManagementUtils.js';

/**
 * @description Adds a user identifier (email or phone) to the Redis waitlist.
 * It checks if the username is provided and validates against the waitlist limit defined in settings.
 * @param {Request} req - Express request object, expecting 'username' in the body.
 * @param {Response} res - Express response object.
 * @param {Redis} redis - Redis client instance.
 * @param {SupabaseClient} supabaseClient - Supabase client instance (used to fetch settings).
 * @returns {Response} JSON response indicating success or failure, waitlist position, and if the user already existed.
 */
export const addToWaitlistController = async (
    req: Request,
    res: Response,
    redis: Redis,
    supabaseClient: SupabaseClient,
) => {
    const start = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                position: 0,
                already_existed: false,
                error: 'Username is required',
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                },
            });
        }

        const validation = validateAndSanitizeUsername(username);
        if (!validation.isValid || !validation.sanitizedIdentifier) {
            return res.status(400).json({
                already_registered: false,
                on_waitlist: false,
                can_sign_up: false,
                position: 0,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    error: validation.error || 'Invalid input',
                },
            });
        }

        const identifier = validation.sanitizedIdentifier;

        const settings = await getCurrentOnboardingSettings(supabaseClient);

        const result = await insertUser(
            redis,
            { username: identifier },
            settings.waitlist_limit,
        );

        // If validation failed
        if (!result.id) {
            return res.json({
                success: false,
                position: 0,
                already_existed: false,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                },
            });
        }

        res.json({
            success: true,
            position: result.position,
            already_existed: result.already_existed,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
            },
        });
    } catch (error) {
        console.error('[Waitlist] Error:', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration_ms: Date.now() - start,
        });

        res.status(500).json({
            success: false,
            position: 0,
            error: 'Internal server error',
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
            },
        });
    }
};

/**
 * @description Checks if a user on the waitlist is eligible to sign up based on their position and the current signup cutoff limit.
 * @param {Request} req - Express request object, expecting 'username' as a query parameter.
 * @param {Response} res - Express response object.
 * @param {Redis} redis - Redis client instance.
 * @param {SupabaseClient} supabaseClient - Supabase client instance (used to fetch settings).
 * @returns {Response} JSON response indicating if the user is on the waitlist, if they can sign up, and their position.
 */
export const waitlistUserCanSignUpController = async (
    req: Request,
    res: Response,
    redis: Redis,
    supabaseClient: SupabaseClient,
) => {
    const start = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
        const { username } = req.query;

        if (!username) {
            return res.status(400).json({
                already_registered: false,
                on_waitlist: false,
                can_sign_up: false,
                position: 0,
                error: 'Username (email or phone) is required',
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                },
            });
        }

        const validation = validateAndSanitizeUsername(username);
        if (!validation.isValid || !validation.sanitizedIdentifier) {
            return res.status(400).json({
                already_registered: false,
                on_waitlist: false,
                can_sign_up: false,
                position: 0,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    error: validation.error || 'Invalid input',
                },
            });
        }

        const identifier = validation.sanitizedIdentifier;

        // Step 1: Fetch initial state concurrently
        // We need user existence status, waitlist status, and settings
        const [userExists, userIsOnWaitlist, settings] = await Promise.all([
            checkUserExists(supabaseClient, identifier, requestId),
            isOnWaitlist(redis, identifier),
            getCurrentOnboardingSettings(supabaseClient),
        ]);

        // Step 2: Handle different scenarios

        // Scenario: User is already registered
        if (userExists) {
            // Check if they are also on the waitlist to get position
            const position = userIsOnWaitlist
                ? await getPositionByIdentifier(redis, identifier)
                : 0;
            return res.json({
                already_registered: true,
                on_waitlist: userIsOnWaitlist,
                can_sign_up: false, // Already registered, so "can sign up" is false
                position: position,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    message: 'User is already registered.',
                },
            });
        }

        // Scenario: User is not registered, check waitlist status

        // If not on waitlist (and not registered)
        if (!userIsOnWaitlist) {
            return res.json({
                already_registered: false, // Not registered
                on_waitlist: false,
                can_sign_up: false,
                position: 0,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                },
            });
        }

        // If on waitlist (and not registered) - determine eligibility
        const position = await getPositionByIdentifier(redis, identifier); // Already know they are on waitlist

        const canSignUp = settings.signup_cutoff >= 0 && position <= settings.signup_cutoff;

        res.json({
            already_registered: false, // Not registered
            on_waitlist: true,
            can_sign_up: canSignUp,
            position: position,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
            },
        });
    } catch (error) {
        console.error('[Waitlist Check] Error:', { // Updated log context
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration_ms: Date.now() - start,
        });

        res.status(500).json({
            already_registered: false, // Assume false on error
            on_waitlist: false,
            can_sign_up: false,
            position: 0,
            error: 'Internal server error',
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
            },
        });
    }
};

/**
 * @description Checks if a given user identifier (email or phone) exists on the waitlist.
 * @param {Request} req - Express request object, expecting 'username' as a query parameter.
 * @param {Response} res - Express response object.
 * @param {Redis} redis - Redis client instance.
 * @returns {Response} JSON response indicating whether the user is on the waitlist.
 */
export const isOnWaitlistController = async (
    req: Request,
    res: Response,
    redis: Redis,
) => {
    const start = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
        const { username } = req.query;

        if (!username) {
            return res.status(400).json({
                on_waitlist: false,
                error: 'Username (email or phone) is required',
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                },
            });
        }

        const validation = validateAndSanitizeUsername(username);
        if (!validation.isValid || !validation.sanitizedIdentifier) {
            return res.status(400).json({
                already_registered: false,
                on_waitlist: false,
                can_sign_up: false,
                position: 0,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    error: validation.error || 'Invalid input',
                },
            });
        }

        const identifier = validation.sanitizedIdentifier;
        const userIsOnWaitlist = await isOnWaitlist(redis, identifier);

        // Add debug logging
        console.log('[Debug] isOnWaitlist check:', {
            identifier,
            userIsOnWaitlist,
            requestId,
        });

        res.json({
            on_waitlist: userIsOnWaitlist,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
            },
        });
    } catch (error) {
        console.error('[Waitlist] Error:', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration_ms: Date.now() - start,
        });

        res.status(500).json({
            on_waitlist: false,
            error: 'Internal server error',
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
            },
        });
    }
};

/**
 * @description Handles the normal user registration process.
 * It validates the input, checks for existing users, manages registration limits and waitlist logic,
 * attempts registration if applicable, and handles removing users from the waitlist upon successful registration.
 * @param {Request} req - Express request object, expecting 'username' in the body.
 * @param {Response} res - Express response object.
 * @param {Redis} redis - Redis client instance for waitlist interactions.
 * @param {SupabaseClient} supabaseClient - Supabase client instance for user data and settings.
 * @returns {Response} JSON response detailing registration status, waitlist status, and position if applicable.
 */
export const registerUserController = async (
    req: Request,
    res: Response,
    redis: Redis,
    supabaseClient: SupabaseClient,
) => {
    const start = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
        const { username: rawUsername } = req.body;

        console.log('[Request Start]', {
            requestId,
            endpoint: 'register-user',
            params: { has_username: !!rawUsername },
        });

        // Step 1: Validate input using helper
        const validation = validateAndSanitizeUsername(rawUsername);
        // Check the validation result
        if (!validation.isValid || !validation.sanitizedIdentifier) {
            return res.status(400).json({
                registered_signup: false,
                on_waitlist: false,
                waitlist_position: 0,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    error: validation.error || 'Invalid input',
                },
            });
        }
        // Now we know validation is valid and sanitizedIdentifier exists
        const identifier = validation.sanitizedIdentifier;

        console.log('[Sanitized Identifier]', {
            requestId,
            original: rawUsername,
            sanitized: identifier,
        });

        // Step 2: Fetch initial state concurrently
        const [userExists, settings, waitlistPosition] = await Promise.all([
            checkUserExists(supabaseClient, identifier, requestId),
            getCurrentOnboardingSettings(supabaseClient),
            getPositionByIdentifier(redis, identifier),
        ]);

        const isUserOnWaitlist = waitlistPosition > 0;
        const isWaitlistEligible = isUserOnWaitlist &&
                                settings.signup_cutoff > 0 &&
                                waitlistPosition <= settings.signup_cutoff;

        const userLimitReached = settings.signed_up_user_limit > 0 &&
                                settings.signed_up_users >= settings.signed_up_user_limit;

        console.log('[Initial State]', {
            requestId, identifier, userExists, isUserOnWaitlist,
            waitlistPosition, isWaitlistEligible, userLimitReached,
            allowed_registrations: settings.allowed_registrations,
            signup_cutoff: settings.signup_cutoff // Added for context
        });

        // Step 3: Handle different scenarios using helpers

        // Scenario: User already exists
        if (userExists) {
            return handleExistingUserRegistration(
                res, identifier, waitlistPosition, requestId, start
            );
        }

        // User does not exist in Supabase tracking
        console.log('[User Does Not Exist]', { requestId, identifier });

        // Scenario: User limit reached
        if (userLimitReached) {
            return handleUserLimitReached(
                res, redis, identifier, settings, requestId, start
            );
        }

        // Scenario: Registration is waitlist-only AND user is not eligible
        if (settings.allowed_registrations === 'waitlist' && !isWaitlistEligible) {
             return handleWaitlistOnlyRegistration(
                res, redis, identifier, settings, isUserOnWaitlist, waitlistPosition, requestId, start
             );
        }

        // Scenario: Registration allowed (mode is 'all' OR mode is 'waitlist' and user is eligible)
        // First, check for specific waitlist-related blocks even if registration is 'all'
        const blocked = checkWaitlistRegistrationBlocks(
            res, identifier, waitlistPosition, settings, isUserOnWaitlist, requestId, start
        );
        if (blocked) {
            return; // Response already sent by helper
        }

        // Proceed with registration if not blocked
        return attemptUserRegistration(
            res, supabaseClient, identifier, waitlistPosition, isUserOnWaitlist, requestId, start
        );

    } catch (error) {
        console.error('[Request Failed - Top Level Error]', {
            requestId,
            error:
                error instanceof Error
                    ? {
                          message: error.message,
                          stack: error.stack,
                          name: error.name,
                      }
                    : 'Unknown error',
            duration_ms: Date.now() - start,
        });

        // Generic error response for unexpected issues
        res.status(500).json({
            registered_signup: false,
            on_waitlist: false,
            waitlist_position: 0,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
                error:
                    error instanceof Error
                        ? error.message // Consider masking generic errors in prod
                        : 'Internal server error',
            },
        });
    }
};
