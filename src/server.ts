import express, { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import compression from 'compression';
import createError from 'http-errors';
import helmet from 'helmet';
import { env } from './utils/envUtils.js';
import { initializeRedis } from './config/redisClientConfig.js';
import { shutdown } from './utils/shutdownUtils.js';
import { ragRouter } from './routes/rag.js';
import { userManagementRouter } from './routes/userManagement.js';
import { createClient } from '@supabase/supabase-js';
import { unauthedRouter } from './routes/unauthed.js';
import { initializeEmbeddingPipeline } from './config/embeddingsConfig.js';
import { validateApiTokenMiddleware } from './middlewares/auth.js';
import rateLimit from 'express-rate-limit';
import pinoHttpModule from 'pino-http';

/**
 * Initialize core services and the DB connection
 */
let redisClient: Redis | null = await initializeRedis(env);
const supabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
);
const { pipelineError: pipelineError, embeddingPipeline: embeddingPipeline } =
    await initializeEmbeddingPipeline();

/**
 * Express application instance
 */
const app = express();
const port = process.env.PORT || 3000;

// Trust the first hop from the Nginx proxy
app.set('trust proxy', 1);

// Set up Pino logger
const pinoHttp = (pinoHttpModule as any).default || pinoHttpModule;

const pinoMiddleware = pinoHttp({
    // Use pino-pretty for development/local environments
    transport:
        env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
    // Define custom log level (optional)
    level: 'info',
    // Customize logging format (optional)
    // Define serializers to format specific log fields (optional)
    // Redact sensitive headers
    redact: ['req.headers.authorization', 'req.headers.cookie'],
});

/**
 * Express middleware configuration
 * 1. Security headers
 * 2. JSON body parser
 * 3. Compression
 * 4. Rate Limiting
 * 5. Request logging (Pino)
 * 6. API routes
 */
app.use(helmet());
app.use(express.json());
app.use(compression());

// Apply rate limiting
app.use(
    rateLimit({
        windowMs: env.IP_CALL_WINDOW, // 1 minute
        max: env.IP_CALL_LIMIT, // Limit each IP to 30 requests per `window` (here, per 1 minute)
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    }),
);

// Use Pino for HTTP request logging
app.use(pinoMiddleware);

const authMiddleware = validateApiTokenMiddleware(env);

app.use('/', unauthedRouter(pipelineError, embeddingPipeline));
app.use(
    '/rag',
    authMiddleware,
    ragRouter(supabaseClient, pipelineError, embeddingPipeline),
);
app.use(
    '/user-management',
    authMiddleware,
    userManagementRouter(redisClient, supabaseClient),
);

// Catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// Error handler
app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
    // Determine the status code - use err.status if available, otherwise default to 500
    const statusCode = err.status || 500;

    // Determine if we are in development mode
    const isDevelopment = env.NODE_ENV === 'development';

    // Send JSON response
    res.status(statusCode).json({
        status: 'error',
        statusCode: statusCode,
        message: err.message || 'Internal Server Error',
        // Include stack trace only in development for security reasons
        ...(isDevelopment && { stack: err.stack }),
    });
});

/**
 * Register shutdown handlers
 */
process.on('SIGTERM', () => shutdown(redisClient));
process.on('SIGINT', () => shutdown(redisClient));

/**
 * Start the server
 */
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
