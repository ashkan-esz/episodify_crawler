import config from '@/config';
import { saveCrawlerWarning } from '@/repo/serverAnalysis';
import { CrawlerPauseReason } from '@/types';
import { CrawlerErrors } from '@/status/warnings';
import { averageCpu, getMemoryStatus } from '@utils/serverStatus';
import {
    checkForceResume,
    checkForceStopCrawler,
    disableForceResume,
    getCrawlerMemoryLimit,
    getCrawlerStatusObj,
    removeCrawlerPause,
    saveStopCrawler,
    setCrawlerPause,
} from './status';

export function manualPauseCrawler(minute: number): string {
    const res = setCrawlerPause(CrawlerPauseReason.Manual_PAUSE, true, minute);
    if (res !== 'ok') {
        return res;
    }

    return 'ok';
}

export function manualResumeCrawler(force: boolean): string {
    const res = removeCrawlerPause(true, force);
    if (res !== 'ok') {
        return res;
    }

    return 'ok';
}

export function manualStopCrawler(): string {
    saveStopCrawler();
    removeCrawlerPause();

    return 'ok';
}

//--------------------------------------------------------
//--------------------------------------------------------

let gcCallTime: number = Date.now();

export async function pauseCrawler(): Promise<void> {
    while (Date.now() < getCrawlerStatusObj().pauseData.pauseUntil) {
        if (checkForceStopCrawler()) {
            break;
        }
        setCrawlerPause(CrawlerPauseReason.Manual_PAUSE);
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    let memoryStatus = await getMemoryStatus(false);
    const startTime = Date.now();
    while (memoryStatus.used >= getCrawlerMemoryLimit() || averageCpu > config.CRAWLER_CPU_LIMIT) {
        if (Date.now() - startTime > config.CRAWLER_PAUSE_DURATION_LIMIT * 60 * 1000) {
            const info =
                memoryStatus.used >= getCrawlerMemoryLimit()
                    ? `${memoryStatus.used.toFixed(0)}M/${getCrawlerMemoryLimit().toFixed(0)}M`
                    : `${averageCpu}/${config.CRAWLER_CPU_LIMIT}`;
            const m = CrawlerErrors.crawler.pauseLimit(
                config.CRAWLER_PAUSE_DURATION_LIMIT,
                info,
            );
            saveCrawlerWarning(m);
            break;
        }

        if (checkForceStopCrawler()) {
            break;
        }

        let pauseReason = CrawlerPauseReason.HIGH_MEMORY_USAGE;
        let pauseInfo = `memory/limit: ${memoryStatus.used.toFixed(0)}/${getCrawlerMemoryLimit().toFixed(0)} `;

        if (averageCpu > config.CRAWLER_CPU_LIMIT) {
            pauseReason = CrawlerPauseReason.HIGH_CPU_USAGE;
            pauseInfo = `cpu/limit: ${averageCpu}/${config.CRAWLER_CPU_LIMIT}`;
        }

        setCrawlerPause(pauseReason, false, 0, pauseInfo);

        if (checkForceResume()) {
            disableForceResume();
            break;
        }

        // TODO : check this
        if (config.CRAWLER_MANUAL_GC_ON_HIGH_LOAD && memoryStatus.used >= getCrawlerMemoryLimit()) {
            if (gcCallTime && Date.now() - gcCallTime > 5 * 1000) {
                global.gc?.();
                gcCallTime = Date.now();
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        memoryStatus = await getMemoryStatus(false);
    }

    removeCrawlerPause();
}

export async function checkServerIsIdle(): Promise<boolean> {
    const memoryStatus = await getMemoryStatus(false);
    return (
        memoryStatus.used < getCrawlerMemoryLimit() &&
        memoryStatus.used < config.CRAWLER_TOTAL_MEMORY * 0.6 &&
        averageCpu < 50
    );
}
