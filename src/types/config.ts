import { RemoteBrowser } from '@services/crawler/remoteHeadlessBrowser';
import { CrawlerExtraConfigs, CrawlerPauseReason } from '@/types/crawler';

export type SourcePageStatus = {
    url: string;
    state: string;
    stateTime: number | Date;
};

export type CrawlerStatusLimits = {
    memory: {
        value: number;
        limit: number | string;
        total: number;
    };
    cpu: {
        value: number[];
        limit: number | string;
    };
    imageOperations: {
        value: number;
        limit: number;
    };
    trailerUpload: {
        value: number;
        limit: number;
    };
};

export type CrawlerStatusSource = {
    sourceName: string;
    url: string;
    checked: boolean;
    changed: boolean;
    crawled: boolean;
};

export type CrawlerStatus = {
    disabledData: {
        isEnvDisabled: boolean;
        isDbDisabled: boolean;
        isDbDisabled_temporary: boolean;
        dbDisableDuration: number | Date;
        dbDisableStart: number | Date;
    };
    pauseData: {
        isPaused: boolean;
        reason: CrawlerPauseReason;
        info: string;
        isManual: boolean;
        pausedFrom: number;
        pauseMinute: number;
        pauseUntil: number;
    };
    crawlerState: CrawlerState;
    forceResume: boolean;
    forceStop: boolean;
    //---------------------
    crawlMode: number;
    pageNumber: number;
    pageCount: number | null;
    //---------------------
    crawlId: string;
    isCrawling: boolean;
    isCrawlCycle: boolean;
    isManualStart: boolean;
    crawledSources: {
        name: string,
        startTime: Date,
        endTime: Date,
        crawlMode: number,
        duration: number,
        pausedDuration: number,
        lastPages: number[],
    }[];
    crawlingSource: {
        name: string,
        startTime: Date,
        crawlMode: number,
        pausedDuration: number,
    } | null;
    totalPausedDuration: number;
    startTime: Date;
    endTime: number | Date;
    duration: number | Date;
    error: boolean;
    errorMessage: string;
    //---------------------
    sourcePage: SourcePageStatus;
    pageLinks: {
        url: string;
        pageNumber: number | null;
        state: string;
        stateTime: number | Date;
        time: Date;
    }[];
    constValues: {
        concurrencyNumber: number;
        pauseDuration: number | Date;
    };
    limits: CrawlerStatusLimits;
    domainChangeHandler: {
        isActive: boolean;
        startTime: Date;
        endTime: number | Date;
        duration: number | Date;
        state: string;
        stateTime: number | Date;
        error: boolean;
        errorMessage: string;
        sources: CrawlerStatusSource[];
    };
    remoteBrowsers: RemoteBrowser[];
    axiosBlackList: {
        default: {
            sourceName: string;
            errorCounter: number;
            lastErrorTime: number | Date;
            isBlocked: boolean;
            totalErrorCounter: number;
        }[];
        remoteBrowsers: {
            sourceName: string;
            lastErrorTime: number | Date;
            isBlocked: boolean;
            linksCount: number;
        }[];
    };
    extraConfigs: CrawlerExtraConfigs;
};

export type CrawlerLog = {
    crawlId: string,
    startTime:  Date;
    endTime: number | Date;
    duration: number | Date;
    crawlMode: number;
    isCrawlCycle: boolean;
    isManualStart: boolean;
    crawledSources: {
        name: string,
        startTime: Date,
        endTime: Date,
        crawlMode: number,
        duration: number,
        pausedDuration: number,
        lastPages: number[],
    }[];
    totalPausedDuration: number;
    error: boolean;
    errorMessage: string;
    forceStop: boolean;
    domainChangeHandler: {
        startTime: Date;
        endTime: number | Date;
        duration: number | Date;
        state: string,
        error: boolean;
        errorMessage: string;
    },
}

export enum CrawlerState {
    OK = 'ok',
    ERROR = 'error',
    PAUSED = 'paused',
    MANUAL_PAUSED = 'manual_paused',
    WAITING_FOR_MANUAL_PAUSE_APPLY = 'waiting for manual pause apply',
    WAITING_FOR_MANUAL_STOP_APPLY = 'waiting for manual stop apply',
}
