import { mongoDB, prisma } from '@/services/database';
import { MoviePosterS3, MovieTrailerS3 } from '@/types/movie';
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

export async function getAllS3CastImageDB() {
    try {
        return await prisma.castImage.findMany({
            where: {},
            select: {
                url: true,
            }
        });
    } catch (error) {
        saveError(error);
        return null;
    }
}
