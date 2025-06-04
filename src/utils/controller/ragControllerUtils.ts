import { Request } from 'express';
import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { franc } from 'franc-min';
import {
    SUPPORTED_LANGUAGES,
    MIN_TEXT_LENGTH,
    LANGUAGE_CODE_MAP,
    DEFAULT_SIMILARITY_THRESHOLD,
    DEFAULT_MAX_RESULTS,
} from '../../constants.js';
import {
    getSemanticRAGWithoutHashtags,
    getHybridRAGWithoutHashtags,
    getSemanticRAGWithHashtags,
    getHybridRAGWithHashtags,
} from '../../supabase/queries.js';
import { ragQuerySchema } from '../../validators.js';
import {
    RAGResult,
    RAGHashtagResult,
    ProcessedRAGParams,
} from '../../types.js';

/**
 * Processes and validates RAG (Retrieval-Augmented Generation) query parameters from the request.
 * This function handles the extraction and validation of all necessary parameters for RAG queries,
 * including user ID, text, language code, similarity threshold, and hashtag-related parameters.
 *
 * @param {Request} req - Express request object containing query parameters
 * @returns {ProcessedRAGParams} Processed and validated RAG parameters
 * @throws {Error} If query parameters are invalid
 */
export const processRAGParams = (req: Request): ProcessedRAGParams => {
    // Validate query parameters against the schema
    const parseResult = ragQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
        throw new Error('Invalid query parameters');
    }

    // Extract and parse basic parameters
    const { user_id, text, language_code } = parseResult.data;

    // Process primary hashtags (comma-separated)
    const hashtags = (req.query.hashtags as string)?.split(',') || [];

    // Process secondary hashtag groups (pipe-separated groups of comma-separated hashtags)
    const secondaryHashtagGroups =
        (req.query.secondary_hashtags as string)
            ?.split('|')
            .map((group) => (group ? group.split(',') : [])) || [];

    // Set default values for optional parameters
    const similarity_threshold =
        parseFloat(req.query.similarity_threshold as string) ||
        DEFAULT_SIMILARITY_THRESHOLD;
    const max_results =
        parseInt(req.query.max_results as string) || DEFAULT_MAX_RESULTS;

    // Process secondary hashtags into flat arrays for database queries
    const secondaryHashtags = secondaryHashtagGroups.flat();
    const hashtagGroups = secondaryHashtagGroups.flatMap((group, idx) =>
        Array(group.length).fill(idx + 1),
    );

    return {
        user_id,
        text,
        language_code,
        similarity_threshold,
        max_results,
        hashtags,
        secondaryHashtagGroups,
        secondaryHashtags,
        hashtagGroups,
    };
};

/**
 * Checks if the input text meets the minimum length requirement.
 *
 * @param {string} text - The input text to validate.
 * @returns {boolean} True if the text length is sufficient, false otherwise.
 */
export const validateTextLength = (text: string): boolean => {
    if (!text || text.length < MIN_TEXT_LENGTH) {
        console.log('[Text Length Validation] Text too short:', {
            textLength: text?.length,
            minRequired: MIN_TEXT_LENGTH,
        });
        return false;
    }
    return true;
};

/**
 * Detects the language of the input text using franc.
 * If the detected language is supported, it's returned.
 * Otherwise, returns the validated requested language code.
 *
 * @param {string} text - The input text to validate. Must meet minimum length requirements.
 * @param {string} requestedLanguage - The validated language code from the request parameters.
 * @returns {string} The effective language code to use (either detected or requested).
 */
export const validateLanguage = (text: string, requestedLanguage: string): string => {
    // Language Detection
    const detectedLang = franc(text);

    // Language Code Mapping
    const detectedLanguage =
        LANGUAGE_CODE_MAP[detectedLang as keyof typeof LANGUAGE_CODE_MAP];

    // Language Validation
    if (detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage)) {
        return detectedLanguage;
    }

    // Fallback to Requested Language
    // If detected language is not supported, use the requested language,
    // which is guaranteed to be valid by the query schema validator.
    return requestedLanguage;
};

/**
 * Executes a RAG query with or without hashtag filtering based on the provided parameters.
 * This function serves as a router to either the hashtag-aware or hashtag-agnostic RAG query functions.
 *
 * @param {SupabaseClient} supabaseClient - Supabase client instance
 * @param {ProcessedRAGParams} params - Processed RAG parameters
 * @param {number[]} queryEmbedding - Vector embedding of the query text
 * @param {string} rpcFunctionName - Name of the RPC function to call
 * @param {boolean} useHashtags - Whether to use hashtag filtering
 * @returns {Promise<{data: RAGResult[] | RAGHashtagResult[]; error: PostgrestError | null}>}
 * Returns the query results and any potential error
 */
export const executeRAGQuery = async (
    supabaseClient: SupabaseClient,
    params: ProcessedRAGParams,
    queryEmbedding: number[],
    rpcFunctionName: string,
    useHashtags: boolean,
): Promise<{
    data: RAGResult[] | RAGHashtagResult[];
    error: PostgrestError | null;
}> => {
    // Route based on hashtag usage AND function name
    if (useHashtags) {
        if (rpcFunctionName === 'search_similar_content_with_hashtags_and_penalties') {
            return getSemanticRAGWithHashtags(
                supabaseClient,
                params.hashtags,
                params.secondaryHashtags,
                params.hashtagGroups,
                queryEmbedding,
                params.max_results,
                params.user_id,
                params.similarity_threshold,
                params.language_code,
                rpcFunctionName,
            );
        } else if (rpcFunctionName === 'hybrid_search_with_hashtags_and_penalties') {
            return getHybridRAGWithHashtags(
                supabaseClient,
                params.hashtags,
                params.secondaryHashtags,
                params.hashtagGroups,
                queryEmbedding,
                params.text,
                params.max_results,
                params.user_id,
                params.similarity_threshold,
                params.language_code,
                rpcFunctionName,
            );
        } else {
            // Should not happen if constants and routes are aligned
            console.error('[executeRAGQuery] Unknown RPC function for hashtag query:', rpcFunctionName);
            throw new Error('Internal server error: Invalid RAG configuration');
        }
    } else {
        // Route based on RPC function name for non-hashtag queries
        if (rpcFunctionName === 'search_similar_content_with_penalties') {
            return getSemanticRAGWithoutHashtags(
                supabaseClient,
                queryEmbedding,
                params.max_results,
                params.user_id,
                params.language_code,
                params.similarity_threshold,
                rpcFunctionName,
            );
        } else if (rpcFunctionName === 'hybrid_search_with_penalties') {
            return getHybridRAGWithoutHashtags(
                supabaseClient,
                queryEmbedding,
                params.max_results,
                params.user_id,
                params.text,
                params.language_code,
                params.similarity_threshold,
                rpcFunctionName,
            );
        } else {
            // Should not happen if constants and routes are aligned
            console.error('[executeRAGQuery] Unknown RPC function for non-hashtag query:', rpcFunctionName);
            throw new Error('Internal server error: Invalid RAG configuration');
        }
    }
};
