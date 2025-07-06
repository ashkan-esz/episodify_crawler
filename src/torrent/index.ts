import type { CrawlerExtraConfigs, SourceConfig, TorrentTitle } from '@/types';

export interface TorrentSourceCrawler {
    (
        titles: TorrentTitle[],
        pageNumber: number,
        pageCount: number,
        saveCrawlDataFunc: TorrentSaveCrawlDataFunc,
        sourceConfig: SourceConfig,
        extraConfigs: CrawlerExtraConfigs,
    ): Promise<void>;
}

export interface TorrentSaveCrawlDataFunc {
    (
        titleData: TorrentTitle,
        sourceConfig: SourceConfig,
        extraConfigs: CrawlerExtraConfigs,
    ): Promise<void>;
}
