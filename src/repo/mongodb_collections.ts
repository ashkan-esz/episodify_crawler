import { logger } from '@/utils';
import { mongoDB } from '@services/database';
import { saveError } from '@utils/logger';

export async function createCollectionsAndIndexes(): Promise<void> {
    try {
        const database = await mongoDB.getDatabase();
        await database.createCollection('configs');
    } catch (err2: any) {
        saveError(err2);
        logger.error(err2);
    }
}
