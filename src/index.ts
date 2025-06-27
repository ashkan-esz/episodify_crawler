import config from '@/config';
import * as dynamicConfig from '@/config/dynamicConfig';
import { dynamicCors } from '@api/middlewares';
import { UltimateStatusLogger } from '@utils/statusLogger';
import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { helmet } from 'elysia-helmet';
import { mongoDB, kyselyDB, Redis } from '@/services/database';
import { MongoDBCollectionsRepo } from '@/repo';
import { SourcesArray } from '@/services/crawler';
import logger, { saveError } from '@/utils/logger';

async function preStart(): Promise<void> {
    // Initialize status logger
    const statusLogger = new UltimateStatusLogger('Crawler', {
        enablePerformanceAnalysis: false,
    });

    statusLogger.addStep('Redis', [], { critical: false });
    statusLogger.addStep('MongoBD', [], { critical: true });
    statusLogger.addStep('MongoDB_Create_Collections', ['MongoBD'], { critical: true });
    statusLogger.addStep('Crawler_DB_Config', ['MongoBD', 'MongoDB_Create_Collections'], {
        critical: true,
    });
    statusLogger.addStep('Crawler_DB_Sources', ['MongoBD', 'MongoDB_Create_Collections'], {
        critical: true,
    });

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

    // Insert Crawler Sources
    await statusLogger.executeStep(
        'Crawler_DB_Sources',
        async () => {
            await SourcesArray.insertSources();
        },
        'Adding Crawler Sources to DB',
    );

    await statusLogger.executeStep(
        'Redis',
        async () => {
            await Redis.connect();
        },
        'Connecting to Redis',
    );

    // End status logger
    statusLogger.complete();
}

export async function bootstrap(): Promise<void> {
    try {
        await preStart();

        // Initialize API server
        const app = new Elysia()
            .use(helmet())
            .use(dynamicCors())
            .use(
                swagger({
                    documentation: {
                        info: {
                            title: 'Episodify Crawler API',
                            version: '1.0.0',
                        },
                    },
                    // components: {
                    //     securitySchemes: {
                    //         bearerAuth: {
                    //             type: 'http',
                    //             scheme: 'bearer',
                    //             bearerFormat: 'JWT'
                    //         }
                    //     }
                    // }
                }),
            )
            .get('/', () => 'Episodify Crawler Service')
            .listen(config.PORT);

        logger.info(`🚀 Server is running at ${app.server?.hostname}:${config.PORT}`);
        logger.info(`🚀 Go to https://admin.${config.DOMAIN} for more configs`);

        // Graceful shutdown
        const shutdown = async (): Promise<void> => {
            logger.info('Shutting down gracefully...');

            // Close database connections
            await Promise.all([
                mongoDB.close(),
                kyselyDB.destroy(),
                Redis.close(),
            ]);

            process.exit(0);
        };

        const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        signals.forEach((signal) => process.on(signal, shutdown));

        process.on('unhandledRejection', (reason, promise) => {
            saveError(reason);
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            shutdown();
        });

        process.on('uncaughtException', (err) => {
            saveError(err);
        });
    } catch (error) {
        logger.error('Failed to start the application:', error);
        process.exit(1);
    }
}

bootstrap();
