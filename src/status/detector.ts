import { DownloadLink, SourceConfig } from '@/types';
import { CrawlerErrors } from '@/status/warnings';
import { ServerAnalysisRepo } from '@/repo';

const changesStatus: {
    sourceName: string;
    badDownloadLinks: string[];
    badPosters: string[];
    badPersianSummary: string[];
} = {
    sourceName: '',
    badDownloadLinks: [],
    badPosters: [],
    badPersianSummary: [],
};

export function checkCrawledDataForChanges(
    sourceConfig: SourceConfig,
    pageLink: string,
    downloadLinks: DownloadLink[],
    badLinks: DownloadLink[],
    poster: string,
    persianSummary: string,
): void {
    if (changesStatus.sourceName !== sourceConfig.config.sourceName) {
        changesStatus.sourceName = sourceConfig.config.sourceName;
        changesStatus.badDownloadLinks = [];
        changesStatus.badPosters = [];
        changesStatus.badPersianSummary = [];
    }

    if (badLinks.length > 0) {
        changesStatus.badDownloadLinks.push(pageLink);
    }

    if (sourceConfig.config.has_poster && !poster) {
        changesStatus.badPosters.push(pageLink);
    }
    if (sourceConfig.config.has_summary && !persianSummary) {
        changesStatus.badPersianSummary.push(pageLink);
    }
}

export async function checkAndHandleSourceChange(): Promise<void> {
    // let reasons = [];
    if (changesStatus.badDownloadLinks.length >= 20) {
        const m = CrawlerErrors.source.badDownloadLinks(changesStatus.sourceName);
        ServerAnalysisRepo.saveCrawlerWarning(m);
        // reasons.push('downloadLinks');
    }
    if (changesStatus.badPosters.length >= 20) {
        const m = CrawlerErrors.source.badPosters(changesStatus.sourceName);
        ServerAnalysisRepo.saveCrawlerWarning(m);
        // reasons.push('poster');
    }
    if (changesStatus.badPersianSummary.length >= 20) {
        const m = CrawlerErrors.source.badPersianSummary(changesStatus.sourceName);
        ServerAnalysisRepo.saveCrawlerWarning(m);
        // reasons.push('persianSummary');
    }

    // if (Math.max(changesStatus.badDownloadLinks.length, changesStatus.badPosters.length, changesStatus.badPersianSummary.length) >= 30) {
    // let disableResult = await disableSource(changesStatus.sourceName);
    // if (disableResult !== 'notfound' && disableResult !== "error") {
    //     const warningMessages = getCrawlerWarningMessages(changesStatus.sourceName, `bad ${reasons.join(',')}`);
    //     await saveCrawlerWarning(warningMessages.source.disabled);
    // }
    // }

    //reset
    changesStatus.sourceName = '';
    changesStatus.badDownloadLinks = [];
    changesStatus.badPosters = [];
    changesStatus.badPersianSummary = [];
}
