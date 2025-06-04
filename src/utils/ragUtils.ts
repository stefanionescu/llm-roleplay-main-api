/**
 * Generates a vector embedding for the given text using the BGE-M3 model.
 * This function handles the conversion of text into a numerical vector representation
 * that can be used for similarity search in the vector database.
 *
 * The embedding process:
 * 1. Validates the embedding pipeline status
 * 2. Generates the embedding using mean pooling and normalization
 * 3. Converts the output to a standard array format
 *
 * @param pipelineError - Any error that occurred during pipeline initialization
 * @param embeddingPipeline - The transformer pipeline for generating embeddings
 * @param text - The input text to generate embedding for
 * @returns Promise resolving to the generated embedding vector
 * @throws Error if pipeline is not initialized or if embedding generation fails
 */
export async function getEmbedding(
    pipelineError: Error | null,
    embeddingPipeline: any,
    text: string,
): Promise<number[]> {
    try {
        // 1. Pipeline Validation
        // Check if there were any errors during pipeline initialization
        if (pipelineError) {
            throw new Error(
                `[RAG] Pipeline initialization failed: ${pipelineError.message}`,
            );
        }

        // Ensure the pipeline is properly initialized
        if (!embeddingPipeline) {
            throw new Error('[RAG] Embedding pipeline not initialized yet');
        }

        // 2. Embedding Generation
        // Log the start of embedding generation with text length
        console.log(
            '[RAG] Generating embedding for text of length:',
            text.length,
        );

        // Generate the embedding using the BGE-M3 model
        // - pooling: 'mean' - Uses mean pooling to combine token embeddings
        // - normalize: true - Normalizes the output vector to unit length
        const output = await embeddingPipeline(text, {
            pooling: 'mean',
            normalize: true,
        });

        // Log successful embedding generation
        console.log('[RAG] BGE-M3 embedding generated successfully');

        // 3. Output Processing
        // Convert the tensor output to a standard JavaScript array
        return Array.from(output.data);
    } catch (error) {
        // 4. Error Handling
        // Log and rethrow any errors that occur during the process
        console.error('[RAG] Error generating embedding:', error);
        throw error;
    }
}
