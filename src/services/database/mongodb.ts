import config from '@/config';
import { MongoClient, Db, MongoClientOptions, ClientSession, TransactionOptions } from 'mongodb';
import { LogEntry } from 'winston';

// Environment validation
if (!config.MONGODB_DATABASE_URL) {
    throw new Error('MONGODB_URI environment variable not set');
}

class MongoDBManager {
    private static instance: MongoDBManager;
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private connectionPromise: Promise<Db> | null = null;
    private shutdownSignalReceived = false;
    private readonly maxAttempts = 3;
    private logger: (entry: LogEntry) => void = console.log;
    private healthMonitor: NodeJS.Timeout | null = null;
    private baseHealthCheckInterval = 60000;
    private consecutiveSuccessfulPings = 0;
    private connectionStable = false;
    collections = {
        movies: 'movies',
        configs: 'configs',
        sources: 'sources',
        serverAnalysis: 'serverAnalysis',
        links: 'links',
    };

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    public setLogger(logger: (entry: LogEntry) => void) {
        this.logger = logger;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    private log(level: LogEntry['level'], message: string, metadata?: object) {
        this.logger({
            level,
            message: `[MongoDB] ${message}`,
            metadata,
        });
    }

    private constructor() {}

    public static getInstance(): MongoDBManager {
        if (!MongoDBManager.instance) {
            MongoDBManager.instance = new MongoDBManager();
        }
        return MongoDBManager.instance;
    }

    public async getDatabase(): Promise<Db> {
        if (this.db) {
            return this.db;
        }
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        return (this.connectionPromise = this.initializeConnection());
    }

    private async initializeConnection(attempt = 1): Promise<Db> {
        if (this.shutdownSignalReceived) {
            throw new Error('Connection refused: Application is shutting down');
        }

        try {
            const options: MongoClientOptions = {
                // maxPoolSize: 10,
                // minPoolSize: 2,
                minPoolSize: 1,  // Free tier has limited RAM (512MB)
                maxPoolSize: 5,   // Max connections: 500 (but conserve RAM)
                maxIdleTimeMS: 30000,
                serverSelectionTimeoutMS: 5000,
                heartbeatFrequencyMS: 10000,
                // connectTimeoutMS: 10000,
                connectTimeoutMS: 5000,  // Shorter timeout for free tier
                // waitQueueTimeoutMS: 5000,
                waitQueueTimeoutMS: 2000, // Fail fast when busy
                socketTimeoutMS: 30000,  // Prevent long-running ops
                compressors: ['zstd', 'zlib'],
            };

            this.client = new MongoClient(config.MONGODB_DATABASE_URL, options);

            // Start connection without waiting (for faster cold starts)
            const connectPromise = this.client.connect();

            // Timeout handling
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout')), 8000),
            );

            await Promise.race([connectPromise, timeout]);

            this.db = this.client.db();
            // console.log('MongoDB connection established');

            // Verify connection
            await this.db.command({ ping: 1 });

            // if (process.env.NODE_ENV !== 'cli') {
            //     this.startHealthMonitor();
            // }
            this.startHealthMonitor();

            return this.db;
        } catch (error) {
            if (attempt < this.maxAttempts) {
                const delay = 500 * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this.initializeConnection(attempt + 1);
            }
            this.cleanupAfterFailure();
            console.error('Database connection failed:', error);
            throw error;
        }
    }

    public async withTransaction<T>(
        fn: (session: ClientSession) => Promise<T>,
        options?: TransactionOptions,
    ): Promise<T> {
        // const db = await this.getDatabase();
        await this.getDatabase();
        const session = this.client!.startSession();

        try {
            let result: T;
            await session.withTransaction(async () => {
                result = await fn(session);
            }, options);
            return result!;
        } finally {
            await session.endSession();
        }
    }

    public async close(timeoutMs = 5000): Promise<void> {
        if (!this.client) {
            return;
        }

        this.shutdownSignalReceived = true;

        try {
            console.log('Closing MongoDB connection...');

            // Stop monitoring first
            this.stopHealthMonitor();

            // Close with timeout protection
            const closePromise = this.client.close();
            const timeout = new Promise<void>((_, reject) =>
                setTimeout(() => reject(new Error('Close operation timed out')), timeoutMs),
            );

            await Promise.race([closePromise, timeout]);

            console.log('MongoDB connection closed gracefully');
        } catch (error) {
            console.error('Error closing connection:', error);
        } finally {
            this.resetState();
        }
    }

    public async healthCheck(): Promise<{ ok: boolean; error?: string }> {
        try {
            const db = await this.getDatabase();
            await db.command({ ping: 1 });
            return { ok: true };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    private startHealthMonitor(): void {
        if (this.healthMonitor) return; // Avoid duplicates

        this.healthMonitor = setInterval(async () => {
            try {
                if (!this.db) return;

                // Perform actual database ping
                await this.db.command({ ping: 1 }, { timeoutMS: 1000 });

                // ... ping ...
                this.consecutiveSuccessfulPings++;

                if (this.consecutiveSuccessfulPings > 5) {
                    this.connectionStable = true;
                }

                // Log successful heartbeat (debug level)
                // this.log('debug', 'Connection heartbeat successful');
            } catch (error) {
                this.log('error', 'Connection heartbeat failed', { error });

                this.consecutiveSuccessfulPings = 0;
                this.connectionStable = false;

                // Automatic recovery attempt
                this.reconnect();
            }
        }, this.getHealthCheckInterval());

        // Don't keep process alive just for monitoring
        if (this.healthMonitor.unref) {
            this.healthMonitor.unref();
        }
    }

    private stopHealthMonitor(): void {
        if (this.healthMonitor) {
            clearInterval(this.healthMonitor);
            this.healthMonitor = null;
        }
    }

    private getHealthCheckInterval(): number {
        // Increase interval when connection is stable
        const baseInterval = this.baseHealthCheckInterval;
        return this.connectionStable
            ? baseInterval * 3
            : baseInterval;
    }

    private async reconnect(attempt = 1): Promise<void> {
        const MAX_ATTEMPTS = 5;
        const BASE_DELAY = 1000; // 1s

        try {
            this.log('info', `Reconnect attempt ${attempt}/${MAX_ATTEMPTS}`);
            this.cleanupAfterFailure();
            await this.getDatabase();
            this.log('info', 'Reconnect successful');
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error: any) {
            if (attempt < MAX_ATTEMPTS) {
                const delay = BASE_DELAY * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.reconnect(attempt + 1);
            }
            this.log('error', 'Reconnect failed after maximum attempts');
        }
    }

    private cleanupAfterFailure(): void {
        this.client = null;
        this.db = null;
        this.connectionPromise = null;
    }

    private resetState(): void {
        this.client = null;
        this.db = null;
        this.connectionPromise = null;
        this.shutdownSignalReceived = false;
    }
}

export const mongoDB = MongoDBManager.getInstance();

export class MongoDBError extends Error {
    readonly name = 'DatabaseError';
    readonly isTransient: boolean;

    constructor(message: string, isTransient = false) {
        super(message);
        this.isTransient = isTransient;
    }
}
