import config from '@/config';
import { blackListSources, remoteBrowsers } from '@/remoteHeadlessBrowser';
import { Configs as ConfigsDB, ServerAnalysis } from '@/repo';
import { axiosBlackListSources } from '@/searchTools';
import { linkStateMessages } from '@/status/warnings';
import {
    CrawlerExtraConfigs,
    CrawlerLog,
    CrawlerPauseReason,
    CrawlerState,
    CrawlerStatus,
    CrawlerStatusSource,
    ExtraConfigsSwitchState,
} from '@/types';
import { logger } from '@/utils';
import { getDatesBetween, getDecodedLink } from '@utils/crawler';
import { averageCpu, getMemoryStatus } from '@utils/serverStatus';
import { v4 as uuidv4 } from 'uuid';

export const crawlerMemoryLimit = config.CRAWLER_MEMORY_LIMIT || config.CRAWLER_TOTAL_MEMORY * 0.85;

let crawlerStatus: CrawlerStatus = getDefaultCrawlerStatus();

function getDefaultCrawlerStatus(): CrawlerStatus {
    return {
        disabledData: {
            isEnvDisabled: config.DISABLE_CRAWLER,
            isDbDisabled: false,
            isDbDisabled_temporary: false,
            dbDisableDuration: 0,
            dbDisableStart: 0,
        },
        pauseData: {
            isPaused: false,
            reason: CrawlerPauseReason.OK,
            info: '',
            isManual: false,
            pauseMinute: 0,
            pausedFrom: 0,
            pauseUntil: 0,
        },
        crawlerState: CrawlerState.OK,
        forceResume: false,
        forceStop: false,
        //---------------------
        crawlId: '',
        isCrawling: false,
        isCrawlCycle: false,
        isManualStart: false,
        crawledSources: [],
        crawlingSource: null,
        totalPausedDuration: 0,
        startTime: new Date(0),
        endTime: 0,
        duration: 0,
        error: false,
        errorMessage: '',
        crawlMode: 0,
        pageNumber: 0,
        pageCount: 0,
        sourcePage: {
            url: '',
            state: '',
            stateTime: 0,
        },
        pageLinks: [],
        constValues: {
            concurrencyNumber: 0,
            pauseDuration: config.CRAWLER_PAUSE_DURATION_LIMIT,
        },
        limits: {
            memory: {
                value: 0,
                limit: crawlerMemoryLimit.toFixed(0),
                total: config.CRAWLER_TOTAL_MEMORY,
            },
            cpu: {
                value: [0, 0, 0],
                limit: config.CRAWLER_CPU_LIMIT.toFixed(0),
            },
            imageOperations: { value: 0, limit: 0 },
            trailerUpload: { value: 0, limit: 0 },
        },
        domainChangeHandler: {
            isActive: false,
            startTime: new Date(0),
            endTime: 0,
            duration: 0,
            state: '',
            stateTime: 0,
            error: false,
            errorMessage: '',
            sources: [],
        },
        remoteBrowsers: [],
        axiosBlackList: {
            default: [],
            remoteBrowsers: [],
        },
        extraConfigs: {
            returnTitlesOnly: false,
            equalTitlesOnly: false,
            returnAfterExtraction: false,
            retryCounter: 0,
            castUpdateState: ExtraConfigsSwitchState.NONE,
            dontUseRemoteBrowser: false,
            crawlerConcurrency: 0,
            axiosBlockThreshHold: 0,
        },
    };
}

const crawlerLog = (): CrawlerLog => ({
    crawlId: crawlerStatus.crawlId,
    startTime: crawlerStatus.startTime,
    endTime: crawlerStatus.endTime,
    duration: crawlerStatus.duration,
    crawlMode: crawlerStatus.crawlMode,
    isCrawlCycle: crawlerStatus.isCrawlCycle,
    isManualStart: crawlerStatus.isManualStart,
    crawledSources: crawlerStatus.crawledSources,
    totalPausedDuration: crawlerStatus.totalPausedDuration,
    error: crawlerStatus.error,
    errorMessage: crawlerStatus.errorMessage,
    forceStop: crawlerStatus.forceStop,
    domainChangeHandler: {
        startTime: crawlerStatus.domainChangeHandler.startTime,
        endTime: crawlerStatus.domainChangeHandler.endTime,
        duration: crawlerStatus.domainChangeHandler.duration,
        state: crawlerStatus.domainChangeHandler.state,
        error: crawlerStatus.domainChangeHandler.error,
        errorMessage: crawlerStatus.domainChangeHandler.errorMessage,
    },
});

setInterval(async () => {
    crawlerStatus.limits.cpu.value = [averageCpu];

    getMemoryStatus(false).then((res) => {
        crawlerStatus.limits.memory.value = res.used.toFixed(0);
    });

    const configsDb = ConfigsDB.getServerConfigsDb();
    if (configsDb) {
        crawlerStatus.disabledData.isDbDisabled = configsDb.disableCrawler;
        crawlerStatus.disabledData.isDbDisabled_temporary = configsDb.crawlerDisabled;
        crawlerStatus.disabledData.dbDisableDuration = configsDb.disableCrawlerForDuration;
        crawlerStatus.disabledData.dbDisableStart = configsDb.disableCrawlerStart;
    }

    crawlerStatus.remoteBrowsers = remoteBrowsers.map((item: any) => {
        const temp = { ...item };
        delete temp.password;
        return temp;
    });

    // TODO : check
    // await import('../searchTools.ts'); //wait for axiosBlackListSources initialization

    crawlerStatus.axiosBlackList.default = axiosBlackListSources;
    crawlerStatus.axiosBlackList.remoteBrowsers = blackListSources;
}, 1000);

export function getCrawlerStatusObj(): CrawlerStatus {
    return structuredClone(crawlerStatus);
}

//-----------------------------------------
//-----------------------------------------

class Mutex {
    private mutex = Promise.resolve();

    lock(): PromiseLike<() => void> {
        let begin: (unlock: () => void) => void = () => {};
        this.mutex = this.mutex.then(() => new Promise(begin));
        return new Promise((res) => {
            begin = res;
        });
    }
}

const addPageLinkMutex = new Mutex();
const mainPageStatusMutex = new Mutex();

//-----------------------------------------
//-----------------------------------------

export function setCrawlerPause(
    reason: CrawlerPauseReason,
    isManualPause: boolean = false,
    manualPauseMinute: number = 0,
    info: string = '',
): string {
    if (crawlerStatus.pauseData.isPaused) {
        crawlerStatus.pauseData.reason = reason;
        return 'CRAWLER_ALREADY_PAUSED';
    }

    if (isManualPause) {
        crawlerStatus.crawlerState = CrawlerState.WAITING_FOR_MANUAL_PAUSE_APPLY;
        crawlerStatus.pauseData.isManual = true;
        crawlerStatus.pauseData.pauseMinute = manualPauseMinute;
    } else {
        if (crawlerStatus.pauseData.isManual) {
            crawlerStatus.crawlerState = CrawlerState.MANUAL_PAUSED;
        } else {
            crawlerStatus.crawlerState = CrawlerState.PAUSED;
        }

        crawlerStatus.pauseData.isPaused = true;
        crawlerStatus.pauseData.reason = reason;
    }

    crawlerStatus.pauseData.pausedFrom = Date.now();
    if (manualPauseMinute > 0) {
        crawlerStatus.pauseData.pauseUntil = Date.now() + manualPauseMinute * 60 * 1000;
    }
    crawlerStatus.pauseData.info = info;

    return 'ok';
}

export function removeCrawlerPause(handleManual: boolean = false, force: boolean = false): string {
    if (!crawlerStatus.pauseData.isPaused) {
        return 'CRAWLER_IS_NOT_PAUSED';
    }

    if (handleManual && !force && !crawlerStatus.pauseData.isManual) {
        return 'CRAWLER_IS_NOT_MANUALLY_PAUSED_USE_FORCE_TRUE';
    }

    if (force) {
        crawlerStatus.forceResume = true;
    }

    crawlerStatus.pauseData.isPaused = false;
    crawlerStatus.pauseData.isManual = false;
    crawlerStatus.pauseData.reason = CrawlerPauseReason.OK;
    crawlerStatus.pauseData.info = '';

    const pauseDuration = (Date.now() - crawlerStatus.pauseData.pausedFrom) / (60 * 1000);
    crawlerStatus.totalPausedDuration += pauseDuration;
    crawlerStatus.pauseData.pausedFrom = 0;
    crawlerStatus.pauseData.pauseMinute = 0;
    crawlerStatus.pauseData.pauseUntil = 0;
    if (crawlerStatus.crawlingSource) {
        crawlerStatus.crawlingSource.pausedDuration += pauseDuration;
    }
    if (!crawlerStatus.forceStop) {
        crawlerStatus.crawlerState = CrawlerState.OK;
    }

    return 'ok';
}

export function saveStopCrawler(): void {
    crawlerStatus.crawlerState = CrawlerState.WAITING_FOR_MANUAL_STOP_APPLY;
    crawlerStatus.forceStop = true;
}

export function checkForceResume(): boolean {
    return crawlerStatus.forceResume;
}

export function disableForceResume(): void {
    crawlerStatus.forceResume = false;
}

export function checkForceStopCrawler(): boolean {
    return crawlerStatus.forceStop;
}

//-----------------------------------------
//-----------------------------------------

export function updatePageNumberCrawlerStatus(
    pageNumber: number,
    pageCount: number | null,
    concurrencyNumber: number,
    extraConfigs: CrawlerExtraConfigs,
): void {
    crawlerStatus.pageNumber = pageNumber;
    crawlerStatus.pageCount = pageCount;
    crawlerStatus.constValues.concurrencyNumber = concurrencyNumber;
    crawlerStatus.extraConfigs = extraConfigs;
}

export async function addPageLinkToCrawlerStatus(
    pageLink: string,
    pageNumber: number | null,
): Promise<void> {
    if (config.DEBUG_MODE) {
        logger.info(`[PAGE_LINK]: [${pageNumber}]: ${pageLink}`);
    }

    const unlock = await addPageLinkMutex.lock();

    pageLink = getDecodedLink(pageLink);
    if (!crawlerStatus.pageLinks.find((item) => item.url === pageLink)) {
        crawlerStatus.pageLinks.push({
            url: pageLink,
            pageNumber: pageNumber,
            time: new Date(),
            state: linkStateMessages.start,
            stateTime: new Date(),
        });
    }
    unlock();
}

export function changePageLinkStateFromCrawlerStatus(
    pageLink: string,
    state: string,
    appendMode: boolean = false,
): void {
    pageLink = getDecodedLink(pageLink);
    const data = crawlerStatus.pageLinks.find((item) => item.url === pageLink);
    if (data) {
        if (appendMode) {
            data.state = data.state.split(' (')[0] + state;
        } else {
            data.state = state;
            data.stateTime = new Date();
        }
    }
}

export function partialChangePageLinkStateFromCrawlerStatus(
    pageLink: string,
    findValue: string,
    changeValue: string,
): void {
    pageLink = getDecodedLink(pageLink);
    const data = crawlerStatus.pageLinks.find((item) => item.url === pageLink);
    if (data) {
        data.state = data.state.replace(findValue, changeValue);
    }
}

export async function removePageLinkToCrawlerStatus(pageLink: string): Promise<void> {
    const unlock = await addPageLinkMutex.lock();
    pageLink = getDecodedLink(pageLink);
    crawlerStatus.pageLinks = crawlerStatus.pageLinks.filter((item) => item.url !== pageLink);
    unlock();
}

//-----------------------------------------
//-----------------------------------------

export async function changeSourcePageFromCrawlerStatus(
    pageLink: string,
    state: string,
): Promise<void> {
    const unlock = await mainPageStatusMutex.lock();
    pageLink = getDecodedLink(pageLink);
    crawlerStatus.sourcePage.url = pageLink;
    if (pageLink) {
        crawlerStatus.sourcePage.state = state;
        crawlerStatus.sourcePage.stateTime = new Date();
    } else {
        crawlerStatus.sourcePage.state = '';
        crawlerStatus.sourcePage.stateTime = 0;
    }
    unlock();
}

//-----------------------------------------
//-----------------------------------------

export function updateImageOperationsLimit(number: number, limit: number): void {
    crawlerStatus.limits.imageOperations.value = number;
    crawlerStatus.limits.imageOperations.limit = limit;
}

export function updateTrailerUploadLimit(number: number, limit: number): void {
    crawlerStatus.limits.trailerUpload.value = number;
    crawlerStatus.limits.trailerUpload.limit = limit;
}

//-----------------------------------------
//-----------------------------------------

export async function updateCrawlerStatus_crawlerStart(
    startTime: Date,
    isCrawlCycle: boolean,
    isManualStart: boolean,
    crawlMode: number,
): Promise<void> {
    if (config.DEBUG_MODE) {
        logger.info(
            `Crawler: started [isCycle=${isCrawlCycle}] [isManual=${isManualStart}] [mode=${crawlMode}]`,
        );
    }

    crawlerStatus = getDefaultCrawlerStatus();
    crawlerStatus.crawlId = uuidv4();
    crawlerStatus.startTime = startTime;
    crawlerStatus.crawlMode = crawlMode;
    crawlerStatus.isCrawling = true;
    crawlerStatus.isCrawlCycle = isCrawlCycle;
    crawlerStatus.isManualStart = isManualStart;
    await ServerAnalysis.saveCrawlerLog(crawlerLog());
}

export async function updateCrawlerStatus_crawlerEnd(
    endTime: number | Date,
    crawlDuration: number | Date,
): Promise<void> {
    if (config.DEBUG_MODE) {
        logger.info(`Crawler: ended [duration=${crawlDuration}]`);
    }

    crawlerStatus.endTime = endTime;
    crawlerStatus.duration = crawlDuration;
    crawlerStatus.isCrawling = false;
    crawlerStatus.crawlingSource = null;
    crawlerStatus.crawlerState = CrawlerState.OK;
    await ServerAnalysis.saveCrawlerLog(crawlerLog());
    crawlerStatus = getDefaultCrawlerStatus();
}

export async function updateCrawlerStatus_crawlerCrashed(errorMessage: string): Promise<void> {
    if (config.DEBUG_MODE) {
        logger.info(`Crawler: crashed! ${errorMessage}`);
    }

    crawlerStatus.endTime = new Date();
    crawlerStatus.duration = getDatesBetween(new Date(), crawlerStatus.startTime).minutes;
    crawlerStatus.isCrawling = false;
    crawlerStatus.crawlingSource = null;
    crawlerStatus.error = true;
    crawlerStatus.errorMessage = errorMessage;
    crawlerStatus.crawlerState = CrawlerState.ERROR;
    await ServerAnalysis.saveCrawlerLog(crawlerLog());
    crawlerStatus = getDefaultCrawlerStatus();
}

//-----------------------------------------
//-----------------------------------------

export function checkIsCrawling(): boolean {
    return crawlerStatus.isCrawling;
}

export async function updateCrawlerStatus_sourceStart(
    sourceName: string,
    crawlMode: number,
): Promise<void> {
    if (config.DEBUG_MODE) {
        logger.info(`Crawler: source_start [${sourceName}] [mode=${crawlMode}]`);
    }

    crawlerStatus.crawlingSource = {
        name: sourceName,
        startTime: new Date(),
        crawlMode: crawlMode,
        pausedDuration: 0,
    };
    await ServerAnalysis.saveCrawlerLog(crawlerLog());
}

export async function updateCrawlerStatus_sourceEnd(
    lastPages: number[],
    dontSave: boolean = false,
): Promise<void> {
    if (config.DEBUG_MODE) {
        const name = crawlerStatus.crawlingSource?.name;
        const mode = crawlerStatus.crawlMode;
        logger.info(`Crawler: source_ended [${name}] [mode=${mode}, ${lastPages}]`);
    }

    if (crawlerStatus.crawlingSource) {
        crawlerStatus.crawledSources.push({
            ...crawlerStatus.crawlingSource,
            endTime: new Date(),
            duration: getDatesBetween(new Date(), crawlerStatus.crawlingSource.startTime).minutes,
            lastPages: lastPages,
        });
    } else {
        crawlerStatus.crawledSources.push({
            name: '',
            startTime: new Date(),
            crawlMode: 0,
            pausedDuration: 0,
            endTime: new Date(),
            duration: 0,
            lastPages: lastPages,
        });
    }

    if (!dontSave) {
        await ServerAnalysis.saveCrawlerLog(crawlerLog());
    }

    crawlerStatus.crawlingSource = null;
}

//-----------------------------------------
//-----------------------------------------

export async function updateCrawlerStatus_domainChangeHandlerStart(): Promise<void> {
    if (config.DEBUG_MODE) {
        logger.info(`Domain_change_handler: started`);
    }

    crawlerStatus.domainChangeHandler.isActive = true;
    crawlerStatus.domainChangeHandler.startTime = new Date();
    crawlerStatus.domainChangeHandler.state = linkStateMessages.domainChangeHandler.start;
    crawlerStatus.domainChangeHandler.stateTime = new Date();

    await ServerAnalysis.saveCrawlerLog(crawlerLog());
}

export async function updateCrawlerStatus_domainChangeHandlerEnd(): Promise<number> {
    if (config.DEBUG_MODE) {
        logger.info(`Domain_change_handler: ended`);
    }

    const duration = getDatesBetween(
        new Date(),
        crawlerStatus.domainChangeHandler.startTime,
    ).minutes;
    crawlerStatus.domainChangeHandler.isActive = false;
    crawlerStatus.domainChangeHandler.endTime = new Date();
    crawlerStatus.domainChangeHandler.duration = duration;
    crawlerStatus.domainChangeHandler.state = linkStateMessages.domainChangeHandler.end;
    crawlerStatus.domainChangeHandler.stateTime = new Date();

    await ServerAnalysis.saveCrawlerLog(crawlerLog());
    resetDomainChangeHandlerStatusData();
    return duration;
}

export async function updateCrawlerStatus_domainChangeHandlerCrashed(
    errorMessage: string,
): Promise<number> {
    if (config.DEBUG_MODE) {
        // const sourceName = crawlerStatus.domainChangeHandler.
        logger.warn(`Domain_change_handler: crashed! []`);
    }

    const duration = getDatesBetween(
        new Date(),
        crawlerStatus.domainChangeHandler.startTime,
    ).minutes;
    crawlerStatus.domainChangeHandler.isActive = false;
    crawlerStatus.domainChangeHandler.endTime = new Date();
    crawlerStatus.domainChangeHandler.duration = duration;
    crawlerStatus.domainChangeHandler.error = true;
    crawlerStatus.domainChangeHandler.errorMessage = errorMessage;

    await ServerAnalysis.saveCrawlerLog(crawlerLog());
    resetDomainChangeHandlerStatusData();
    return duration;
}

function resetDomainChangeHandlerStatusData(): void {
    crawlerStatus.domainChangeHandler.isActive = false;
    crawlerStatus.domainChangeHandler.startTime = new Date(0);
    crawlerStatus.domainChangeHandler.endTime = 0;
    crawlerStatus.domainChangeHandler.duration = 0;
    crawlerStatus.domainChangeHandler.state = '';
    crawlerStatus.domainChangeHandler.stateTime = 0;
    crawlerStatus.domainChangeHandler.error = false;
    crawlerStatus.domainChangeHandler.errorMessage = '';
    crawlerStatus.domainChangeHandler.sources = [];
}

export function changeDomainChangeHandlerState(
    sources: CrawlerStatusSource[],
    state: string,
): void {
    // if (config.DEBUG_MODE) {
    //     logger.info('Domain_change_handler: ', sources, state);
    // }

    crawlerStatus.domainChangeHandler.sources = sources;
    crawlerStatus.domainChangeHandler.state = state;
    crawlerStatus.domainChangeHandler.stateTime = new Date();
}
