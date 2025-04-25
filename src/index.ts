import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as amqp from 'amqplib';

import config from '@/config';
import logger from '@/utils/logger';

// Initialize database clients
export const prisma = new PrismaClient();
export const redis = new Redis(config.REDIS_URL);

async function bootstrap(): Promise<void> {
  try {
    // Connect to MongoDB
    // await mongoose.connect(config.MONGODB_URI);
    // logger.info('Connected to MongoDB');

    // Connect to RabbitMQ
    // const mqConnection = await amqp.connect(config.RABBITMQ_URL);
    // const mqChannel = await mqConnection.createChannel();
    // logger.info('Connected to RabbitMQ');

    // Create queues
    // await mqChannel.assertQueue('crawler_jobs', { durable: true });
    // await mqChannel.assertQueue('data_processing', { durable: true });

    // Initialize API server
    const app = new Elysia()
      .use(cors())
      .use(
        swagger({
          documentation: {
            info: {
              title: 'Episodify Crawler API',
              version: '1.0.0',
            },
          },
        }),
      )
      .get('/', () => 'Episodify Crawler Service')
      .listen(config.PORT);

    logger.info(`🚀 Server is running at ${app.server?.hostname}:${config.PORT}`);

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down gracefully...');

      // Close database connections
      await Promise.all([
        prisma.$disconnect(),
        mongoose.disconnect(),
        redis.quit(),
        // mqConnection.close(),
      ]);

      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start the application:', error);
    process.exit(1);
  }
}

bootstrap();
