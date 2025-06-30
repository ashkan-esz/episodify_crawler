import { mongoDB, kyselyDB } from '@/services/database';
import type { MoviePosterS3, MovieTrailerS3 } from '@/types/movie';
import type { CastImage } from '@/types/staff';
import { saveError } from '@utils/logger';

export async function getAllS3PostersDB(): Promise<MoviePosterS3[] | null> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        return await collection.find<MoviePosterS3>({poster_s3: {$ne: null}}, {projection: {'poster_s3.url': 1}}).toArray();
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function getAllS3WidePostersDB(): Promise<MoviePosterS3[] | null> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        return await collection.find<MoviePosterS3>({poster_wide_s3: {$ne: null}}, {projection: {'poster_wide_s3.url': 1}}).toArray();
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function getAllS3TrailersDB(): Promise<MovieTrailerS3[] | null> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        return await collection.find<MovieTrailerS3>({trailer_s3: {$ne: null}}, {projection: {'trailer_s3.url': 1}}).toArray();
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function getStaffS3Images(): Promise<CastImage[] | null> {
    try {
        const res =  await kyselyDB
            .selectFrom('staffs')
            .select(['image_data'])
            .where('image_data', 'is not', null)
            .execute();

        return (res || [])
            .map(item => item.image_data)
            .filter((item) => !!item)
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function getCharacterS3Images(): Promise<CastImage[] | null>  {
    try {
        const res =  await kyselyDB
            .selectFrom('characters')
            .select(['image_data'])
            .where('image_data', 'is not', null)
            .execute();

        return (res || [])
            .map(item => item.image_data)
            .filter((item) => !!item)
    } catch (error) {
        saveError(error);
        return null;
    }
}
