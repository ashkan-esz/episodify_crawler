import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { mongoDB, prisma } from '@/services/database';
import Redis from 'ioredis';
// import * as amqp from 'amqplib';

import config from '@/config';
import logger from '@/utils/logger';

// Initialize database clients
export const redis = new Redis(config.REDIS_URL);

async function bootstrap(): Promise<void> {
    try {
        // Connect to MongoDB
        try {
            await mongoDB.getDatabase();
            console.log('Database connection established');

            // Optional: Perform startup checks
            const healthCheck = await mongoDB.healthCheck();
            console.log(`Database health check: ${healthCheck.ok ? 'OK' : 'FAILED'}`);
        } catch (error) {
            console.error('Fatal: DB connection failed', error);
            process.exit(1);
        }
        //TODO : add status logger

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
                mongoDB.close(),
                prisma.$disconnect(),
                redis.quit(),
                // mqConnection.close(),
            ]);

            process.exit(0);
        };

        const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        signals.forEach(signal => process.on(signal, shutdown));

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            shutdown();
        });

    } catch (error) {
        logger.error('Failed to start the application:', error);
        process.exit(1);
    }
}

bootstrap();
