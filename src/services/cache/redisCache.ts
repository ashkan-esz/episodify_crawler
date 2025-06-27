import { getRedis, setRedis } from '@/services/database/redis';
import { saveError } from '@utils/logger';

export const CACHE_KEY_PREFIX = Object.freeze({
    jwtDataCachePrefix: "jwt:",
    userDataCachePrefix: "user:",
    rolePermissionsCachePrefix: "roleIds:",
});

export async function getJwtByKey<T = any>(key: string): Promise<T | null> {
    try {
        return await getRedis<T>(CACHE_KEY_PREFIX.jwtDataCachePrefix+key);
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function setJwtByKey(
    key: string,
    value: any,
    durationSec?: number | null,
): Promise<boolean> {
    try {
        return await setRedis(
            CACHE_KEY_PREFIX.jwtDataCachePrefix+key,
            value,
            durationSec);
    } catch (error) {
        saveError(error);
        return false;
    }
}

export async function getRoleByKey<T = any>(key: string): Promise<T | null> {
    try {
        return await getRedis<T>(CACHE_KEY_PREFIX.rolePermissionsCachePrefix+key);
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function setRoleByKey(
    key: string,
    value: any,
    durationSec?: number | null,
): Promise<boolean> {
    try {
        return await setRedis(
            CACHE_KEY_PREFIX.rolePermissionsCachePrefix+key,
            value,
            durationSec);
    } catch (error) {
        saveError(error);
        return false;
    }
}

export async function getUserByKey<T = any>(key: string): Promise<T | null> {
    try {
        return await getRedis<T>(CACHE_KEY_PREFIX.userDataCachePrefix+key);
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function setUserByKey(
    key: string,
    value: any,
    durationSec?: number | null,
): Promise<boolean> {
    try {
        return await setRedis(
            CACHE_KEY_PREFIX.userDataCachePrefix+key,
            value,
            durationSec);
    } catch (error) {
        saveError(error);
        return false;
    }
} 
