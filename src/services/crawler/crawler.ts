import { SourcesRepo } from '@/repo';
import {
    resolveCrawlerWarning,
    saveCrawlerWarning,
    saveServerLog,
} from '@/repo/serverAnalysis';
import * as generic from '@/sources/generic';
import { checkAndHandleSourceChange } from '@/status/detector';
import {
    checkIsCrawling,
    updateCrawlerStatus_crawlerCrashed, updateCrawlerStatus_crawlerEnd,
    updateCrawlerStatus_crawlerStart,
    updateCrawlerStatus_sourceEnd,
    updateCrawlerStatus_sourceStart,
} from '@/status/status';
import { CrawlerErrors } from '@/status/warnings';
import {
    CrawlerExtraConfigs,
    defaultCrawlerExtraConfigs,
    ExtraConfigsSwitchState,
} from '@/types';
import { domainChangeHandler } from '@services/crawler/domainChange';
import {
    getSourcesArray,
    getSourcesMethods,
} from '@services/crawler/sourcesArray';
import { getDatesBetween, getDayOfYear } from '@utils/crawler';
import { saveError } from '@utils/logger';

export async function crawlerCycle(): Promise<string> {
    try {
        while (checkIsCrawling()) {
            //avoid parallel crawling
            await new Promise(resolve => setTimeout(resolve, 60 * 1000));
        }
        const sourcesObj = await SourcesRepo.getSourcesObjDB();
        if (!sourcesObj) {
            saveCrawlerWarning(CrawlerErrors.crawler.cycleCancelled);
            return CrawlerErrors.crawler.cycleCancelled;
        }

        delete sourcesObj._id;
        delete sourcesObj.title;
        const sourcesNames = Object.keys(sourcesObj);

        const temp = getSourcesArray(sourcesObj, 2, defaultCrawlerExtraConfigs);
        const sourcesArray: any[] = [];

        for (let i = 0; i < sourcesNames.length; i++) {
            if (sourcesObj[sourcesNames[i]].config.isTorrent) {
                // ignore torrent sources
                continue
            }

            if (sourcesObj[sourcesNames[i]].config.isGeneric) {
                sourcesArray.push({
                    name: sourcesNames[i],
                    ...sourcesObj[sourcesNames[i]],
                    starter: () => {
                        return generic.default(sourcesObj[sourcesNames[i]], null, defaultCrawlerExtraConfigs);
                    }
                })
            } else {
                let findSource = temp.find(s => s.name === sourcesNames[i]);
                if (findSource) {
                    findSource = {
                        // @ts-expect-error ...
                        name: sourcesNames[i],
                        ...findSource,
                        ...sourcesObj[sourcesNames[i]],
                    }
                    sourcesArray.push(findSource);
                }
            }
        }

        //handle sources with crawlCycle
        const now = new Date();
        const sourcesWithCycle = sourcesArray.filter(item => item.crawlCycle > 0 && !item.cookies.find((c: any) => c.expire && (Date.now() > (c.expire - 60 * 60 * 1000))))
            .sort((a: any, b: any): number => {
                const lastCrawlDate_a = a.lastCrawlDate || now;
                const lastCrawlDate_b = b.lastCrawlDate || now;
                const remained_a = getDatesBetween(now, lastCrawlDate_a).days;
                const remained_b = getDatesBetween(now, lastCrawlDate_b).days;
                // return remained_a > remained_b;
                return remained_a - remained_b;
            });

        if (sourcesWithCycle.length > 0) {
            const lastCrawlDate = sourcesWithCycle[0].lastCrawlDate;
            if (!lastCrawlDate || getDatesBetween(now, lastCrawlDate).days >= sourcesWithCycle[0].crawlCycle) {
                await crawler(sourcesWithCycle[0].name, {crawlMode: 2, isCrawlCycle: true}, defaultCrawlerExtraConfigs);
                return await crawlerCycle();
            }
        }

        //handle sources with first time crawling
        const firstTimeCrawlingSources = sourcesArray.filter(item => !item.lastCrawlDate && !item.cookies.find((c: any) => c.expire && (Date.now() > (c.expire - 60 * 60 * 1000))));
        if (firstTimeCrawlingSources.length > 0) {
            await crawler(firstTimeCrawlingSources[0].name, {crawlMode: 2, isCrawlCycle: true}, defaultCrawlerExtraConfigs);
            return await crawlerCycle();
        }

        //pick a source and crawl
        const index = getDayOfYear(now) % sourcesArray.length;
        if (getDatesBetween(now, sourcesArray[index].lastCrawlDate).days >= 5) {
            const sourceCookies = sourcesObj[sourcesArray[index].name].cookies;
            if (!sourceCookies.find((item: any) => item.expire && (Date.now() > (item.expire - 60 * 60 * 1000)))) {
                await crawler(sourcesArray[index].name, {crawlMode: 2, isCrawlCycle: true}, defaultCrawlerExtraConfigs);
            }
        }
        return 'ok';
    } catch (error: any) {
        saveError(error);
        return 'error';
    }
}

export async function crawler(
    sourceName: string,
    {
    crawlMode = 0,
    isCrawlCycle = false,
    isManualStart = false,
    handleDomainChangeOnly = false,
    handleDomainChange = true,
},
                              extraConfigs: CrawlerExtraConfigs): Promise<any> {

    try {
        if (checkIsCrawling()) {
            return {
                isError: true,
                message: 'another crawling is running',
            };
        }
        const startTime = new Date();
        await updateCrawlerStatus_crawlerStart(startTime, isCrawlCycle, isManualStart, crawlMode);

        const sourcesObj = await SourcesRepo.getSourcesObjDB();
        if (!sourcesObj) {
            await updateCrawlerStatus_crawlerCrashed(CrawlerErrors.crawler.cancelled);
            saveCrawlerWarning(CrawlerErrors.crawler.cancelled);
            return {
                isError: true,
                message: CrawlerErrors.crawler.cancelled,
            };
        }

        let sourcesNames = Object.keys(sourcesObj);
        sourcesNames = sourcesNames.filter(item => !!sourcesObj[item].config);
        let sourcesArray = getSourcesArray(sourcesObj, crawlMode, extraConfigs);
        sourcesArray = sourcesArray.filter(item => sourcesNames.includes(item.name));
        const fullyCrawledSources = [];

        if (!handleDomainChangeOnly) {
            for (let i = 0; i < sourcesNames.length; i++) {
                if (
                    (extraConfigs.torrentState === ExtraConfigsSwitchState.IGNORE && sourcesObj[sourcesNames[i]].config.isTorrent) ||
                    (extraConfigs.torrentState === ExtraConfigsSwitchState.ONLY && !sourcesObj[sourcesNames[i]].config.isTorrent) ||
                    (sourceName && sourcesNames[i] !== sourceName) // in single source mode
                ) {
                    continue;
                }

                const sourceCookies = sourcesObj[sourcesNames[i]].cookies;
                const disabled = sourcesObj[sourcesNames[i]].disabled;
                const isManualDisable = sourcesObj[sourcesNames[i]].isManualDisable;
                if (sourceCookies.find((item: any) => item.expire && (Date.now() > (item.expire - 60 * 60 * 1000)))) {
                    saveCrawlerWarning(CrawlerErrors.source.expireCookieSkip(sourcesNames[i]));
                    continue;
                }
                if (disabled) {
                    if (!isManualDisable) {
                        saveCrawlerWarning(CrawlerErrors.source.disabledSkip(sourcesNames[i]));
                    }
                    continue;
                }
                resolveCrawlerWarning(CrawlerErrors.source.expireCookieSkip(sourcesNames[i]));
                resolveCrawlerWarning(CrawlerErrors.source.disabledSkip(sourcesNames[i]));
                await updateCrawlerStatus_sourceStart(sourcesNames[i], crawlMode);

                let sourceStarter: any = sourcesArray.find(s => s.name === sourcesNames[i]);
                if (!sourceStarter && sourcesObj[sourcesNames[i]].config.isGeneric) {
                    const pageCount = crawlMode === 0 ? 1 : crawlMode === 1 ? 20 : null;
                    sourceStarter = {
                        starter: () => {
                            return generic.default(sourcesObj[sourcesNames[i]], pageCount, extraConfigs);
                        }
                    }
                }

                const lastPages = await sourceStarter.starter();

                await updateCrawlerStatus_sourceEnd(lastPages);
                await checkAndHandleSourceChange();
                if (crawlMode === 2) {
                    fullyCrawledSources.push(sourcesNames[i]);
                    const now = new Date();
                    sourcesObj[sourcesNames[i]].lastCrawlDate = now;
                    await SourcesRepo.updateSourcesObjDB({
                        [sourcesNames[i] + '.lastCrawlDate']: now,
                    });
                }
            }
        }

        let domainChangeDuration = 0;
        if (handleDomainChangeOnly || handleDomainChange) {
            domainChangeDuration = await domainChangeHandler(sourcesObj, fullyCrawledSources, extraConfigs);
        }

        const endTime = new Date();
        const crawlDuration = getDatesBetween(endTime, startTime).minutes;
        await updateCrawlerStatus_crawlerEnd(endTime, crawlDuration);
        const message = `crawling done in : ${crawlDuration}min, (domainChangeHandler: ${domainChangeDuration}min)`;
        await saveServerLog(message);
        return {
            isError: false,
            message: message,
        };
    } catch (error: any) {
        await updateCrawlerStatus_crawlerCrashed(error.message || '');
        await saveError(error);
        return {
            isError: true,
            message: error.message || "Internal server error",
        };
    }
}

export async function torrentCrawlerSearch(
    {
       sourceName = "",
       title = "",
       // type = "",
       isManualStart = false,
   },
     extraConfigs: CrawlerExtraConfigs) {

    try {
        if (checkIsCrawling()) {
            return {
                isError: true,
                message: 'another crawling is running',
            };
        }
        const startTime = new Date();
        await updateCrawlerStatus_crawlerStart(startTime, false, isManualStart, 0);

        const sourcesObj = await SourcesRepo.getSourcesObjDB();
        if (!sourcesObj) {
            await updateCrawlerStatus_crawlerCrashed(CrawlerErrors.crawler.cancelled);
            saveCrawlerWarning(CrawlerErrors.crawler.cancelled);
            return {
                isError: true,
                message: CrawlerErrors.crawler.cancelled,
            };
        }

        const sourcesNames = Object.keys(sourcesObj);
        let sourcesArray = getSourcesArray(sourcesObj, 0, extraConfigs);
        sourcesArray = sourcesArray.filter(item => sourcesNames.includes(item.name) && sourcesObj[item.name].config.isTorrent);
        const sourcesMethods = getSourcesMethods();

        if (!sourceName) {
            for (let i = 0; i < sourcesArray.length; i++) {
                const sourceCookies = sourcesObj[sourcesArray[i].name].cookies;
                const disabled = sourcesObj[sourcesArray[i].name].disabled;
                const isManualDisable = sourcesObj[sourcesArray[i].name].isManualDisable;
                if (sourceCookies.find((item: any) => item.expire && (Date.now() > (item.expire - 60 * 60 * 1000)))) {
                    saveCrawlerWarning(CrawlerErrors.source.expireCookieSkip(sourcesArray[i].name));
                    continue;
                }
                if (disabled) {
                    if (!isManualDisable) {
                        saveCrawlerWarning(CrawlerErrors.source.disabledSkip(sourcesArray[i].name));
                    }
                    continue;
                }
                await updateCrawlerStatus_sourceStart(sourcesArray[i].name, 0);
                const movieUrl = sourcesObj[sourcesArray[i].name].movie_url;
                // @ts-expect-error ...
                const lastPages = await sourcesMethods[sourcesArray[i].name].searchByTitle(movieUrl, title, extraConfigs);
                await updateCrawlerStatus_sourceEnd(lastPages, true);
            }
        } else {
            const findSource = sourcesArray.find(x => x.name === sourceName);
            if (findSource) {
                const sourceCookies = sourcesObj[sourceName].cookies;
                const disabled = sourcesObj[sourceName].disabled;
                const isManualDisable = sourcesObj[sourceName].isManualDisable;
                if (sourceCookies.find((item: any) => item.expire && (Date.now() > (item.expire - 60 * 60 * 1000)))) {
                    saveCrawlerWarning(CrawlerErrors.source.expireCookieSkip(sourceName));
                } else if (disabled) {
                    if (!isManualDisable) {
                        saveCrawlerWarning(CrawlerErrors.source.disabledSkip(sourceName));
                    }
                } else {
                    await updateCrawlerStatus_sourceStart(sourceName, 0);
                    const movieUrl = sourcesObj[sourceName].movie_url;
                    // @ts-expect-error ...
                    const lastPages = await sourcesMethods[sourceName].searchByTitle(movieUrl, title, extraConfigs);
                    await updateCrawlerStatus_sourceEnd(lastPages, true);
                }
            }
        }

        const endTime = new Date();
        const crawlDuration = getDatesBetween(endTime, startTime).minutes;
        await updateCrawlerStatus_crawlerEnd(endTime, crawlDuration);
        const message = `crawling done in : ${crawlDuration}min`;
        saveServerLog(message);
        return {
            isError: false,
            message: message,
        };
    } catch (error: any) {
        await updateCrawlerStatus_crawlerCrashed(error.message || '');
        await saveError(error);
        return {
            isError: true,
            message: error.message || "Internal server error",
        };
    }
}
