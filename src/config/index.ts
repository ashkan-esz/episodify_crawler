import { z } from 'zod';

// Configuration schema
const configSchema = z.object({
    // MongoDB
    MONGODB_DATABASE_URL: z.string(),

    // Postgresql
    POSTGRES_PASSWORD: z.string(),
    POSTGRE_DATABASE_URL: z.string(),

    // Redis
    REDIS_URL: z.string(),
    REDIS_PASSWORD: z.string().optional(),

    // RabbitMQ
    RABBITMQ_URL: z.string(),
    RABBITMQ_DEFAULT_USER: z.string(),
    RABBITMQ_DEFAULT_PASS: z.string(),

    // S3 Storage
    CLOUAD_STORAGE_ENDPOINT: z.string(),
    CLOUAD_STORAGE_WEBSITE_ENDPOINT: z.string(),
    CLOUAD_STORAGE_ACCESS_KEY: z.string(),
    CLOUAD_STORAGE_SECRET_ACCESS_KEY: z.string(),
    BUCKET_NAME_PREFIX: z.string().default(''),

    // Admin
    ADMIN_USER: z.string(),
    ADMIN_PASS: z.string(),

    // Others
    ACCESS_TOKEN_SECRET: z.string(),
    REFRESH_TOKEN_SECRET: z.string(),
    DOMAIN: z.string(),

    // Sentry
    CRAWLER_SENTRY_DNS: z.string(),
    SENTRY_AUTH_TOKEN: z.string(),
    SENTRY_PROJECT: z.string(),
    SENTRY_ORG: z.string().default(''),

    // App
    PORT: z.coerce.number().default(3000),
    API_PREFIX: z.string().default('/api/v1'),

    // Logging
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    PRINT_ERRORS: z.coerce.boolean().default(false),

    // Flags
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DEBUG_MODE: z.coerce.boolean().default(false),

    // Crawler
    DISABLE_CRAWLER: z.coerce.boolean().default(false),
    DISABLE_TORRENT_CRAWLER: z.coerce.boolean().default(false),
    CRAWLER_CONCURRENCY: z.coerce.number().default(4),
    PAUSE_CRAWLER_ON_HIGH_LOAD: z.coerce.boolean().default(true),
    CRAWLER_TOTAL_MEMORY: z.coerce.number().default(1024),
    CRAWLER_MEMORY_LIMIT: z.coerce.number().default(0),
    CRAWLER_CPU_LIMIT: z.coerce.number().default(95),
    CRAWLER_PAUSE_DURATION_LIMIT: z.coerce.number().default(10),
    CRAWLER_MANUAL_GC_ON_HIGH_LOAD: z.coerce.boolean().default(false),
    IGNORE_HENTAI: z.coerce.boolean().default(false),
    CORS_ALLOWED_ORIGINS: z.string().default('').transform(s => s.split('---').map(item => item.trim())),
});

// Parse and validate configuration
const config = configSchema.parse(process.env);

// Derived configurations
const isDevelopment = config.NODE_ENV === 'development';
const isProduction = config.NODE_ENV === 'production';
const isTest = config.NODE_ENV === 'test';
const SERVER_START_TIME = Date.now();

const API_KEYS = Object.freeze({
    omdbApiKeys: getOmdbApiKeys(),
    googleApiKey: process.env.GOOGLE_API_KEY || '',
});

function getOmdbApiKeys(): string[] {
    const omdbApiKeys: string[] = [];
    let i = 1;
    while (true) {
        const keys = process.env[`OMDB_API_KEY${i}`];
        if (!keys) {
            break;
        }
        omdbApiKeys.push(...keys.split('-'));
        i++;
    }
    return omdbApiKeys;
}

export default {
    ...config,
    isDevelopment,
    isProduction,
    isTest,
    API_KEYS,
    SERVER_START_TIME,
};
