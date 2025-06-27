import config from '@/config';
import * as Sentry from '@sentry/bun';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Configure Pino logger
const transport = pino.transport({
    targets: [
        {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname',
            },
            level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        },
        {
            target: 'pino/file',
            options: {
                destination: path.join(logsDir, 'app.log'),
                mkdir: true,
            },
            level: 'error', // Only log errors to file
        },
    ],
});

const logger = pino(transport);

// Configure Sentry
if (config.CRAWLER_SENTRY_DNS) {
    Sentry.init({
        environment: config.NODE_ENV || 'development',
        dsn: config.CRAWLER_SENTRY_DNS,
        tracesSampleRate: 0.5, // Capture 50% of transactions for performance monitoring
        // profilesSampleRate: 1.0, // Capture 100% of transactions for profiling
        sampleRate: 0.5,
        integrations: [
            Sentry.httpIntegration(),
            Sentry.mongoIntegration(),
            Sentry.consoleIntegration(),
            Sentry.contextLinesIntegration(),
            Sentry.dedupeIntegration(),
            Sentry.linkedErrorsIntegration(),
        ],
        beforeSend(event) {
            // Example: Remove Authorization headers
            if (event.request?.headers) {
                delete event.request.headers['authorization'];
            }
            // Add more redaction as needed
            return event;
        },
    });
    logger.info('Sentry initialized.');
} else {
    logger.warn('SENTRY_DSN not found. Sentry reporting is disabled.');
}

/**
 * Logs an error to the console/file and reports it to Sentry.
 * @param error - The error object to log and report.
 * @param context - Optional additional context to include with the log and Sentry report.
 */
export function saveError(error: any, context?: Record<string, any>): void {
    if (error instanceof Error) {
        logger.error({
            err: error,
            context,
        }, `Error occurred: ${error.message}`);
    } else {
        logger.error({ error, context }, 'An unknown error occurred');
    }

    if (config.CRAWLER_SENTRY_DNS) {
        Sentry.captureException(error, {
            extra: context,
        });
    }
}

export async function saveErrorIfNeeded(error: any): Promise<void> {
    if (
        (!error.response || error.response.status !== 404) &&
        (!error.request || !error.request.res || error.request.res.statusCode !== 404) &&
        error.code !== 'ENOTFOUND' &&
        error.code !== 'EPROTO' &&
        error.code !== 'Z_BUF_ERROR' &&
        error.code !== 'DEPTH_ZERO_SELF_SIGNED_CERT' &&
        error.message !== 'certificate has expired' &&
        error.code !== 'ERR_TLS_CERT_ALTNAME_INVALID'
    ) {
        await saveError(error);
    }
}

// Export the logger instance if needed elsewhere
export default logger; 
