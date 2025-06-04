import { z } from 'zod';
import {
    DEFAULT_MAX_RESULTS,
    DEFAULT_LANGUAGE_CODE,
    DEFAULT_SIMILARITY_THRESHOLD,
    MIN_SIMILARITY_THRESHOLD,
    MAX_SIMILARITY_THRESHOLD,
    MIN_RAG_RESULTS,
    MAX_RAG_RESULTS,
    SUPPORTED_LANGUAGES,
} from './constants.js';

export const ragQuerySchema = z
    .object({
        user_id: z.string().uuid('user_id must be a valid UUID'),
        text: z
            .string()
            .min(1, 'text is required')
            .max(2500, 'text must be less than 2500 characters'),
        language_code: z
            .string()
            .optional()
            .default(DEFAULT_LANGUAGE_CODE)
            .transform((val) => val.toLowerCase())
            .refine(
                (val) => SUPPORTED_LANGUAGES.includes(val),
                `language_code must be one of ${SUPPORTED_LANGUAGES.join(', ')}`,
            ),
        hashtags: z
            .string()
            .optional()
            .transform((val) => (val ? val.split(',') : [])),
        secondary_hashtags: z
            .string()
            .optional()
            .transform((val) =>
                val ? val.split('|').map((group) => group.split(',')) : [],
            ),
        similarity_threshold: z
            .string()
            .optional()
            .transform(
                (val) => parseFloat(val ?? '') || DEFAULT_SIMILARITY_THRESHOLD,
            )
            .refine(
                (val) =>
                    val >= MIN_SIMILARITY_THRESHOLD &&
                    val <= MAX_SIMILARITY_THRESHOLD,
                `similarity_threshold must be between ${MIN_SIMILARITY_THRESHOLD} and ${MAX_SIMILARITY_THRESHOLD}`,
            ),
        max_results: z
            .string()
            .optional()
            .transform((val) => parseInt(val ?? '') || DEFAULT_MAX_RESULTS)
            .refine(
                (val) => val >= MIN_RAG_RESULTS && val <= MAX_RAG_RESULTS,
                `max_results must be between ${MIN_RAG_RESULTS} and ${MAX_RAG_RESULTS}`,
            ),
    })
    .superRefine((data, ctx) => {
        if (
            data.hashtags.length > 0 &&
            data.secondary_hashtags.length > 0 &&
            data.hashtags.length !== data.secondary_hashtags.length
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'hashtags and secondary_hashtags must have the same number of groups when both are provided.',
                path: ['hashtags', 'secondary_hashtags'],
            });
        }
    });
