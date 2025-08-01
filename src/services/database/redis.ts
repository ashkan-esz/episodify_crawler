import config from '@/config';
import { saveError } from '@utils/logger';

// Create a Redis client instance
const client = new Bun.RedisClient(config.REDIS_URL, {
    autoReconnect: true,
});

export async function connect(): Promise<void> {
    // try {
    //     await client.connect();
    // } catch (err) {
    //     console.error('[Redis] Failed to connect:', err);
    // }
    // logger.info('[Redis] Bun client initialized. Connection will be established on first use.');
}

export async function close(): Promise<void> {
    try {
        await client.close();
    } catch (err) {
        console.error('[Redis] Failed to close:', err);
    }
}

// client.on('error', (err: any) => {
//     console.error('[Redis] error:', err);
//     saveError(err, { context: 'Redis Client Error' });
// });
//
// client.on('reconnecting', () => {
//     console.warn('[Redis] reconnecting...');
// });

export default client;

//-------------------------------------------
//-------------------------------------------

export async function redisKeyExist(key: string): Promise<boolean> {
    try {
        // Bun's exists returns 0 or 1, so the check remains the same.
        return await client.exists(key);
    } catch (error) {
        saveError(error, { context: 'redisKeyExist' });
        return false;
    }
}

export async function getRedis<T = any>(key: string): Promise<T | null> {
    try {
        // if (!client.isReady) return null;
        const value = await client.get(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        saveError(error, { context: 'getRedis' });
        return null;
    }
}

export async function setRedis(
    key: string,
    value: any,
    durationSec: number | null = null,
): Promise<boolean> {
    try {
        // if (!client.isReady) return false;
        if (durationSec) {
            // await client.set(key, JSON.stringify(value), { EX: durationSec });
            // Bun's set method with expiration uses 'EX' option.
            await client.set(key, JSON.stringify(value), 'EX', durationSec);
        } else {
            await client.set(key, JSON.stringify(value));
        }
        return true;
    } catch (error) {
        saveError(error, { context: 'setRedis' });
        return false;
    }
}

export async function delRedis(key: string): Promise<boolean> {
    try {
        // if (!client.isReady) return false;
        return (await client.del(key)) === 1;
    } catch (error) {
        saveError(error, { context: 'delRedis' });
        return false;
    }
}
