import { mongoDB } from '@services/database';
import { saveError } from '@utils/logger';

export async function getSourcesObjDB(adminCall: boolean = false): Promise<any | null> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.sources);
        const result = await collection.findOne({ title: 'sources' });

        if (result && adminCall) {
            const keys = Object.keys(result);
            result.sources = [];
            for (let i = 0; i < keys.length; i++) {
                if (['_id', 'title'].includes(keys[i])) {
                    continue;
                }
                result.sources.push({
                    sourceName: keys[i],
                    ...result[keys[i]],
                });
                delete result[keys[i]];
            }
        }

        return result;
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function updateSourcesObjDB(updateFields: any): Promise<any | null> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.sources);
        const result = await collection.findOneAndUpdate({title: 'sources'}, {
            $set: updateFields
        });
        return result?.value || null;
    } catch (error) {
        saveError(error);
        return null;
    }
}

