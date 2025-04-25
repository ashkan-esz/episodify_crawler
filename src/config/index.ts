import { config as loadEnvConfig } from 'dotenv';
import { z } from 'zod';

// Load environment variables
loadEnvConfig();

// Configuration schema
const configSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  // PostgreSQL
  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),

  // MongoDB
  MONGODB_URI: z.string(),

  // Redis
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // RabbitMQ
  RABBITMQ_HOST: z.string(),
  RABBITMQ_PORT: z.coerce.number().default(5672),
  RABBITMQ_USER: z.string(),
  RABBITMQ_PASSWORD: z.string(),
  RABBITMQ_VHOST: z.string().default('/'),

  // Crawler Settings
  CRAWLER_CONCURRENCY: z.coerce.number().default(10),
  CRAWLER_DELAY: z.coerce.number().default(1000),
  USER_AGENT: z.string(),

  // Admin Panel
  ADMIN_JWT_SECRET: z.string(),
  ADMIN_JWT_EXPIRES_IN: z.string().default('1d'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Parse and validate configuration
const config = configSchema.parse(process.env);

// Derived configurations
const isDevelopment = config.NODE_ENV === 'development';
const isProduction = config.NODE_ENV === 'production';
const isTest = config.NODE_ENV === 'test';

// Database URLs
const DATABASE_URL = `postgresql://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${config.POSTGRES_DB}`;
const REDIS_URL = `redis://${config.REDIS_PASSWORD ? `:${config.REDIS_PASSWORD}@` : ''}${config.REDIS_HOST}:${config.REDIS_PORT}`;
const RABBITMQ_URL = `amqp://${config.RABBITMQ_USER}:${config.RABBITMQ_PASSWORD}@${config.RABBITMQ_HOST}:${config.RABBITMQ_PORT}${config.RABBITMQ_VHOST}`;

export default {
  ...config,
  isDevelopment,
  isProduction,
  isTest,
  DATABASE_URL,
  REDIS_URL,
  RABBITMQ_URL,
}; 