import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

/**
 * Initializes the embedding pipeline using the BGE-M3 model from Xenova.
 * This function sets up the feature extraction pipeline that will be used to generate embeddings
 * for text documents in the RAG (Retrieval-Augmented Generation) system.
 *
 * @returns {Promise<{pipelineError: Error | null; embeddingPipeline: FeatureExtractionPipeline | null}>}
 * Returns an object containing:
 * - pipelineError: Any error that occurred during initialization, or null if successful
 * - embeddingPipeline: The initialized pipeline instance, or null if initialization failed
 */
export async function initializeEmbeddingPipeline(): Promise<{
    pipelineError: Error | null;
    embeddingPipeline: FeatureExtractionPipeline | null;
}> {
    // Initialize variables to track pipeline state and potential errors
    let pipelineError: Error | null = null;
    let embeddingPipeline: FeatureExtractionPipeline | null = null;

    try {
        console.log('[RAG] Initializing embedding pipeline...');

        // Initialize the feature extraction pipeline using the BGE-M3 model
        // This model is specifically designed for generating high-quality, multi language embeddings
        embeddingPipeline = await pipeline(
            'feature-extraction',
            'Xenova/bge-m3',
            { revision: 'main' },
        );

        console.log('[RAG] Embedding pipeline initialized successfully');
    } catch (error) {
        // Handle any errors during pipeline initialization
        pipelineError = error as Error;
        console.error('[RAG] Failed to initialize embedding pipeline:', error);
    }

    return { pipelineError, embeddingPipeline };
}
