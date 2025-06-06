import {
    resolveCrawlerWarning,
    saveCrawlerWarning,
    saveServerLog, updateSourcesObjDB,
} from '@/repo/serverAnalysis';
import * as generic from '@/sources/generic';
import {
    changeDomainChangeHandlerState,
    checkForceStopCrawler, updateCrawlerStatus_domainChangeHandlerCrashed,
    updateCrawlerStatus_domainChangeHandlerEnd,
    updateCrawlerStatus_domainChangeHandlerStart,
} from '@/status/status';
import { CrawlerErrorMessages, linkStateMessages } from '@/status/warnings';
import {
    CrawlerExtraConfigs,
    CrawlerStatusSource,
    defaultCrawlerExtraConfigs,
    ExtraConfigsSwitchState,
} from '@/types';
import {
    getSourcesArray,
    torrentSourcesNames,
} from '@services/crawler/sourcesArray';
import { getResponseUrl } from '@utils/axios';
import { getDatesBetween } from '@utils/crawler';
import { saveError, saveErrorIfNeeded } from '@utils/logger';

export async function domainChangeHandler(
    sourcesObj: any,
    fullyCrawledSources: string[],
    extraConfigs: CrawlerExtraConfigs,
    ): Promise<any> {
    try {
        await updateCrawlerStatus_domainChangeHandlerStart();
        delete sourcesObj._id;
        delete sourcesObj.title;
        let sourcesUrls = Object.keys(sourcesObj)
            .filter(sourceName => !sourcesObj[sourceName].isManualDisable)
            .map(sourceName => ({
                sourceName: sourceName,
                url: sourcesObj[sourceName].movie_url ||
                    sourcesObj[sourceName].serial ||
                    sourcesObj[sourceName].anime_url,
                config: sourcesObj[sourceName].config,
                checked: false,
                changed: false,
                crawled: false,
                errorMessage: '',
            }));

        if (extraConfigs.torrentState === ExtraConfigsSwitchState.ONLY) {
            sourcesUrls = sourcesUrls.filter(s => torrentSourcesNames.includes(s.sourceName));
        }

        changeDomainChangeHandlerState(sourcesUrls, linkStateMessages.domainChangeHandler.checkingUrls);
        // const changedSources = await checkSourcesUrl(sourcesUrls, extraConfigs);
        const changedSources = await checkSourcesUrl(sourcesUrls);

        if (changedSources.length > 0) {
            saveServerLog('start domain change handler');
            updateSourceFields(sourcesObj, sourcesUrls);
            await updateDownloadLinks(sourcesObj, changedSources, fullyCrawledSources);
            saveServerLog('source domain changed');
        }
        return await updateCrawlerStatus_domainChangeHandlerEnd();
    } catch (error: any) {
        await saveError(error);
        return await updateCrawlerStatus_domainChangeHandlerCrashed(error.message || '');
    }
}

async function checkSourcesUrl(
    sourcesUrls: any[],
    // extraConfigs: CrawlerExtraConfigs,
    ): Promise<CrawlerStatusSource[]> {

    const changedSources: CrawlerStatusSource[] = [];
    try {
        let retryCounter = 0;
        for (let i = 0; i < sourcesUrls.length; i++) {
            let responseUrl;
            const homePageLink = sourcesUrls[i].url.replace(/\/page\/|\/(movie-)*anime\?page=/g, '');
            changeDomainChangeHandlerState(sourcesUrls, linkStateMessages.domainChangeHandler.checkingUrls + ` || ${sourcesUrls[i].sourceName} || ${homePageLink}`);
            try {
                if (checkForceStopCrawler()) {
                    return [];
                }

                // const allConfigs = {...(sourcesUrls[i].config || {}), ...(extraConfigs || {})};
                // const pageData = await getPageData(homePageLink, sourcesUrls[i].sourceName, allConfigs);
                // if (pageData && pageData.pageContent) {
                //     responseUrl = pageData.responseUrl;
                // } else {
                //     changeDomainChangeHandlerState(sourcesUrls, linkStateMessages.domainChangeHandler.retryAxios + ` || ${sourcesUrls[i].sourceName} || ${homePageLink}`);
                //     responseUrl = await getResponseUrl(homePageLink);
                // }

                changeDomainChangeHandlerState(sourcesUrls, linkStateMessages.domainChangeHandler.retryAxios + ` || ${sourcesUrls[i].sourceName} || ${homePageLink}`);
                responseUrl = await getResponseUrl(homePageLink);

                sourcesUrls[i].checked = true;
                retryCounter = 0;
                if (!responseUrl) {
                    continue;
                }
            } catch (error: any) {
                if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
                    const temp = homePageLink.replace(/\/$/, '').split('/').pop();
                    const url = homePageLink.replace(temp, encodeURIComponent(temp));
                    try {
                        responseUrl = await getResponseUrl(url);
                        sourcesUrls[i].checked = true;
                    } catch (error2: any) {
                        error2.isAxiosError = true;
                        error2.url = homePageLink;
                        error2.url2 = url;
                        error2.filePath = 'domainChangeHandler';
                        await saveErrorIfNeeded(error2);
                        sourcesUrls[i].checked = true;
                        sourcesUrls[i].errorMessage = error2.message || '';
                        continue;
                    }
                } else if ([502, 504, 525].includes(error.response?.status) && retryCounter < 2) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    retryCounter++;
                    i--;
                    continue;
                } else {
                    if (error.code !== 'ETIMEDOUT' && error.code !== 'EAI_AGAIN' &&
                        ![521, 522, 524].includes(error.response?.status)) {
                        await saveErrorIfNeeded(error);
                    }
                    sourcesUrls[i].checked = true;
                    sourcesUrls[i].errorMessage = error.message || '';
                    continue;
                }
            }

            const newUrl = getNewURl(sourcesUrls[i].url, responseUrl);

            if (sourcesUrls[i].url !== newUrl) {//changed
                sourcesUrls[i].url = newUrl;
                sourcesUrls[i].changed = true;
                changedSources.push(sourcesUrls[i]);
            }
        }
        return changedSources;
    } catch (error) {
        await saveErrorIfNeeded(error);
        return [];
    }
}

export async function checkUrlWork(
    sourceName: string,
    sourceUrl: string,
    allConfigs: any = null,
    retryCounter: number = 0,
): Promise<string | null> {
    try {
        let responseUrl;
        const homePageLink = sourceUrl.replace(/(\/page\/)|(\/(movie-)*anime\?page=)|(\/$)/g, '');
        try {
            // let pageData = await getPageData(homePageLink, sourceName, allConfigs);
            // if (pageData && pageData.pageContent) {
            //     responseUrl = pageData.responseUrl;
            // } else {
            //     responseUrl = await getResponseUrl(homePageLink);
            // }
            responseUrl = await getResponseUrl(homePageLink);
        } catch (error: any) {
            if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
                const temp = homePageLink.replace(/\/$/, '').split('/').pop() ?? '';
                // const url = homePageLink.replace(temp, encodeURIComponent(temp));
                const url = sourceUrl.replace(temp, encodeURIComponent(temp));
                try {
                    // responseUrl = await getResponseUrl(url);
                    return await checkUrlWork(sourceName, url, allConfigs, retryCounter);
                } catch (error2: any) {
                    error2.isAxiosError = true;
                    error2.url = homePageLink;
                    error2.url2 = url;
                    error2.filePath = 'domainChangeHandler';
                    await saveErrorIfNeeded(error2);
                }
            } else if (
                (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'EAI_AGAIN' ||
                    [502, 521, 522, 525].includes(error.response?.status)) && retryCounter < 3) {
                retryCounter++;
                await new Promise((resolve => setTimeout(resolve, 4000)));
                return await checkUrlWork(sourceName, sourceUrl, allConfigs, retryCounter);
            } else {
                // if (torrentSourcesNames.includes(sourceName) && (error.response?.status === 521 || error.response?.status === 522) ) {
                //     // torrent source not responding on this moment, dont save error
                // } else {
                //     await saveErrorIfNeeded(error);
                // }
                await saveErrorIfNeeded(error);
            }
            return "error";
        }
        responseUrl = responseUrl.replace(/(\/page\/)|(\/(movie-)*anime\?page=)|(\/$)/g, '');
        return homePageLink === responseUrl ? "ok" : responseUrl;
    } catch (error) {
        await saveErrorIfNeeded(error);
        return "error";
    }
}

function updateSourceFields(sourcesObject: any, sourcesUrls: any[]): void {
    const sourcesNames = Object.keys(sourcesObject);
    for (let i = 0; i < sourcesNames.length; i++) {
        const thisSource = sourcesObject[sourcesNames[i]];
        const currentUrl = sourcesUrls.find(x => x.sourceName === sourcesNames[i]).url;
        if (currentUrl) {
            thisSource.movie_url = currentUrl;
            if (thisSource.serial_url) {
                thisSource.serial_url = getNewURl(thisSource.serial_url, currentUrl);
            }
        }
    }
}

async function updateDownloadLinks(
    sourcesObj: any,
    changedSources: CrawlerStatusSource[],
    fullyCrawledSources: string[],
    ): Promise<void> {

    const sourcesArray = getSourcesArray(sourcesObj, 2, defaultCrawlerExtraConfigs);
    for (let i = 0; i < changedSources.length; i++) {
        try {
            const startTime = new Date();
            const sourceName = changedSources[i].sourceName;
            saveServerLog(`domain change handler: (${sourceName} reCrawl start)`);
            changeDomainChangeHandlerState(changedSources, linkStateMessages.domainChangeHandler.crawlingSources + ` || ${sourceName}`);
            let findSource: any = sourcesArray.find(item => item.name === sourceName);

            if (!findSource && sourcesObj[sourceName].config.isGeneric) {
                findSource = {
                    starter: () => {
                        return generic.default(sourcesObj[sourceName], null, defaultCrawlerExtraConfigs);
                    }
                }
            }

            if (findSource) {
                const sourceCookies = sourcesObj[sourceName].cookies;
                const disabled = sourcesObj[sourceName].disabled;
                const isManualDisable = sourcesObj[sourceName].isManualDisable;
                if (sourceCookies.find((item: any) => item.expire && (Date.now() > (item.expire - 60 * 60 * 1000)))) {
                    saveCrawlerWarning(CrawlerErrorMessages.expireCookieSkip_domainChange(sourceName));
                } else if (disabled) {
                    if (!isManualDisable) {
                        saveCrawlerWarning(CrawlerErrorMessages.disabledSourceSkip_domainChange(sourceName));
                    }
                } else {
                    resolveCrawlerWarning(CrawlerErrorMessages.expireCookieSkip_domainChange(sourceName));
                    resolveCrawlerWarning(CrawlerErrorMessages.disabledSourceSkip_domainChange(sourceName));
                    let crawled = false;
                    if (!fullyCrawledSources.includes(sourceName)) {
                        await findSource.starter();
                        crawled = true;
                    }
                    //update source data
                    const updateSourceField: any = {};
                    if (crawled) {
                        sourcesObj[sourceName].lastCrawlDate = new Date();
                    }
                    sourcesObj[sourceName].lastDomainChangeDate = new Date();
                    updateSourceField[sourceName] = sourcesObj[sourceName];
                    await updateSourcesObjDB(updateSourceField);
                }
            }
            changedSources[i].crawled = true;

            saveServerLog(`domain change handler: (${sourceName} reCrawl ended in ${getDatesBetween(new Date(), startTime).minutes} min)`);
        } catch (error) {
            saveError(error);
        }
    }
}

function getNewURl(url: string, currentUrl: string): string {
    const domain = url
        .replace(/www\.|https:\/\/|http:\/\/|\/page\/|\/(movie-)*anime\?page=/g, '')
        .split('/')[0];
    const currentDomain = currentUrl
        .replace(/www\.|https:\/\/|http:\/\/|\/page\/|\/(movie-)*anime\?page=/g, '')
        .split('/')[0];
    return url.replace(domain, currentDomain);
}
