import { FeatureExtractionPipeline } from '@xenova/transformers';
import express from 'express';
import cors from 'cors';
import { getEmbedding } from '../utils/ragUtils.js';
import { env } from '../utils/envUtils.js';

/**
 * Creates and configures the unauthenticated router.
 * This router handles public endpoints that don't require authentication,
 * primarily used for health checks and service status monitoring.
 *
 * @param pipelineError - Any error that occurred during embedding pipeline initialization
 * @param embeddingPipeline - Transformer pipeline for generating text embeddings
 * @returns Express router configured with unauthenticated endpoints
 */
export const unauthedRouter = (
    pipelineError: Error | null,
    embeddingPipeline: FeatureExtractionPipeline | null,
) => {
    const router = express.Router();

    // Define allowed origins based on environment
    const allowedOrigins = '*';

    const corsOptions = {
        origin: allowedOrigins,
        methods: ['GET'], // Only allow GET requests
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 200 // For legacy browser support
    };

    // Use the cors middleware
    router.use(cors(corsOptions));

    /**
     * Health check endpoint that verifies the service's operational status.
     * This endpoint performs several checks:
     * 1. Verifies the embedding pipeline initialization status
     * 2. Tests the pipeline's ability to generate embeddings
     *
     * @route GET /health
     * @returns
     *   - 200: Service is healthy and fully operational
     *   - 500: Service is unhealthy due to pipeline errors
     *   - 503: Service is starting up (pipeline not initialized)
     */
    router.get('/health', async (_, res) => {
        // 1. Check for pipeline initialization errors
        if (pipelineError) {
            return res.status(500).json({
                error: 'Service unhealthy',
                details: pipelineError.message,
            });
        }

        // 2. Check if pipeline is initialized
        if (!embeddingPipeline) {
            return res.status(503).json({
                error: 'Service starting',
                details: 'Pipeline not initialized yet',
            });
        }

        try {
            // 3. Test pipeline functionality by generating a test embedding
            await getEmbedding(pipelineError, embeddingPipeline, 'test');

            // 4. If successful, return 200 OK
            res.sendStatus(200);
        } catch (error) {
            // 5. Handle any errors during the health check
            res.status(500).json({
                error: 'Service unhealthy',
                details:
                    error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    return router;
};
