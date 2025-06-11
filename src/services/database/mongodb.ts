import config from '@/config';
import { MongoClient, Db, MongoClientOptions } from 'mongodb';

class MongoDBClient {
    private static instance: MongoDBClient | null = null;
    private client: MongoClient;
    private db: Db;
    private isConnected = false;
    collections = {
        movies: "movies",
    };

    private constructor() {
        const options: MongoClientOptions = {
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 5000,
            heartbeatFrequencyMS: 10000,
            compressors: ['zstd', 'zlib'],
        };

        this.client = new MongoClient(config.MONGODB_DATABASE_URL, options);
        this.db = this.client.db();
    }

    public static getInstance(): MongoDBClient {
        if (!MongoDBClient.instance) {
            MongoDBClient.instance = new MongoDBClient();
        }
        return MongoDBClient.instance;
    }

    public async connect(): Promise<Db> {
        if (this.isConnected) return this.db;

        try {
            await this.client.connect();
            this.isConnected = true;
            console.log('MongoDB connected successfully');
            return this.db;
        } catch (error) {
            console.error('MongoDB connection failed:', error);
            throw error;
        }
    }

    public getDatabase(): Db {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call connect() first');
        }
        return this.db;
    }

    public async close(): Promise<void> {
        if (this.isConnected) {
            await this.client.close();
            this.isConnected = false;
            MongoDBClient.instance = null;
            console.log('MongoDB connection closed');
        }
    }

    // Health check
    public async ping(): Promise<boolean> {
        try {
            await this.db.command({ ping: 1 });
            return true;
        } catch {
            return false;
        }
    }
}

// Public interface
export const mongoDB = MongoDBClient.getInstance();
