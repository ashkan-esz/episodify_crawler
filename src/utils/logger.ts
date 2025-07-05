import config from '@/config';
import * as Sentry from '@sentry/bun';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

class BunLogger {
    private level: number;
    private levels: Record<LogLevel, number> = {
        trace: 10,
        debug: 20,
        info: 30,
        warn: 40,
        error: 50,
        fatal: 60,
    };

    private colors = {
        trace: '\x1b[90m',  // gray
        debug: '\x1b[36m',  // cyan
        info: '\x1b[32m',   // green
        warn: '\x1b[33m',   // yellow
        error: '\x1b[31m',  // red
        fatal: '\x1b[35m',  // magenta
        reset: '\x1b[0m',
    };

    constructor(level: LogLevel = 'info') {
        this.level = this.levels[level];
    }

    setLevel(level: LogLevel) {
        this.level = this.levels[level];
    }

    private log(level: LogLevel, message: string, data?: object) {
        if (this.levels[level] < this.level) {
            return;
        }

        const timestamp = this.getIranTime();
        // const timestamp = new Date().toISOString();
        const color = this.colors[level];

        // if (Bun.env.NODE_ENV === 'production') {
        //     // JSON output for production
        //     const entry = JSON.stringify({
        //         time: timestamp,
        //         level,
        //         msg: message,
        //         ...data
        //     });
        //
        //     level === 'error' || level === 'fatal'
        //         ? console.error(entry)
        //         : console.log(entry);
        // } else {
        // Colorized output for development
        const prefix = `${color}[${timestamp}] ${level.toUpperCase()}:${this.colors.reset}`;
        const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';

        if (level === 'error' || level === 'fatal') {
            console.error(`${prefix} ${message}${dataStr}`);
        } else {
            console.log(`${prefix} ${message}${dataStr}`);
        }
        // }
    }

    // Get Iran time (IRST/IRDT) with DST handling
    private getIranTime(): string {
        const now = new Date();
        // Adjust to Iran time
        const iranTime = new Date(
            now.getTime() -
            now.getTimezoneOffset() * 60 * 1000
        );

        return iranTime.toISOString()
            .replace('T', ' ')
            .replace('Z', ' (IRAN)');
    }

    // Log methods
    trace = (msg: string, data?: object) => this.log('trace', msg, data);
    debug = (msg: string, data?: object) => this.log('debug', msg, data);
    info = (msg: string, data?: object) => this.log('info', msg, data);
    warn = (msg: string, data?: object) => this.log('warn', msg, data);
    error = (msg: string, data?: object) => this.log('error', msg, data);
    fatal = (msg: string, data?: object) => this.log('fatal', msg, data);
}

const logger = new BunLogger(
    (config.LOG_LEVEL as LogLevel) || 'info',
);

// Export the logger instance if needed elsewhere
export default logger;

//-------------------------------------------------
//-------------------------------------------------

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
        logger.error(`Error occurred: ${error.message}`, {
            err: error,
            context,
        });
    } else {
        logger.error('An unknown error occurred', { error, context });
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

/**
 * Maps known database error codes (Prisma, Postgres) to human-readable error types.
 * @param code - The error code from the database or ORM
 * @returns A string representing the error type, or 'unknown' if not recognized
 */
export function mapDbErrorCode(code: string | number | undefined): string {
    switch (code) {
        // Unique constraint violation
        case 'P2002': // Prisma
        case '23505': // Postgres
            return 'unique_violation';
        // Foreign key violation
        case 'P2003': // Prisma
        case '23503': // Postgres
            return 'foreign_key_violation';
        // Not null violation
        case '23502': // Postgres
            return 'not_null_violation';
        // Check violation
        case '23514': // Postgres
            return 'check_violation';
        // Exclusion violation
        case '23P01': // Postgres
            return 'exclusion_violation';
        // Add more as needed
        default:
            return 'unknown';
    }
}
