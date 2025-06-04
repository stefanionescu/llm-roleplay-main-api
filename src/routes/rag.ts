import express from 'express';
import cors from 'cors';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeatureExtractionPipeline } from '@xenova/transformers';
import { createRagController } from '../controllers/rag/ragController.js';
import { RAG_CONTROLLER_RPC_FUNCTIONS } from '../constants.js';
import { env } from '../utils/envUtils.js';

/**
 * Creates and configures the RAG (Retrieval-Augmented Generation) router.
 * This router handles different variants of similarity search endpoints,
 * each with its own configuration for semantic and hybrid search with optional hashtag filtering.
 *
 * @param supabaseClient - Supabase client instance for database operations
 * @param pipelineError - Any error that occurred during embedding pipeline initialization
 * @param embeddingPipeline - Transformer pipeline for generating text embeddings
 * @returns Express router configured with RAG endpoints
 */
export const ragRouter = (
    supabaseClient: SupabaseClient,
    pipelineError: Error | null,
    embeddingPipeline: FeatureExtractionPipeline | null,
) => {
    const router = express.Router();

    // Define allowed origins based on environment
    const allowedOrigins = process.env.NODE_ENV === 'production'
        ? env.AUTHED_ALLOWED_IPS
        : '*'; // Allow all for development

    const corsOptions = {
        origin: allowedOrigins,
        methods: 'GET', // Only allow GET requests as per original logic
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 200 // For legacy browser support
    };

    // Use the cors middleware
    router.use(cors(corsOptions));

    // 1. Hybrid RAG Endpoint
    // Combines semantic and keyword-based search without hashtag filtering
    router.get(
        '/hybrid-rag',
        createRagController(
            supabaseClient,
            embeddingPipeline,
            pipelineError,
            ...(RAG_CONTROLLER_RPC_FUNCTIONS.hybridRAG as [
                string,
                string,
                string,
                boolean,
            ]),
        ),
    );

    // 2. Semantic RAG Endpoint
    // Pure semantic search using vector similarity without hashtag filtering
    router.get(
        '/semantic-rag',
        createRagController(
            supabaseClient,
            embeddingPipeline,
            pipelineError,
            ...(RAG_CONTROLLER_RPC_FUNCTIONS.semanticRAG as [
                string,
                string,
                string,
                boolean,
            ]),
        ),
    );

    // 3. Semantic RAG with Hashtags Endpoint
    // Semantic search with additional hashtag-based filtering
    router.get(
        '/semantic-rag-with-hashtags',
        createRagController(
            supabaseClient,
            embeddingPipeline,
            pipelineError,
            ...(RAG_CONTROLLER_RPC_FUNCTIONS.semanticRAGWithHashtags as [
                string,
                string,
                string,
                boolean,
            ]),
        ),
    );

    // 4. Hybrid RAG with Hashtags Endpoint
    // Combines hybrid search with hashtag-based filtering
    router.get(
        '/hybrid-rag-with-hashtags',
        createRagController(
            supabaseClient,
            embeddingPipeline,
            pipelineError,
            ...(RAG_CONTROLLER_RPC_FUNCTIONS.hybridRAGWithHashtags as [
                string,
                string,
                string,
                boolean,
            ]),
        ),
    );

    return router;
};
