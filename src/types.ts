/**
 * Environment configuration type
 *
 * Contains all required environment variables for the application.
 * These values should be provided through environment variables
 * or a .env file at application startup.
 */
export type Env = {
    /** Node environment */
    NODE_ENV: string;

    /** IP call limit */
    IP_CALL_LIMIT: number;

    /** IP call window */
    IP_CALL_WINDOW: number;

    /** Authed allowed IPs */
    AUTHED_ALLOWED_IPS: string[];

    /** Authentication token for API requests */
    API_TOKEN: string;

    /** Base URL for Supabase instance */
    SUPABASE_URL: string;

    /** Supabase Service Role Key */
    SUPABASE_SERVICE_ROLE_KEY: string;

    /** Redis server URL */
    REDIS_REST_URL: string;

    /** Redis server port */
    REDIS_REST_PORT: string;

    /** Redis authentication password */
    REDIS_PASSWORD: string;
};

/**
 * Search result from vector similarity search
 *
 * Represents a single content match from the vector database,
 * including its relevance score and associated metadata.
 */
export type SearchResult = {
    /** Unique identifier for the search result */
    id: string;

    /** Reference to the full content in the database */
    full_content_id: string;

    /** Matched content snippet */
    content: string;

    /** Cosine similarity score (0-1) */
    similarity: number;
};

/**
 * Message data structure
 *
 * Represents a single message exchange between human and AI,
 * including metadata and relevant content references.
 */
export type Message = {
    /** Unique identifier for the message */
    message_id: string;

    /** Original human message text */
    message_raw_human: string;

    /** AI response text */
    message_raw_ai: string;

    /** Timestamp of message creation */
    message_created_at: string;

    /** Array of content pieces relevant to this message */
    message_relevant_content: string[];
};

/**
 * Onboarding settings configuration
 *
 * Contains settings that control user onboarding flow,
 * including limits and thresholds for different user types.
 */
export type OnboardingSettings = {
    /** Unique identifier for settings record */
    id: number;

    /** Current count of normally signed up users */
    signed_up_users: number;

    /** Maximum allowed normal signups */
    signed_up_user_limit: number;

    /** Maximum users allowed on waitlist */
    waitlist_limit: number;

    /** Maximum number of invite codes */
    invite_code_limit: number;

    /** Length of generated invite codes */
    invite_code_length: number;

    /** Timestamp after which signups are cut off */
    signup_cutoff: number;

    /** Whether anyone or only waitlist users can sign up */
    allowed_registrations: string;
};

/**
 * Express Request interface extension
 *
 * Extends the Express Request type to include our
 * environment configuration, making it available throughout
 * the request pipeline.
 */
declare module 'express-serve-static-core' {
    interface Request {
        /** Environment configuration */
        env?: Env;
    }
}

/**
 * Represents the data provided when adding a user to the waitlist.
 */
export type UserData = {
    /**
     * The user's primary identifier, which can be either an email address or a phone number.
     * This will be validated and normalized before use.
     */
    username: string;
    /**
     * Optional field for storing arbitrary additional information about the user.
     * This can be any valid JSON object.
     */
    metadata?: Record<string, any>;
};

/**
 * Represents the result returned after attempting to insert a user into the waitlist.
 */
export type InsertResult = {
    /**
     * The unique identifier assigned to the user (either newly generated or existing).
     */
    id: string; // User's unique ID
    /**
     * The user's position in the waitlist (1-based index). A position of 0 might indicate an error or invalid input in some contexts, although the `insertUser` function throws an error or returns specific failure states for invalid inputs.
     */
    position: number; // Position in waitlist (1-based)
    /**
     * A boolean flag indicating whether the user (identified by email or phone) was already present in the waitlist before this insertion attempt.
     * `true` if the user existed, `false` if they were newly added.
     */
    already_existed: boolean; // Whether user was already in waitlist
};

/**
 * Represents a result from a RAG (Retrieval-Augmented Generation) search
 * without hashtag filtering.
 */
export type RAGResult = {
    /** Unique identifier for the content section */
    id: string; // uuid
    /** Identifier for the parent full content item */
    full_content_id: string; // uuid
    /** The actual text content of the section */
    content: string;
    /** The similarity score between the query and the content section */
    similarity: number;
    /** Optional URL pointing to the original post or source */
    post_url: string | null;
    /** Optional identifier for the cloud storage bucket */
    storage_bucket_id: string | null;
    /** Optional name of the object in the cloud storage bucket */
    storage_object_name: string | null;
};

/**
 * Represents a result from a RAG (Retrieval-Augmented Generation) search
 * that includes hashtag filtering and information.
 */
export type RAGHashtagResult = {
    /** Unique identifier for the content section */
    result_id: string; // uuid
    /** Identifier for the parent full content item */
    result_full_content_id: string; // uuid
    /** The actual text content of the section */
    result_content: string;
    /** The similarity score between the query and the content section */
    result_similarity: number;
    /** Array of hashtags that matched the query filters */
    result_matching_hashtags: string[];
    /** Optional URL pointing to the original post or source */
    result_post_url: string | null;
    /** Optional identifier for the cloud storage bucket */
    result_storage_bucket_id: string | null;
    /** Optional name of the object in the cloud storage bucket */
    result_storage_object_name: string | null;
};

/**
 * Represents the processed and validated parameters for a RAG (Retrieval-Augmented Generation) query.
 * This type contains all the necessary parameters after they have been validated and processed
 * from the raw request query parameters.
 */
export type ProcessedRAGParams = {
    /** The unique identifier of the user making the request */
    user_id: string;

    /** The text to be used for similarity search */
    text: string;

    /** The language code of the text (e.g., 'en', 'es', 'fr') */
    language_code: string;

    /**
     * The minimum similarity threshold for results (0-1).
     * Results with similarity scores below this threshold will be filtered out.
     */
    similarity_threshold: number;

    /**
     * The maximum number of results to return.
     * This helps limit the response size and improve performance.
     */
    max_results: number;

    /**
     * Array of primary hashtags to filter results by.
     * Each hashtag represents a category or topic of interest.
     */
    hashtags: string[];

    /**
     * Array of secondary hashtag groups.
     * Each group is an array of related hashtags that form a logical group.
     * Used for more complex filtering scenarios.
     */
    secondaryHashtagGroups: string[][];

    /**
     * Flattened array of all secondary hashtags.
     * This is derived from secondaryHashtagGroups for easier processing.
     */
    secondaryHashtags: string[];

    /**
     * Array of group indices corresponding to each secondary hashtag.
     * Used to maintain the relationship between secondary hashtags and their groups.
     * Each number represents the 1-based index of the group in secondaryHashtagGroups.
     */
    hashtagGroups: number[];
};

/**
 * Represents the outcome of validating and sanitizing a user-provided identifier (username).
 * This type encapsulates whether the input is valid, the cleaned-up identifier if valid, and any associated error message if invalid.
 */
export type UsernameValidationResult = {
    /**
     * Indicates whether the provided username is valid according to the defined rules (e.g., format, length).
     * `true` if the username is valid, `false` otherwise.
     */
    isValid: boolean;
    /**
     * The sanitized version of the username if validation was successful.
     * This might involve trimming whitespace, converting to lowercase, or other normalization steps.
     * It will be `null` if validation failed (`isValid` is `false`).
     */
    sanitizedIdentifier: string | null;
    /**
     * An optional error message describing why the validation failed.
     * This property will only be present if `isValid` is `false`.
     */
    error?: string;
};
