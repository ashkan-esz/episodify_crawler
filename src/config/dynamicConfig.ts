import config from '@config/index';
import { ConfigRepo } from '@/repo';
import { logger } from '@/utils';

// Crawler db configs
let crawlerDbConfigs: CrawlerDBConfig | null = null;

setTimeout(async () => {
    await fetchCrawlerDBConfigs();
}, 10 * 1000); // 10 sec

setInterval(
    async () => {
        await fetchCrawlerDBConfigs();
    },
    15 * 60 * 1000,
); //15 min

async function fetchCrawlerDBConfigs(): Promise<void> {
    const res = await ConfigRepo.getCrawlerConfigs();
    if (res === 'error' || !res) {
        crawlerDbConfigs = null;
    } else {
        crawlerDbConfigs = res;
    }
}

export function getCachedCrawlerDbConfigs(): CrawlerDBConfig | null {
    if (!crawlerDbConfigs) {
        return null;
    }
    return structuredClone(crawlerDbConfigs);
}

// Insert crawler db configs if not exist
export async function insertCrawlerDBConfigs(): Promise<void> {
    const res = await ConfigRepo.getCrawlerConfigs();
    if (res === 'error') {
        logger.error('[db_config] failed to get crawler db configs');
        return;
    }

    if (!res) {
        // Insert default crawler db configs
        const insertRes = await ConfigRepo.insertCrawlerConfigs(DefaultCrawlerDBConfig);
        if (!insertRes) {
            logger.error('[db_config] failed to insert crawler db configs');
        }
    } else {
        // Add newly added configs
        let newConfig: CrawlerDBConfig = {
            ...DefaultCrawlerDBConfig,
            ...res,
        };
        const insertRes = await ConfigRepo.updateCrawlerConfigs(newConfig);
        if (!insertRes) {
            logger.error('[db_config] failed to update crawler db configs');
        }
    }
}

export function checkCrawlerIsDisabledByConfigsDb(): boolean {
    return (crawlerDbConfigs?.crawlerDisabled || crawlerDbConfigs?.disableCrawler) ?? false;
}

//-----------------------------------------
//-----------------------------------------

// Torrent db configs
let torrentDbConfigs: TorrentDBConfig | null = null;

setTimeout(async () => {
    await fetchTorrentDBConfigs();
}, 30 * 1000); // 30 sec

setInterval(
    async () => {
        await fetchTorrentDBConfigs();
    },
    30 * 60 * 1000,
); //30 min

async function fetchTorrentDBConfigs(): Promise<void> {
    const res = await ConfigRepo.getTorrentConfigs();
    if (res === 'error' || !res) {
        torrentDbConfigs = null;
    } else {
        torrentDbConfigs = res;
    }
}

export function getCachedTorrentDbConfigs(): TorrentDBConfig | null {
    if (!torrentDbConfigs) {
        return null;
    }
    return structuredClone(torrentDbConfigs);
}

//-----------------------------------------
//-----------------------------------------

// Torrent db configs
let generalDbConfigs: GeneralDBConfig | null = null;

setTimeout(async () => {
    await fetchGeneralDBConfigs();
}, 30 * 1000); // 10 sec

setInterval(
    async () => {
        await fetchGeneralDBConfigs();
    },
    30 * 60 * 1000,
); //30 min

async function fetchGeneralDBConfigs(): Promise<void> {
    const res = await ConfigRepo.getGeneralConfigs();
    if (res === 'error' || !res) {
        generalDbConfigs = null;
    } else {
        generalDbConfigs = res;
    }
}

export function getCachedGeneralDbConfigs(): GeneralDBConfig | null {
    if (!generalDbConfigs) {
        return null;
    }
    return structuredClone(generalDbConfigs);
}

//-----------------------------------------
//-----------------------------------------

//TODO : move env config to db_config
//TODO : check these configs
export type CrawlerDBConfig = {
    title: string;
    disableCrawler: boolean;
    crawlerDisabled: boolean;
    disableCrawlerStart: number | Date;
    crawlerConcurrency: number;
};

export const DefaultCrawlerDBConfig: CrawlerDBConfig = Object.freeze({
    title: 'crawler_configs',
    disableCrawler: false,
    crawlerDisabled: false,
    disableCrawlerStart: 0,
    crawlerConcurrency: config.CRAWLER_CONCURRENCY,
});

export type GeneralDBConfig = {
    title: string;
    corsAllowedOrigins: string[],
};

export type TorrentDBConfig = {
    title: string;
    torrentDownloadMaxSpaceSize: 10000;
    torrentDownloadSpaceThresholdSize: 1000;
    torrentFilesExpireHour: 36;
    torrentFilesServingConcurrencyLimit: 20;
    torrentDownloadTimeoutMin: 30;
    torrentDownloadConcurrencyLimit: 3;
    torrentFileExpireDelayFactor: 1.5;
    torrentFileExpireExtendHour: 4;
    torrentUserEnqueueLimit: 2;
    torrentDownloadMaxFileSize: number;
    torrentDownloadDisabled: false;
    torrentFilesServingDisabled: false;
    torrentSendResultToBot: false;
    defaultTorrentDownloaderConfig: DefaultTorrentDownloaderConfig;
};

export type DefaultTorrentDownloaderConfig = {
    status: TorrentDownloaderStatus;
    minImdbScore: number;
    minMalScore: number;
    newEpisodeQualities: string;
    newEpisodeLinkLimit: number;
    movieQualities: string;
    movieLinkLimit: number;
    disabled: string[];
    torrentFilesExpireHour: number;
    bypassIfHasDownloadLink: boolean;
};

export enum TorrentDownloaderStatus {
    IGNORE = 'ignore',
    FORCE = 'force',
    DEFAULT = 'default',
}

export enum TorrentDownloaderDisabledState {
    ALL = 'all',
}
