import config from '@/config';
import * as dynamicConfig from '@/config/dynamicConfig';
import { dynamicCors } from '@api/middlewares';
import { UltimateStatusLogger } from '@utils/statusLogger';
import { Elysia } from 'elysia';
// import { swagger } from '@elysiajs/swagger';
import { mongoDB, prisma } from '@/services/database';
import { MongoDBCollectionsRepo } from '@/repo';
import Redis from 'ioredis';
// import * as amqp from 'amqplib';

import logger from '@/utils/logger';

// Initialize database clients
export const redis = new Redis(config.REDIS_URL);

async function preStart(): Promise<void> {
    // Initialize status logger
    const statusLogger = new UltimateStatusLogger('Crawler', {
        enablePerformanceAnalysis: false,
    });

    statusLogger.addStep('MongoBD', [], { critical: true });
    statusLogger.addStep('MongoDB_Create_Collections', ['MongoBD'], { critical: true });
    statusLogger.addStep('Crawler_DB_Config', ['MongoBD', 'MongoDB_Create_Collections'], { critical: true });

    // Connect to MongoDB
    await statusLogger.executeStep(
        'MongoBD',
        async () => {
            await mongoDB.getDatabase();
            // Optional: Perform startup checks
            const healthCheck = await mongoDB.healthCheck();
            logger.info(`[MongoDB] Health check: ${healthCheck.ok ? 'OK' : 'FAILED'}`);
        },
        'Connecting to Mongodb',
    );

    // Create collections and indexes
    await statusLogger.executeStep(
        'MongoDB_Create_Collections',
        async () => {
            await MongoDBCollectionsRepo.createCollectionsAndIndexes();
        },
        'Creating mongodb collection and indexes',
    );

    // Check Crawler DB Config
    await statusLogger.executeStep(
        'Crawler_DB_Config',
        async () => {
            await dynamicConfig.insertCrawlerDBConfigs();
        },
        'Fetching Crawler DB Config',
    );

    // End status logger
    statusLogger.complete();
}

async function bootstrap(): Promise<void> {
    try {
        await preStart();

        // Connect to RabbitMQ
        // const mqConnection = await amqp.connect(config.RABBITMQ_URL);
        // const mqChannel = await mqConnection.createChannel();
        // logger.info('Connected to RabbitMQ');

        // Create queues
        // await mqChannel.assertQueue('crawler_jobs', { durable: true });
        // await mqChannel.assertQueue('data_processing', { durable: true });

        //TODO : add plugins

        // Initialize API server
        const app = new Elysia({
            // detail: {
            //     hide: true,
            //     tags: ['elysia'],
            // },
        })
            .use(dynamicCors())
            // .use(
            //     swagger({
            //         documentation: {
            //             info: {
            //                 title: 'Episodify Crawler API',
            //                 version: '1.0.0',
            //             },
            //         },
            //     }),
            // )
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
        signals.forEach((signal) => process.on(signal, shutdown));

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
