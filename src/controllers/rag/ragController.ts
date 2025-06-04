import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeatureExtractionPipeline } from '@xenova/transformers';
import {
    processRAGParams,
    validateLanguage,
    validateTextLength,
    executeRAGQuery,
} from '../../utils/controller/ragControllerUtils.js';
import { getEmbedding } from '../../utils/ragUtils.js';
import { ProcessedRAGParams } from '../../types.js';

/**
 * Creates a RAG (Retrieval-Augmented Generation) controller for handling similarity search requests.
 * This controller processes text queries, generates embeddings, and retrieves relevant content
 * from the vector database using either hashtag-filtered or unfiltered search.
 *
 * The controller follows a multi-phase process:
 * 1. Parameter validation and processing
 * 2. Language detection and validation
 * 3. Hashtag validation (if enabled)
 * 4. Embedding generation
 * 5. RAG query execution
 * 6. Response formatting
 *
 * @param supabaseClient - Supabase client instance for database operations
 * @param embeddingPipeline - Transformer pipeline for generating text embeddings
 * @param pipelineError - Any error that occurred during pipeline initialization
 * @param endpointName - Name of the API endpoint for logging
 * @param paramsError - Error message for invalid parameters
 * @param rpcFunctionName - Name of the RPC function to call in Supabase
 * @param useHashtags - Whether to use hashtag filtering in the search
 * @returns Express middleware function for handling RAG requests
 */
export const createRagController = (
    supabaseClient: SupabaseClient,
    embeddingPipeline: FeatureExtractionPipeline | null,
    pipelineError: Error | null,
    endpointName: string,
    paramsError: string,
    rpcFunctionName: string,
    useHashtags: boolean,
) => {
    return async (req: Request, res: Response) => {
        // Generate a unique request ID for tracking and correlation
        const start = Date.now();
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Check if the embedding pipeline is available
        if (pipelineError) {
            console.warn('[Pipeline Error]', {
                requestId,
                error: pipelineError.message,
                stack: pipelineError.stack,
            });

            return res.status(500).json({
                error: 'Service unavailable',
            });
        }

        try {
            // 1. Parameter Processing Phase
            // Parse and validate request parameters, applying defaults where necessary
            const params: ProcessedRAGParams = processRAGParams(req);

            // Log when default values are used for optional parameters
            if (!req.query.similarity_threshold) {
                console.log('[Using Default Similarity Threshold]', {
                    requestId,
                    default_value: params.similarity_threshold,
                });
            }
            if (!req.query.max_results) {
                console.log('[Using Default Max Results]', {
                    requestId,
                    default_value: params.max_results,
                });
            }

            // Validate text length first
            if (!validateTextLength(params.text)) {
                console.warn('[Request Failed] Text too short', { requestId });
                return res.status(200).json({
                    results: [],
                    metadata: {
                        request_id: requestId,
                        duration_ms: Date.now() - start,
                        query_length: params.text.length,
                        language_code: params.language_code,
                        hashtags_count: params.hashtags.length,
                        secondary_hashtags_count: params.secondaryHashtags.length,
                        results_count: 0,
                    },
                });
            }

            // Log request start with all relevant parameters
            console.log('[Request Start]', {
                requestId,
                endpoint: endpointName,
                params: {
                    user_id: params.user_id,
                    text_length: params.text?.length,
                    language_code: params.language_code,
                    hashtags_count: params.hashtags?.length,
                    secondary_hashtags_count:
                        params.secondaryHashtags?.length,
                    similarity_threshold: params.similarity_threshold,
                    max_results: params.max_results,
                },
            });

            // 2. Language Validation Phase
            // Validate the language of the input text and ensure it's supported
            const validatedLanguage = validateLanguage(
                params.text,
                params.language_code,
            );

            // Log language detection results
            console.log('[Language Detection]', {
                requestId,
                requested_language: params.language_code,
                detected_language: validatedLanguage,
                text_length: params.text?.length,
                validation_success: true,
            });

            // 3. Embedding Generation Phase
            // Convert the input text into a vector embedding for similarity search
            console.log('[Generating Embedding]', {
                requestId,
                textLength: params.text.length,
            });

            const embeddingStart = Date.now();
            const queryEmbedding = await getEmbedding(
                pipelineError,
                embeddingPipeline,
                params.text,
            );

            console.log('[Embedding Generated]', {
                requestId,
                duration_ms: Date.now() - embeddingStart,
                embeddingLength: queryEmbedding.length,
                model: 'E5',
            });

            // 4. RAG Query Execution Phase
            // Execute the similarity search with optional hashtag filtering
            console.log('[Executing RPC]', {
                requestId,
                procedure: rpcFunctionName,
                params: {
                    user_id: params.user_id,
                    text_length: params.text.length,
                    language_code: params.language_code,
                    hashtags_count: params.hashtags.length,
                    similarity_threshold: params.similarity_threshold,
                    max_results: params.max_results,
                },
            });

            const rpcStart = Date.now();
            const { data: ragData, error: rpcError } = await executeRAGQuery(
                supabaseClient,
                params,
                queryEmbedding,
                rpcFunctionName,
                useHashtags,
            );

            // Handle RPC execution errors
            if (rpcError) {
                console.error('[RPC Error]', {
                    requestId,
                    error: {
                        message: rpcError.message,
                        code: rpcError.code,
                        hint: rpcError.hint,
                        details: rpcError.details,
                    },
                    duration_ms: Date.now() - rpcStart,
                });

                throw rpcError;
            }

            console.log('[RPC Success]', {
                requestId,
                duration_ms: Date.now() - rpcStart,
                results_count: ragData?.length ?? 0,
            });

            // 5. Response Preparation Phase
            // Format the response with results and metadata
            const response = {
                results: ragData,
                metadata: {
                    request_id: requestId,
                    duration_ms: Date.now() - start,
                    query_length: params.text.length,
                    language_code: params.language_code,
                    hashtags_count: params.hashtags.length,
                    secondary_hashtags_count: params.secondaryHashtags.length,
                    results_count: ragData?.length ?? 0,
                },
            };

            // Log successful request completion
            console.log('[Request Complete]', {
                requestId,
                duration_ms: Date.now() - start,
                status: 'success',
                results_count: ragData?.length ?? 0,
                hashtags_stats: {
                    primary_count: params.hashtags.length,
                    secondary_groups: params.secondaryHashtags.map(
                        (group) => group.length,
                    ),
                },
            });

            // Send the response
            res.json(response);
        } catch (error) {
            // 6. Error Handling Phase
            // Log the error with detailed information
            console.error('[Request Failed]', {
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

            // Handle specific error types with appropriate status codes
            if (
                error instanceof Error &&
                error.message === 'Invalid query parameters'
            ) {
                return res.status(400).json({
                    error: paramsError,
                    results: [],
                    metadata: {
                        request_id: requestId,
                        duration_ms: Date.now() - start,
                        results_count: 0,
                    },
                });
            }
            
            // Send generic error response for unexpected errors
            res.status(500).json({
                error: 'Internal server error',
                request_id: requestId,
            });
        }
    };
};
