import * as Sentry from "@sentry/bun";
import pino from 'pino';
import path from 'path';
import fs from 'fs';

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
            options: { destination: path.join(logsDir, 'app.log'), mkdir: true },
            level: 'error', // Only log errors to file
        },
    ],
});

const logger = pino(transport);

// Configure Sentry
// !! IMPORTANT: Replace 'YOUR_SENTRY_DSN' with your actual Sentry DSN !!
// It's recommended to use an environment variable for this (e.g., process.env.SENTRY_DSN)
const sentryDsn = process.env.SENTRY_DSN || 'YOUR_SENTRY_DSN';

if (sentryDsn !== 'YOUR_SENTRY_DSN') {
    Sentry.init({
        dsn: sentryDsn,
        tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
        // profilesSampleRate: 1.0, // Capture 100% of transactions for profiling
        sampleRate: 1.0,
        integrations: [
            // Add any necessary Sentry integrations here
        ],
        // Adjust sample rates and add other configurations as needed for production
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
        logger.error({ err: error, context }, `Error occurred: ${error.message}`);
    } else {
        logger.error({ error, context }, 'An unknown error occurred');
    }

    if (sentryDsn !== 'YOUR_SENTRY_DSN') {
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
        error.code !== "ERR_TLS_CERT_ALTNAME_INVALID"
    ) {
        await saveError(error);
    }
}

// Export the logger instance if needed elsewhere
export default logger; 
