import { Redis } from 'ioredis';
import validator from 'validator';
import { v4 as uuidv4 } from 'uuid';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { UserData, InsertResult } from '../types.js';
import { WAITLIST_KEYS, REDIS_SCRIPTS } from '../constants.js';

/**
 * Finds a user's position in the waitlist by their email or phone
 * @param redis - Redis client instance
 * @param identifier - Email address or phone number
 * @returns Position in waitlist (1-based), or 0 if not found
 *
 * Implementation:
 * 1. Looks up user ID from email hash
 * 2. If not found, looks up from phone hash
 * 3. If found, scans waitlist for position
 * 4. Returns 0 if user not found in any step
 */
export async function getPositionByIdentifier(
    redis: Redis,
    identifier: string,
): Promise<number> {
    const script = REDIS_SCRIPTS.getPositionByIdentifier;

    return (await redis.eval(
        script,
        3,
        WAITLIST_KEYS.waitlist,
        WAITLIST_KEYS.emails,
        WAITLIST_KEYS.phones,
        identifier,
    )) as number;
}

/**
 * Checks if a user exists in the waitlist
 * @param redis - Redis client instance
 * @param identifier - Email or phone number to check
 * @returns true if user exists, false otherwise
 *
 * Implementation:
 * 1. Checks email hash for identifier
 * 2. If not found, checks phone hash
 * 3. Returns true if found in either hash
 */
export async function isOnWaitlist(
    redis: Redis,
    identifier: string,
): Promise<boolean> {
    const script = REDIS_SCRIPTS.isOnWaitlist;

    const result = (await redis.eval(
        script,
        2,
        WAITLIST_KEYS.emails,
        WAITLIST_KEYS.phones,
        identifier,
    )) as number;

    return result === 1;
}

/**
 * Gets a user's position by their internal ID
 * @param redis - Redis client instance
 * @param id - User's unique ID
 * @returns Position in waitlist (1-based), or 0 if not found
 *
 * Implementation:
 * Scans waitlist list for matching ID and returns position
 */
export async function getPosition(redis: Redis, id: string): Promise<number> {
    const script = REDIS_SCRIPTS.getPosition;

    return (await redis.eval(script, 1, WAITLIST_KEYS.waitlist, id)) as number;
}

/**
 * Adds a new user to the waitlist or retrieves existing user
 * @param redis - Redis client instance
 * @param data - User data containing username (email/phone) and optional metadata
 * @param waitlistLimit - Maximum allowed users in waitlist
 * @returns Object containing user ID, position, and existence status
 * @throws Error if username invalid or waitlist full
 *
 * Implementation:
 * 1. Validates and normalizes email/phone
 * 2. Checks for existing user by email/phone
 * 3. If exists, returns current position
 * 4. If new:
 *    - Verifies under waitlist limit
 *    - Generates unique ID
 *    - Adds to waitlist list
 *    - Creates identifier mappings
 *    - Stores user data
 */
export async function insertUser(
    redis: Redis,
    data: UserData,
    waitlistLimit: number,
): Promise<InsertResult> {
    const id = uuidv4();
    const username = data.username.trim();

    // Check if username is email or phone
    let sanitizedEmail: string | null = null;
    let sanitizedPhone: string | null = null;

    if (validator.isEmail(username)) {
        sanitizedEmail = username.toLowerCase();
    } else {
        const phoneNumber = parsePhoneNumberFromString(username);
        if (phoneNumber?.isValid()) {
            sanitizedPhone = phoneNumber.number; // Use E.164 format
        } else {
            console.error(`Invalid identifier format: ${username}`);
            return { id: '', position: 0, already_existed: false };
        }
    }

    // Ensure we have at least one valid identifier
    if (!sanitizedEmail && !sanitizedPhone) {
        console.error(
            `No valid email or phone number could be derived from: ${username}`,
        );
        return { id: '', position: 0, already_existed: false };
    }

    const script = REDIS_SCRIPTS.insertUser;

    // Prepare user data to be stored, ensuring ID is correct
    const finalUserId = uuidv4(); // Generate potential new ID
    const userDataToStore = {
        id: '', // This will be set based on whether the user exists or is new
        email: sanitizedEmail,
        phone: sanitizedPhone,
        metadata: data.metadata,
    };

    const [pos, existsNum, returnedUserId] = (await redis.eval(
        script,
        4, // Number of keys
        WAITLIST_KEYS.waitlist,
        WAITLIST_KEYS.emails,
        WAITLIST_KEYS.phones,
        WAITLIST_KEYS.users, // Add users key
        finalUserId, // Pass the potentially new ID
        sanitizedEmail || '',
        sanitizedPhone || '',
        waitlistLimit,
        JSON.stringify(userDataToStore), // Pass initial user data (ID will be updated in Lua if exists)
    )) as [number, number, string];

    if (pos === -1) {
        throw new Error(`Waitlist is full (limit: ${waitlistLimit})`);
    }

    // Determine the correct user ID (new or existing)
    const actualUserId = existsNum === 1 ? returnedUserId : finalUserId;

    // If the user was new, the Lua script already stored the data with finalUserId.
    // If the user existed, the Lua script updated the data with returnedUserId.
    // We might need a final HSET outside Lua if complex merging is required,
    // but the current script handles the basic store/update.

    return {
        id: actualUserId,
        position: pos,
        already_existed: existsNum === 1,
    };
}
