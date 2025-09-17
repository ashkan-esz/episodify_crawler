import config from '@/config';
import { getFromGoogleCache } from '@services/external/googleCache';
import { ServerAnalysisRepo } from '@/repo';
import { hasSidebarClass } from '@/sources/generic';
import { checkServerIsIdle, pauseCrawler } from '@/status/controller';
import {
    addPageLinkToCrawlerStatus,
    changePageLinkStateFromCrawlerStatus,
    changeSourcePageFromCrawlerStatus,
    checkForceStopCrawler,
    removePageLinkToCrawlerStatus, updatePageNumberCrawlerStatus,
} from '@/status/status';
import { CrawlerErrors, linkStateMessages } from '@/status/warnings';
import {
    type CrawlerExtraConfigs,
    CrawlerLinkType,
    type DownloadLink,
    type MovieType,
    PageType,
    type SourceConfig,
    type SourceConfigC,
} from '@/types';
import {
    FetchUtils,
    LinkUtils,
    LinkInfo as LinkInfoUtils,
    Crawler as CrawlerUtils,
} from '@/utils';
import { saveError, saveErrorIfNeeded } from '@utils/logger';
import * as cheerio from 'cheerio';
import PQueue from 'p-queue';

const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const styleRegex = /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;

type FetchBlackListSource = {
    errorCounter: number;
    lastErrorTime: number;
    isBlocked: boolean;
    url: string;
    totalErrorCounter: number;
    sourceName: string;
};

export const fetchBlackListSources: FetchBlackListSource[] = [];

//---------------------------------------------
//---------------------------------------------

export async function wrapper_module(
    sourceConfig: SourceConfig,
    url: string,
    pageCount: number | null,
    searchCB: any,
    extraConfigs: CrawlerExtraConfigs,
): Promise<{ lastPage: number; linksCount: number }> {
    let lastPageNumber = 0;
    let linksCount = 0;
    const linksCountInPages: { page: number; linksCount: number }[] = [];
    try {
        if (!url || pageCount === 0) {
            return { lastPage: lastPageNumber, linksCount: linksCount };
        }
        const concurrencyNumber = await getConcurrencyNumber(
            sourceConfig.config.sourceName,
            sourceConfig.config.needHeadlessBrowser,
            extraConfigs,
        );
        const promiseQueue = new PQueue({ concurrency: concurrencyNumber });
        for (let i = 1; pageCount === null || i <= pageCount; i++) {
            const pageLink = url + `${i}`;

            linksCountInPages.push({
                page: i,
                linksCount: 0,
            });

            if (checkForceStopCrawler()) {
                break;
            }
            await pauseCrawler();
            try {
                changeSourcePageFromCrawlerStatus(pageLink, linkStateMessages.sourcePage.start);
                const getLinksRes = await getLinks(
                    pageLink,
                    sourceConfig.config,
                    PageType.MainPage,
                    extraConfigs,
                );
                if (!getLinksRes) {
                    continue;
                }
                const {
                    $,
                    links,
                    checkGoogleCache,
                    responseUrl,
                    pageTitle,
                } = getLinksRes;
                changeSourcePageFromCrawlerStatus(
                    pageLink,
                    linkStateMessages.sourcePage.fetchingEnd,
                );
                updatePageNumberCrawlerStatus(i, pageCount, concurrencyNumber, extraConfigs);
                lastPageNumber = i;
                if (
                    checkLastPage(
                        $,
                        links,
                        checkGoogleCache,
                        responseUrl,
                        pageTitle,
                        i,
                        linksCountInPages,
                    )
                ) {
                    if (i !== 2 || pageCount !== 1) {
                        ServerAnalysisRepo.saveServerLog(
                            `end of crawling (${sourceConfig.config.sourceName}), last page: ${pageLink}::${pageCount}`,
                        );
                    }
                    if (i === 1 || (pageCount && i < pageCount)) {
                        ServerAnalysisRepo.saveCrawlerWarning(CrawlerErrors.source.lastPage(
                            sourceConfig.config.sourceName,
                            i,
                        ));
                    }
                    break;
                }
                for (let j = 0, _length = links.length; j < _length; j++) {
                    if (checkForceStopCrawler()) {
                        break;
                    }
                    await pauseCrawler();
                    await promiseQueue.onSizeLessThan(concurrencyNumber * 6);
                    const page = i;
                    promiseQueue.add(() =>
                        searchCB($(links[j]), i, $, url, sourceConfig, extraConfigs).then(
                            (count: number) => {
                                linksCount += count || 0;
                                const temp = linksCountInPages.find((item) => item.page === page);
                                if (temp) {
                                    temp.linksCount += count || 0;
                                }
                            },
                        ),
                    );
                }
            } catch (error) {
                saveError(error);
            }
        }
        changeSourcePageFromCrawlerStatus('', '');
        await promiseQueue.onEmpty();
        await promiseQueue.onIdle();
        return { lastPage: lastPageNumber, linksCount: linksCount };
    } catch (error) {
        saveError(error);
        return { lastPage: lastPageNumber, linksCount: linksCount };
    }
}

export async function search_in_title_page(
    sourceConfig: SourceConfig,
    extraConfigs: CrawlerExtraConfigs,
    title: string,
    type: MovieType,
    page_link: string,
    pageNumber: number | null,
    getFileData: any,
    getQualitySample: any = null,
    extraChecker: any = null,
    getSeasonEpisodeFromInfo: any = false,
    extraSearchMatch: any = null,
    extraSearch_getFileData: any = null,
    sourceLinkData: any = null,
): Promise<{
    downloadLinks: DownloadLink[];
    $2: any;
    cookies: any;
    pageContent: any;
    responseUrl: string;
} | null> {
    try {
        if (!sourceLinkData) {
            addPageLinkToCrawlerStatus(page_link, pageNumber);
        }
        if (checkForceStopCrawler()) {
            removePageLinkToCrawlerStatus(page_link);
            return null;
        }
        await pauseCrawler();
        const getLinksRes = await getLinks(
            page_link,
            sourceConfig.config,
            PageType.MovieDataPage,
            extraConfigs,
            sourceLinkData,
        );
        if (!getLinksRes) {
            removePageLinkToCrawlerStatus(page_link);
            return null;
        }

        const { $, links, cookies, pageContent, responseUrl } = getLinksRes;
        if ($ === null || $ === undefined || checkForceStopCrawler()) {
            removePageLinkToCrawlerStatus(page_link);
            return null;
        }

        const extraSearchLinks: string[] = [];
        let promiseArray = [];
        let downloadLinks: DownloadLink[] = [];
        for (let j = 0, links_length = links.length; j < links_length; j++) {
            const link = $(links[j]).attr('href');
            if (!link || link.startsWith('ftp:')) {
                continue;
            }

            if (
                extraChecker?.($, links[j], title, type) ||
                LinkUtils.checkFormat(link, title)
            ) {
                const link_info = getFileData(
                    $,
                    links[j],
                    type,
                    sourceLinkData,
                    title,
                    sourceConfig,
                );
                const qualitySample = getQualitySample
                    ? getQualitySample($, links[j], type) || ''
                    : '';
                if (link_info !== 'trailer' && link_info !== 'ignore') {
                    let season = 0;
                    let episode = 0;
                    let isNormalCase = false;
                    if (type.includes('serial') || link_info.match(/^s\d+e\d+(-?e\d+)?\./i)) {
                        if (type.includes('anime') || getSeasonEpisodeFromInfo) {
                            ({
                                season,
                                episode,
                                isNormalCase,
                            } = CrawlerUtils.getSeasonEpisode(link_info));
                            if (
                                (season === 0 && episode === 0) ||
                                link_info.match(/^\d\d\d\d?p(\.|$)/)
                            ) {
                                ({
                                    season,
                                    episode,
                                    isNormalCase,
                                } = CrawlerUtils.getSeasonEpisode(link, true));
                            }
                        } else {
                            ({
                                season,
                                episode,
                                isNormalCase,
                            } = CrawlerUtils.getSeasonEpisode(link, true));
                            if (season === 0 && !isNormalCase) {
                                ({
                                    season,
                                    episode,
                                    isNormalCase,
                                } = CrawlerUtils.getSeasonEpisode(link_info));
                            }
                        }
                    }
                    downloadLinks.push({
                        link: link.trim(),
                        info: link_info.replace(/^s\d+e\d+(-?e\d+)?\./i, ''),
                        qualitySample: CrawlerUtils.getDecodedLink(qualitySample),
                        sourceName: sourceConfig.config.sourceName,
                        season,
                        episode,
                        type: CrawlerLinkType.DIRECT,
                    });
                }
            } else if (
                (!sourceLinkData &&
                    extraSearchMatch &&
                    extraSearchMatch($, links[j], title, type)) ||
                (sourceLinkData && sourceLinkData.searchLayer < 2 && link.match(/^\d\d\d\d?p\/$/i))
            ) {
                if (extraSearchLinks.includes(link)) {
                    continue;
                }
                extraSearchLinks.push(link);

                const newPageLink = sourceLinkData ? page_link + link : link;
                const resultPromise = search_in_title_page(
                    sourceConfig,
                    extraConfigs,
                    title,
                    type,
                    newPageLink,
                    pageNumber,
                    extraSearch_getFileData,
                    getQualitySample,
                    extraChecker,
                    false,
                    extraSearchMatch,
                    extraSearch_getFileData,
                    {
                        $,
                        link: links[j],
                        sourceLink: page_link,
                        searchLayer: sourceLinkData ? sourceLinkData.searchLayer + 1 : 1,
                    },
                ).then((result) => {
                    if (result) {
                        const resultLinks = result.downloadLinks;
                        let linkPrefix = link;
                        if (page_link.includes('anime-list')) {
                            const temp = link.replace(/(https|http):\/\//g, '').split('/')[0];
                            linkPrefix = link.includes('https')
                                ? `https://${temp}/`
                                : `http://${temp}/`;
                        }
                        for (let i = 0; i < resultLinks.length; i++) {
                            resultLinks[i].link = linkPrefix + resultLinks[i].link;
                        }
                        downloadLinks.push(...resultLinks);
                    }
                });
                promiseArray.push(resultPromise);
                if (promiseArray.length > 10) {
                    await Promise.allSettled(promiseArray);
                    promiseArray = [];
                }
            }
        }
        await Promise.allSettled(promiseArray);
        downloadLinks = LinkInfoUtils.filterLowResDownloadLinks(downloadLinks);
        downloadLinks = LinkInfoUtils.handleRedundantPartNumber(downloadLinks);
        return {
            downloadLinks: downloadLinks,
            $2: $,
            cookies,
            pageContent,
            responseUrl,
        };
    } catch (error) {
        saveError(error);
        removePageLinkToCrawlerStatus(page_link);
        return null;
    }
}

async function getLinks(
    url: string,
    config: SourceConfigC,
    pageType: PageType,
    extraConfigs: CrawlerExtraConfigs,
    sourceLinkData: any = null,
    retryCounter = 0,
): Promise<{
    $: any;
    links: any[];
    cookies: any;
    checkGoogleCache: boolean;
    responseUrl: string;
    pageTitle: string;
    pageContent: any;
} | null> {
    let checkGoogleCache = false;
    let responseUrl = '';
    let pageTitle = '';
    let cookies = {};
    let pageContent = {};
    try {
        const pageLink = url;
        url = url.replace(/\/page\/1(\/|$)|\?page=1$/g, '');
        if (url.includes('/page/') && !url.endsWith('/')) {
            url = url + '/';
        }
        let $: any;
        let links: any = [];

        try {
            if (checkForceStopCrawler()) {
                return {
                    $: null,
                    links: [],
                    cookies,
                    checkGoogleCache,
                    responseUrl,
                    pageTitle,
                    pageContent,
                };
            }
            await pauseCrawler();

            // let pageData = null;
            // if (!extraConfigs?.dontUseRemoteBrowser && config.needHeadlessBrowser && !sourceLinkData) {
            //     saveLinksStatus(pageLink, pageType, 'fetchingStart');
            //     pageData = await getPageData(url, config.sourceName, {...config, ...(extraConfigs || {})},
            //         config.sourceAuthStatus, pageType, true);
            //     if (pageData && pageData.pageContent) {
            //         responseUrl = pageData.responseUrl;
            //         pageTitle = pageData.pageTitle;
            //         cookies = pageData.cookies;
            //         pageContent = pageData.pageContent;
            //         if (config.removeScriptAndStyleFromHtml) {
            //             pageData.pageContent = removeScriptAndStyle(pageData.pageContent);
            //         }
            //         $ = cheerio.load(pageData.pageContent);
            //         links = $('a');
            //     }
            // }
            // if (!pageData || (!pageData.pageContent && !pageData.isAxiosCalled)) {

            freeFetchBlackListSources();
            const sourceData = fetchBlackListSources.find(
                (item) => item.sourceName === config.sourceName,
            );
            if (
                sourceData?.isBlocked &&
                !sourceLinkData &&
                pageType === PageType.MovieDataPage
            ) {
                $ = null;
                links = [];
            } else {
                if (pageType === PageType.MainPage) {
                    if (
                        !extraConfigs?.dontUseRemoteBrowser &&
                        config.needHeadlessBrowser &&
                        !sourceLinkData
                    ) {
                        changeSourcePageFromCrawlerStatus(
                            pageLink,
                            linkStateMessages.sourcePage.retryFetchCookie,
                        );
                    } else {
                        changeSourcePageFromCrawlerStatus(
                            pageLink,
                            linkStateMessages.sourcePage.fetchingStart_fetch,
                        );
                    }
                } else {
                    if (
                        !extraConfigs?.dontUseRemoteBrowser &&
                        config.needHeadlessBrowser &&
                        !sourceLinkData
                    ) {
                        changePageLinkStateFromCrawlerStatus(
                            pageLink,
                            linkStateMessages.gettingPageData.retryFetchCookie,
                        );
                    } else {
                        changePageLinkStateFromCrawlerStatus(
                            pageLink,
                            linkStateMessages.gettingPageData.gettingPageData_fetch,
                        );
                    }
                }

                // let sourcesObject = await getAxiosSourcesObject();
                // let sourceCookies = sourcesObject
                //     ? sourcesObject[config.sourceName]?.cookies || []
                //     : [];
                // sourceHeaders = sourceHeaders ? JSON.parse(sourceHeaders) : {};
                // const cookie = sourceCookies
                //     .map((item) => item.name + '=' + item.value + ';')
                //     .join(' ');

                const sourceHeaders: Record<string, string> = config.headers
                    ? JSON.parse(config.headers) || {}
                    : {};
                const cookie = '';

                const responseTimeout: number =
                    pageType === PageType.MainPage ? 15 * 1000 : 10 * 1000;
                const response = await FetchUtils.getResponseWithCookie(
                    url,
                    cookie,
                    sourceHeaders,
                    responseTimeout,
                );

                responseUrl = response.responseUrl;
                if (
                    pageType === PageType.MovieDataPage &&
                    (response.data.includes('<title>Security Check ...</title>') ||
                        response.data.includes('<title>Redirecting...</title>'))
                ) {
                    $ = null;
                    links = [];
                } else {
                    pageContent = response.data;
                    if (config.removeScriptAndStyleFromHtml) {
                        response.data = removeScriptAndStyle(response.data);
                    }
                    $ = cheerio.load(response.data);
                    links = $('a');
                }
                if (links.length < 5 && !sourceLinkData) {
                    addSourceToFetchBlackList(config.sourceName, extraConfigs);
                }
            }
            // }
        } catch (error: any) {
            const notFoundText1 = 'مطلبی که به دنبال آن بودید یافت نشد';
            const notFoundText2 = 'صفحه ای که به دنبال آن می گردید حذف یا' +
                ' اصلا وجود نداشته باشد';

            if (
                FetchUtils.checkErrStatusCode(error, 400) &&
                !error.response?.includes(notFoundText1) &&
                !error.data?.includes(notFoundText1) &&
                !error.response?.includes(notFoundText2) &&
                !error.data?.includes(notFoundText2) &&
                !FetchUtils.checkErrStatusCertExpired(error) &&
                !FetchUtils.checkErrStatusAltNameInvalid(error) &&
                retryCounter < 1
            ) {
                url = url.replace(/(?<=(page\/\d+))\/$/, '');
                retryCounter++;
                saveLinksStatus(pageLink, pageType, 'retryOnNotFound');
                return await getLinks(
                    url,
                    config,
                    pageType,
                    extraConfigs,
                    sourceLinkData,
                    retryCounter,
                );
            }

            if (FetchUtils.checkErrStatusCodeBadUrl(error)) {
                if (decodeURIComponent(url) === url) {
                    let temp = url.replace(/\/$/, '').split('/').pop();
                    if (temp) {
                        url = url.replace(temp, encodeURIComponent(temp));
                        saveLinksStatus(pageLink, pageType, 'retryUnEscapedCharacters');
                        return await getLinks(
                            url,
                            config,
                            pageType,
                            extraConfigs,
                            sourceLinkData,
                            retryCounter,
                        );
                    }
                }
                error.isFetchError = true;
                error.url = url;
                error.filePath = 'searchTools';
                await saveErrorIfNeeded(error);
            } else {
                if (!sourceLinkData) {
                    addSourceToFetchBlackList(config.sourceName, extraConfigs);
                }

                if (config.use_google_cache) {
                    saveLinksStatus(pageLink, pageType, 'fromCache');
                    const cacheResult = await getFromGoogleCache(url);
                    $ = cacheResult.$;
                    links = cacheResult.links;
                    checkGoogleCache = true;
                }

                if (FetchUtils.checkErrStatusCodeTimeout(error)) {
                    const timeout = error.message.match(/\d+/)?.[0] || '10s|15s';
                    ServerAnalysisRepo.saveCrawlerWarning(
                        CrawlerErrors.fetch.timeoutError(timeout, config.sourceName),
                    );
                    if (pageType === PageType.MainPage && retryCounter < 2) {
                        retryCounter++;
                        return await getLinks(
                            url,
                            config,
                            pageType,
                            extraConfigs,
                            sourceLinkData,
                            retryCounter,
                        );
                    }
                } else if (FetchUtils.checkErrStatusCodeAborted(error)) {
                    ServerAnalysisRepo.saveCrawlerWarning(CrawlerErrors.fetch.abortError(config.sourceName));
                    if (pageType === PageType.MainPage && retryCounter < 2) {
                        retryCounter++;
                        return await getLinks(
                            url,
                            config,
                            pageType,
                            extraConfigs,
                            sourceLinkData,
                            retryCounter,
                        );
                    }
                } else if (FetchUtils.checkErrStatusCodeEAI(error)) {
                    ServerAnalysisRepo.saveCrawlerWarning(CrawlerErrors.fetch.eaiError(config.sourceName));
                } else if (FetchUtils.checkErrStatusCode(error, 403)) {
                    ServerAnalysisRepo.saveCrawlerWarning(
                        CrawlerErrors.source.fetch403(config.sourceName),
                    );
                } else {
                    await saveErrorIfNeeded(error);
                }
            }
        }

        if (links.length < 5 && !checkGoogleCache && config.use_google_cache) {
            const cacheResult = await getFromGoogleCache(url);
            $ = cacheResult.$;
            links = cacheResult.links;
            checkGoogleCache = true;
        }

        const uniqueLinks: string[] = [];
        for (let i = 0; i < links.length; i++) {
            if ($ && !hasSidebarClass($(links[i]))) {
                const href = $(links[i]).attr('href') || '';

                if (
                    $(links[i]).children().length === 0 &&
                    !$(links[i]).attr('title') &&
                    !$(links[i]).attr('alt') &&
                    !href.match(
                        /\.(avi|flv|m4v|mkv|mka|mov|mp4|mpg|mpeg|rm|swf|wmv)(\?((md\d)|(par))=.+)?$/i,
                    )
                ) {
                    continue;
                }

                if (href.match(/\/(director|writer)\//) || href.match(/\/release\/\d{4}/)) {
                    continue;
                }

                if (
                    !href.includes('/tag/') &&
                    (!href.match(/\.(mp4)$/) || href.match(/[-_.\s]\d{3,4}p[-_.\s]/)) &&
                    !uniqueLinks.find(
                        (u) =>
                            CrawlerUtils.getDecodedLink($(u).attr('href')) ===
                            CrawlerUtils.getDecodedLink($(links[i]).attr('href')),
                    )
                ) {
                    uniqueLinks.push(links[i]);
                }
            }
        }

        return {
            $,
            links: uniqueLinks,
            cookies,
            checkGoogleCache,
            responseUrl,
            pageTitle,
            pageContent,
        };
    } catch (error) {
        await saveErrorIfNeeded(error);
        return {
            $: null,
            links: [],
            cookies,
            checkGoogleCache,
            responseUrl,
            pageTitle,
            pageContent,
        };
    }
}

function checkLastPage(
    $: any,
    links: string[],
    checkGoogleCache: boolean,
    responseUrl: string,
    pageTitle: string,
    pageNumber: number,
    linksCountInPages: { page: number; linksCount: number }[],
): boolean {
    try {
        if ($ === null || $ === undefined || pageTitle.includes('صفحه پیدا نشد')) {
            return true;
        }

        if (links.length === 0 && checkGoogleCache) {
            return true;
        }

        if (linksCountInPages.length > 8) {
            const temp = linksCountInPages.slice(linksCountInPages.length - 6);
            if (temp.every((item) => item.linksCount === 0)) {
                return true;
            }
        }

        return !(pageNumber === 1 || responseUrl.includes('page'));
    } catch (error) {
        saveErrorIfNeeded(error);
        return true;
    }
}

export async function getConcurrencyNumber(
    sourceName: string,
    needHeadlessBrowser: boolean,
    extraConfigs: CrawlerExtraConfigs,
): Promise<number> {
    let concurrencyNumber = 0;
    if (extraConfigs?.crawlerConcurrency) {
        concurrencyNumber = Number(extraConfigs?.crawlerConcurrency);
        if (concurrencyNumber > 0) {
            return concurrencyNumber;
        }
    } else if (config.CRAWLER_CONCURRENCY) {
        concurrencyNumber = Number(config.CRAWLER_CONCURRENCY);
    }
    if (concurrencyNumber === 0) {
        concurrencyNumber = needHeadlessBrowser ? 9 : 12;
    }
    //TODO : add db config
    if (await checkServerIsIdle()) {
        //use higher concurrency when mode is 0 and server is idle
        concurrencyNumber += 2;
    }
    return concurrencyNumber;
}

//---------------------------------------------
//---------------------------------------------

function addSourceToFetchBlackList(sourceName: string, extraConfigs: CrawlerExtraConfigs): void {
    const sourceData = fetchBlackListSources.find((item) => item.sourceName === sourceName);
    if (sourceData) {
        if (Date.now() - sourceData.lastErrorTime > 5 * 60 * 1000) {
            //kind of resetting counter
            sourceData.errorCounter = 1;
            sourceData.totalErrorCounter++;
        }
        if (Date.now() - sourceData.lastErrorTime < 60 * 1000) {
            sourceData.errorCounter++;
            sourceData.totalErrorCounter++;
        }
        sourceData.lastErrorTime = Date.now();
        const errorBlockCount = Number(extraConfigs?.fetchBlockThreshHold || 15);
        if (sourceData.errorCounter >= errorBlockCount) {
            sourceData.isBlocked = true;
        }
    } else {
        fetchBlackListSources.push({
            sourceName: sourceName,
            errorCounter: 1,
            lastErrorTime: Date.now(),
            isBlocked: false,
            totalErrorCounter: 1,
            url: '',
        });
    }
}

function freeFetchBlackListSources(): void {
    for (let i = 0; i < fetchBlackListSources.length; i++) {
        //free source after 5 minute
        if (Date.now() - fetchBlackListSources[i].lastErrorTime >= 5 * 60 * 1000) {
            fetchBlackListSources[i].errorCounter = 0;
            fetchBlackListSources[i].lastErrorTime = 0;
            fetchBlackListSources[i].isBlocked = false;
        }
    }
}

//---------------------------------------------
//---------------------------------------------

export function saveLinksStatus(pageLink: string, pageType: string, state: string): void {
    //TODO : print on debug_mode

    if (state === 'fetchingStart') {
        if (pageType === 'sourcePage') {
            changeSourcePageFromCrawlerStatus(pageLink, linkStateMessages.sourcePage.fetchingStart);
        } else {
            changePageLinkStateFromCrawlerStatus(
                pageLink,
                linkStateMessages.gettingPageData.gettingPageData,
            );
        }
    } else if (state === 'retryOnNotFound') {
        if (pageType === 'sourcePage') {
            changeSourcePageFromCrawlerStatus(
                pageLink,
                linkStateMessages.sourcePage.retryOnNotFound,
            );
        } else {
            changePageLinkStateFromCrawlerStatus(
                pageLink,
                linkStateMessages.gettingPageData.retryOnNotFound,
            );
        }
    } else if (state === 'retryUnEscapedCharacters') {
        if (pageType === 'sourcePage') {
            changeSourcePageFromCrawlerStatus(
                pageLink,
                linkStateMessages.sourcePage.retryUnEscapedCharacters,
            );
        } else {
            changePageLinkStateFromCrawlerStatus(
                pageLink,
                linkStateMessages.gettingPageData.retryUnEscapedCharacters,
            );
        }
    } else if (state === 'fromCache') {
        if (pageType === 'sourcePage') {
            changeSourcePageFromCrawlerStatus(pageLink, linkStateMessages.sourcePage.fromCache);
        } else {
            changePageLinkStateFromCrawlerStatus(
                pageLink,
                linkStateMessages.gettingPageData.fromCache,
            );
        }
    }
}

//---------------------------------------------
//---------------------------------------------

export function removeScriptAndStyle(htmlString: string): string {
    try {
        if (!htmlString) {
            return htmlString;
        }
        return htmlString.replace(styleRegex, '').replace(scriptRegex, '');
    } catch (error) {
        saveError(error);
        return htmlString;
    }
}
