import config from '@/config';
import { saveError } from '@utils/logger';
import { createClient } from 'redis';

// Create a Redis client instance
const client = createClient({
    url: config.REDIS_URL,
    password: config.REDIS_PASSWORD || undefined,
    // Add more options as needed
});

export async function connect(): Promise<void> {
    try {
        await client.connect();
    } catch (err) {
        console.error('[Redis] Failed to connect:', err);
    }
}

export async function close(): Promise<void> {
    try {
        await client.close();
    } catch (err) {
        console.error('[Redis] Failed to close:', err);
    }
}

client.on('error', (err: any) => {
    console.error('[Redis] error:', err);
});

client.on('reconnecting', () => {
    console.warn('[Redis] reconnecting...');
});

client.on('error', (err) => {
    console.error('[Redis] error:', err);
});

export default client;

//-------------------------------------------
//-------------------------------------------

export async function redisKeyExist(key: string): Promise<boolean> {
    try {
        if (!client.isReady) {
            return false;
        }
        return (await client.exists(key)) === 1;
    } catch (error) {
        saveError(error);
        return false;
    }
}

export async function getRedis<T = any>(key: string): Promise<T | null> {
    try {
        if (!client.isReady) return null;
        const value = await client.get(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function setRedis(
    key: string,
    value: any,
    durationSec: number | null = null
): Promise<boolean> {
    try {
        if (!client.isReady) return false;
        if (durationSec) {
            await client.set(key, JSON.stringify(value), { EX: durationSec });
        } else {
            await client.set(key, JSON.stringify(value));
        }
        return true;
    } catch (error) {
        saveError(error);
        return false;
    }
}

export async function delRedis(key: string): Promise<boolean> {
    try {
        if (!client.isReady) return false;
        return (await client.del(key)) === 1;
    } catch (error) {
        saveError(error);
        return false;
    }
}
