import { Request, Response, NextFunction } from 'express';
import { Env } from '../types.js';

/**
 * Creates a middleware function to validate API tokens in incoming requests.
 * This middleware ensures that all requests are properly authenticated using
 * a Bearer token that matches the configured API_TOKEN in the environment.
 *
 * @param env - Environment configuration containing the API_TOKEN
 * @returns Express middleware function that validates the Authorization header
 *
 * @example
 * // Usage in Express app
 * app.use(validateApiTokenMiddleware(env));
 *
 * @throws {Error} If the Authorization header is missing or malformed
 * @throws {Error} If the provided token doesn't match the configured API_TOKEN
 */
export const validateApiTokenMiddleware = (env: Env) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            // 1. Authorization Header Validation
            // Check if the Authorization header exists and follows the Bearer scheme
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(401).json({
                    message: 'API token required',
                    details: 'Authorization header must use Bearer scheme',
                });
            }

            // 2. Token Extraction and Validation
            // Extract the token from the Authorization header and validate it
            const token = authHeader.split(' ')[1];
            if (token !== env.API_TOKEN) {
                return res.status(403).json({
                    message: 'Invalid API token',
                    details:
                        'Provided token does not match configured API_TOKEN',
                });
            }

            // 3. Success Path
            // Token is valid, proceed to the next middleware or route handler
            next();
        } catch (error) {
            // 4. Error Handling
            // Catch any unexpected errors during token validation
            // and pass them to the error handling middleware
            next(error);
        }
    };
};
