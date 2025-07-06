import type {
    CrawlerDBConfig,
    GeneralDBConfig,
    TorrentDBConfig,
} from '@config/dynamicConfig';
import { mongoDB } from '@services/database';
import { saveError } from '@utils/logger';
import type { InsertOneResult, UpdateResult } from 'mongodb';

export async function getCrawlerConfigs(): Promise<CrawlerDBConfig | null | 'error'> {
    try {
        const db = await mongoDB.getDatabase();

        return await db.collection(mongoDB.collections.configs).findOne<CrawlerDBConfig>({
            title: 'crawler_configs',
        });
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function insertCrawlerConfigs(
    config: CrawlerDBConfig,
): Promise<InsertOneResult<CrawlerDBConfig> | null> {
    try {
        const db = await mongoDB.getDatabase();

        return await db.collection(mongoDB.collections.configs).insertOne(config);
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function updateCrawlerConfigs(
    config: CrawlerDBConfig,
): Promise<UpdateResult<Document> | null> {
    try {
        const db = await mongoDB.getDatabase();

        return await db.collection(mongoDB.collections.configs).updateOne(
            {
                title: 'crawler_configs',
            },
            {
                $set: config,
            },
        );
    } catch (error) {
        saveError(error);
        return null;
    }
}

//-----------------------------------------
//-----------------------------------------

export async function getTorrentConfigs(): Promise<TorrentDBConfig | null | 'error'> {
    try {
        const db = await mongoDB.getDatabase();

        return await db.collection(mongoDB.collections.configs).findOne<TorrentDBConfig>({
            title: 'torrent_configs',
        });
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function getGeneralConfigs(): Promise<GeneralDBConfig | null | 'error'> {
    try {
        const db = await mongoDB.getDatabase();

        return await db.collection(mongoDB.collections.configs).findOne<GeneralDBConfig>({
            title: 'general_configs',
        });
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

//-----------------------------------------
//-----------------------------------------
