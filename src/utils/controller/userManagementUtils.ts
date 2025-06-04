import validator from 'validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { UsernameValidationResult } from '../../types.js';
import { Redis } from 'ioredis';
import { Response } from 'express';
import { insertUser } from '../waitlistUtils.js';

/**
 * Validates and sanitizes a username (email or phone number).
 * @param username The raw username input.
 * @returns UsernameValidationResult object.
 */
export const validateAndSanitizeUsername = (
    username: unknown,
): UsernameValidationResult => {
    if (!username || typeof username !== 'string') {
        return {
            isValid: false,
            sanitizedIdentifier: null,
            error: 'Username required',
        };
    }

    let identifier = username as string;
    if (validator.isEmail(identifier)) {
        identifier = identifier.toLowerCase().trim();
        return { isValid: true, sanitizedIdentifier: identifier };
    }

    const phoneNumber = parsePhoneNumberFromString(identifier);
    if (phoneNumber && !phoneNumber.isValid()) {
        return {
            isValid: false,
            sanitizedIdentifier: null,
            error: 'Invalid phone number format or number is not valid',
        };
    }

    if (phoneNumber?.isValid()) {
        return { isValid: true, sanitizedIdentifier: phoneNumber.number };
    }

    return {
        isValid: false,
        sanitizedIdentifier: null,
        error: 'Invalid username format (must be email or phone)',
    };
};

/**
 * Checks if a user exists in the database.
 * @param supabaseClient Supabase client instance.
 * @param identifier The sanitized username (email or phone).
 * @param requestId The request ID for logging.
 * @returns Promise<boolean> True if the user exists, false otherwise.
 */
export const checkUserExists = async (
    supabaseClient: SupabaseClient,
    identifier: string,
    requestId: string,
): Promise<boolean> => {
    try {
        const { data: existsData, error: existsError } = await supabaseClient
            .schema('user_onboarding')
            .rpc('check_user_exists', { username: identifier });

        if (existsError) {
            console.error('[Check User Error]', {
                requestId,
                error: existsError,
            });
            // Propagate the error or return false? Decide based on desired behavior.
            // For now, let's return false and rely on controller error handling.
            return false;
        }

        console.log('[User Exists Check]', {
            requestId,
            username: identifier,
            exists: !!existsData,
        });

        return !!existsData;
    } catch (error) {
        console.error('[Check User Exists - Unexpected Error]', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
};

/**
 * Attempts to register a new user by incrementing the user count.
 * @param supabaseClient Supabase client instance.
 * @param identifier Sanitized username.
 * @param requestId Request ID for logging.
 * @returns Promise<boolean> True if registration was successful (user count incremented), false otherwise.
 */
export const registerNewUser = async (
    supabaseClient: SupabaseClient,
    identifier: string,
    requestId: string,
): Promise<boolean> => {
    console.log('[Calling increment_user_count]', {
        requestId,
        username: identifier,
    });

    try {
        const { data: incrementData, error: incrementError } =
            await supabaseClient
                .schema('user_onboarding')
                .rpc('increment_user_count', { username: identifier });

        if (incrementError) {
            console.error('[Increment Error]', {
                requestId,
                error: incrementError,
            });
            return false; // Indicate registration failure
        }

        console.log('[Increment Result]', {
            requestId,
            success: !!incrementData,
            data: incrementData,
        });

        return !!incrementData; // Returns true if the RPC call indicates success
    } catch (error) {
        console.error('[Register New User - Unexpected Error]', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
};

/**
 * Handles the response when a user attempting to register already exists.
 * Sends a JSON response indicating the user is already registered and their waitlist status.
 *
 * @param res The Express Response object.
 * @param identifier The sanitized username (email or phone).
 * @param waitlistPosition The user's position on the waitlist (0 if not on waitlist).
 * @param requestId The request ID for logging and metadata.
 * @param start The timestamp when the request processing started, for calculating duration.
 * @returns The Express Response object, configured to send the JSON response.
 */
export const handleExistingUserRegistration = (
    res: Response,
    identifier: string,
    waitlistPosition: number,
    requestId: string,
    start: number,
) => {
    console.log('[User Exists]', { requestId, identifier });
    return res.json({
        registered_signup: true,
        on_waitlist: waitlistPosition > 0,
        waitlist_position: waitlistPosition,
        metadata: {
            request_id: requestId,
            duration_ms: Date.now() - start,
            message: 'User is already registered',
        },
    });
};

/**
 * Handles the response when the user registration limit is reached.
 * Attempts to add the user to the waitlist. Sends a JSON response indicating
 * that the signup was not completed, but the user was added/found on the waitlist.
 * Includes error handling for waitlist addition failures.
 *
 * @param res The Express Response object.
 * @param redis The Redis client instance.
 * @param identifier The sanitized username (email or phone).
 * @param settings Application settings containing the waitlist limit.
 * @param requestId The request ID for logging and metadata.
 * @param start The timestamp when the request processing started, for calculating duration.
 * @returns A Promise resolving to the Express Response object, configured to send the JSON response.
 */
export const handleUserLimitReached = async (
    res: Response,
    redis: Redis,
    identifier: string,
    settings: { waitlist_limit: number },
    requestId: string,
    start: number,
) => {
    console.log('[User Limit Reached - Attempting Waitlist Add]', {
        requestId,
        identifier,
    });
    try {
        const waitlistResult = await insertUser(
            redis,
            { username: identifier },
            settings.waitlist_limit,
        );
        return res.json({
            registered_signup: false,
            on_waitlist: !!waitlistResult.id, // True if added or already existed on waitlist
            waitlist_position: waitlistResult.position,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
                message: !!waitlistResult.id
                    ? 'User limit reached, added/found on waitlist'
                    : 'User limit reached, failed to add to waitlist',
                already_existed_on_waitlist: waitlistResult.already_existed,
            },
        });
    } catch (error) {
        console.error('[Waitlist Addition Error - Limit Reached]', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Consistent error response structure
        return res.status(500).json({
            registered_signup: false,
            on_waitlist: false,
            waitlist_position: 0,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
                error: 'Failed to add to waitlist during user limit check',
            },
        });
    }
};

/**
 * Handles the registration attempt in "waitlist only" mode when the user is not yet eligible.
 * If the user is not already on the waitlist, it attempts to add them.
 * Sends a JSON response indicating the signup was not completed, the user's waitlist status,
 * and whether they were added or already existed. Includes error handling for waitlist addition.
 *
 * @param res The Express Response object.
 * @param redis The Redis client instance.
 * @param identifier The sanitized username (email or phone).
 * @param settings Application settings containing the waitlist limit.
 * @param isUserOnWaitlist Boolean indicating if the user is already known to be on the waitlist.
 * @param waitlistPosition The user's position on the waitlist (used if already on waitlist).
 * @param requestId The request ID for logging and metadata.
 * @param start The timestamp when the request processing started, for calculating duration.
 * @returns A Promise resolving to the Express Response object, configured to send the JSON response.
 */
export const handleWaitlistOnlyRegistration = async (
    res: Response,
    redis: Redis,
    identifier: string,
    settings: { waitlist_limit: number },
    isUserOnWaitlist: boolean,
    waitlistPosition: number,
    requestId: string,
    start: number,
) => {
    console.log('[Waitlist Only Mode - User Not Eligible]', {
        requestId,
        identifier,
        isUserOnWaitlist,
        waitlistPosition,
    });
    if (!isUserOnWaitlist) {
        // Add to waitlist if not already on it
        try {
            const waitlistResult = await insertUser(
                redis,
                { username: identifier },
                settings.waitlist_limit,
            );
            return res.json({
                registered_signup: false,
                on_waitlist: !!waitlistResult.id,
                waitlist_position: waitlistResult.position,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    message: 'Added to waitlist (waitlist only mode)',
                    already_existed_on_waitlist:
                        waitlistResult.already_existed,
                },
            });
        } catch (error) {
            console.error('[Waitlist Addition Error - Waitlist Only Mode]', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            // Consistent error response structure
            return res.status(500).json({
                registered_signup: false,
                on_waitlist: false,
                waitlist_position: 0,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    error: 'Failed to add to waitlist in waitlist-only mode',
                },
            });
        }
    } else {
        // Already on waitlist but not eligible
        return res.json({
            registered_signup: false,
            on_waitlist: true, // Already know they are on waitlist
            waitlist_position: waitlistPosition,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
                message: 'On waitlist, but not yet eligible for signup',
            },
        });
    }
};

/**
 * Checks if the user's registration should be blocked based on waitlist status and signup cutoff settings.
 * Sends a JSON response if registration is blocked.
 *
 * @param res The Express Response object.
 * @param identifier The sanitized username (email or phone).
 * @param waitlistPosition The user's position on the waitlist (0 if not on waitlist).
 * @param settings Application settings containing the signup cutoff.
 * @param isUserOnWaitlist Boolean indicating if the user is already known to be on the waitlist.
 * @param requestId The request ID for logging and metadata.
 * @param start The timestamp when the request processing started, for calculating duration.
 * @returns True if registration is blocked (response sent), false otherwise.
 */
export const checkWaitlistRegistrationBlocks = (
    res: Response,
    identifier: string,
    waitlistPosition: number,
    settings: { signup_cutoff: number },
    isUserOnWaitlist: boolean,
    requestId: string,
    start: number,
) => {
    if (isUserOnWaitlist) {
        if (settings.signup_cutoff < 0) {
            console.log(
                '[Registration Blocked] Signup cutoff is negative, user is on waitlist',
                { requestId, identifier },
            );
            res.json({
                registered_signup: false,
                on_waitlist: true,
                waitlist_position: waitlistPosition,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    message:
                        'Signup currently closed for waitlist users (negative cutoff)',
                },
            });
            return true; // Blocked
        } else if (waitlistPosition > settings.signup_cutoff) {
            console.log(
                '[Registration Blocked] User is on waitlist and below cutoff',
                {
                    requestId,
                    identifier,
                    waitlistPosition,
                    signup_cutoff: settings.signup_cutoff,
                },
            );
            res.json({
                registered_signup: false,
                on_waitlist: true,
                waitlist_position: waitlistPosition,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    message:
                        'On waitlist, but not yet eligible for signup based on cutoff',
                },
            });
            return true; // Blocked
        }
    }
    return false; // Not blocked by these checks
};

/**
 * Attempts the actual user registration by calling the database function.
 * Sends a JSON response indicating success or failure (including database errors).
 *
 * @param res The Express Response object.
 * @param supabaseClient Supabase client instance.
 * @param identifier The sanitized username (email or phone).
 * @param waitlistPosition The user's position on the waitlist (relevant if registration succeeds).
 * @param isUserOnWaitlist Boolean indicating if the user was on the waitlist before registration.
 * @param requestId The request ID for logging and metadata.
 * @param start The timestamp when the request processing started, for calculating duration.
 * @returns A Promise resolving to the Express Response object, configured to send the JSON response.
 */
export const attemptUserRegistration = async (
    res: Response,
    supabaseClient: SupabaseClient,
    identifier: string,
    waitlistPosition: number,
    isUserOnWaitlist: boolean,
    requestId: string,
    start: number,
) => {
    console.log('[Proceeding with Registration]', {
        requestId,
        identifier,
        isUserOnWaitlist,
    });
    const registrationSuccess = await registerNewUser(
        supabaseClient,
        identifier,
        requestId,
    );

    if (registrationSuccess) {
        console.log('[Registration Success]', { requestId, identifier });
        return res.json({
            registered_signup: true,
            on_waitlist: isUserOnWaitlist, // Use the passed flag
            waitlist_position: waitlistPosition,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
                message:
                    'User successfully registered' +
                    (isUserOnWaitlist ? ' (was on waitlist)' : ''),
            },
        });
    } else {
        // Registration failed (DB error)
        console.error('[Registration Failed - DB Error]', {
            requestId,
            identifier,
        });
        // Use status 500 for DB errors, but return JSON
        return res.status(500).json({
            registered_signup: false,
            on_waitlist: isUserOnWaitlist, // Use the passed flag
            waitlist_position: waitlistPosition,
            metadata: {
                request_id: requestId,
                duration_ms: Date.now() - start,
                error: 'Registration failed due to a database issue.',
            },
        });
    }
};