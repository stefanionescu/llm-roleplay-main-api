import { OnboardingSettings } from '../types.js';
import { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { RAGResult, RAGHashtagResult } from '../types.js';

/**
 * Retrieves the current onboarding settings from the database.
 * This function fetches the latest configuration for user onboarding,
 * including limits and thresholds for different user types.
 *
 * @param supabaseClient - Supabase client instance for database operations
 * @returns Promise resolving to the current onboarding settings
 * @throws Error if Supabase client is not initialized or if no settings are found
 */
export async function getCurrentOnboardingSettings(
    supabaseClient: SupabaseClient,
): Promise<OnboardingSettings> {
    // Validate Supabase client
    if (!supabaseClient) {
        throw new Error(
            '[Onboarding] Onboarding Supabase client not initialized',
        );
    }

    // Execute RPC call to get current settings
    const { data, error } = await supabaseClient
        .schema('user_onboarding')
        .rpc('get_current_settings');

    // Handle RPC errors
    if (error) {
        console.error('[Onboarding Settings Error]', {
            error: {
                message: error.message,
                code: error.code,
                hint: error.hint,
            },
        });
        throw error;
    }

    // Validate response data
    if (!data) {
        throw new Error('No onboarding settings found');
    }

    return data as OnboardingSettings;
}

/**
 * Executes a Semantic RAG query with hashtag filtering.
 * Performs pure semantic search with hashtag constraints.
 *
 * @param supabaseClient - Supabase client instance
 * @param hashtags - Array of primary hashtags
 * @param secondaryHashtags - Array of secondary hashtags
 * @param hashtagGroups - Array indicating group membership for secondary hashtags
 * @param queryEmbedding - Vector embedding of the search query
 * @param max_results - Maximum number of results
 * @param user_id - User ID
 * @param similarity_threshold - Minimum similarity score
 * @param language_code - Language code
 * @param rpcFunctionName - Name of the RPC function (should be 'search_similar_content_with_hashtags_and_penalties')
 * @returns Promise resolving to RAG results with hashtag info
 */
export async function getSemanticRAGWithHashtags(
    supabaseClient: SupabaseClient,
    hashtags: string[],
    secondaryHashtags: string[],
    hashtagGroups: number[],
    queryEmbedding: number[],
    max_results: number,
    user_id: string,
    similarity_threshold: number,
    language_code: string,
    rpcFunctionName: string,
): Promise<{ data: RAGHashtagResult[]; error: PostgrestError | null }> {    
    console.log('[Semantic RAG With Hashtags]', {
        hashtags,
        secondaryHashtags,
        hashtagGroups,
        queryEmbedding,
        max_results,
        user_id,
        similarity_threshold,
        language_code,
        rpcFunctionName,
    });
   
    // Execute RPC call for semantic search with hashtags
    const { data: ragData, error: rpcError } = await supabaseClient
        .schema('content_data')
        .rpc(rpcFunctionName, {
            hashtags: hashtags,
            secondary_hashtags: secondaryHashtags,
            hashtag_groups: hashtagGroups,
            max_results,
            p_user_id: user_id,
            query_embedding: queryEmbedding,
            similarity_threshold,
            p_language_code: language_code,
        });

    return { data: ragData, error: rpcError };
}

/**
 * Executes a Hybrid RAG query with hashtag filtering.
 * Combines semantic and keyword search with hashtag constraints.
 *
 * @param supabaseClient - Supabase client instance
 * @param hashtags - Array of primary hashtags
 * @param secondaryHashtags - Array of secondary hashtags
 * @param hashtagGroups - Array indicating group membership for secondary hashtags
 * @param queryEmbedding - Vector embedding of the search query
 * @param text - Original search query text (for keyword part)
 * @param max_results - Maximum number of results
 * @param user_id - User ID
 * @param similarity_threshold - Minimum similarity score
 * @param language_code - Language code
 * @param rpcFunctionName - Name of the RPC function (should be 'hybrid_search_with_hashtags_and_penalties')
 * @returns Promise resolving to RAG results with hashtag info
 */
export async function getHybridRAGWithHashtags(
    supabaseClient: SupabaseClient,
    hashtags: string[],
    secondaryHashtags: string[],
    hashtagGroups: number[],
    queryEmbedding: number[],
    text: string,
    max_results: number,
    user_id: string,
    similarity_threshold: number,
    language_code: string,
    rpcFunctionName: string,
): Promise<{ data: RAGHashtagResult[]; error: PostgrestError | null }> {
    // Execute RPC call for hybrid search with hashtags
    const { data: ragData, error: rpcError } = await supabaseClient
        .schema('content_data')
        .rpc(rpcFunctionName, {
            hashtags,
            secondary_hashtags: secondaryHashtags,
            hashtag_groups: hashtagGroups,
            query_text: text,
            max_results,
            p_user_id: user_id,
            query_embedding: queryEmbedding,
            similarity_threshold,
            p_language_code: language_code,
        });

    return { data: ragData, error: rpcError };
}

/**
 * Executes a Semantic RAG query without hashtag filtering.
 * Performs pure semantic search.
 *
 * @param supabaseClient - Supabase client instance
 * @param queryEmbedding - Vector embedding of the search query
 * @param max_results - Maximum number of results
 * @param user_id - User ID
 * @param language_code - Language code
 * @param similarity_threshold - Minimum similarity score
 * @param rpcFunctionName - Name of the RPC function (should be 'search_similar_content_with_penalties')
 * @returns Promise resolving to RAG results
 */
export async function getSemanticRAGWithoutHashtags(
    supabaseClient: SupabaseClient,
    queryEmbedding: number[],
    max_results: number,
    user_id: string,
    language_code: string,
    similarity_threshold: number,
    rpcFunctionName: string, // Keep for consistency, though we know the function name
): Promise<{ data: RAGResult[]; error: PostgrestError | null }> {
    // Execute RPC call for semantic search without hashtags
    const { data: ragData, error: rpcError } = await supabaseClient
        .schema('content_data')
        .rpc(rpcFunctionName, { // Use the passed function name
            p_user_id: user_id,
            query_embedding: queryEmbedding,
            // No query_text here
            p_language_code: language_code,
            similarity_threshold,
            max_results,
        });

    return { data: ragData, error: rpcError };
}

/**
 * Executes a Hybrid RAG query without hashtag filtering.
 * Combines semantic and keyword search.
 *
 * @param supabaseClient - Supabase client instance
 * @param queryEmbedding - Vector embedding of the search query
 * @param max_results - Maximum number of results
 * @param user_id - User ID
 * @param text - Original search query text (for keyword part)
 * @param language_code - Language code
 * @param similarity_threshold - Minimum similarity score
 * @param rpcFunctionName - Name of the RPC function (should be 'hybrid_search_with_penalties')
 * @returns Promise resolving to RAG results
 */
export async function getHybridRAGWithoutHashtags(
    supabaseClient: SupabaseClient,
    queryEmbedding: number[],
    max_results: number,
    user_id: string,
    text: string, // Renamed from getRAGWithoutHashtags
    language_code: string,
    similarity_threshold: number,
    rpcFunctionName: string,
): Promise<{ data: RAGResult[]; error: PostgrestError | null }> {
    // Execute RPC call for hybrid search without hashtags
    const { data: ragData, error: rpcError } = await supabaseClient
        .schema('content_data')
        .rpc(rpcFunctionName, {
            p_user_id: user_id as string,
            query_embedding: queryEmbedding,
            query_text: text as string, // Passes text for hybrid
            p_language_code: language_code,
            similarity_threshold,
            max_results,
        });

    return { data: ragData, error: rpcError };
}
