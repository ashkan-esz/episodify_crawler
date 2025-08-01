import { CrawlerLinkType, type DownloadLink, type MovieType } from '@/types';
import {
    LinkInfo as LinkInfoUtils,
    LinkUtils,
    Crawler as CrawlerUtils,
    TerminalUtils,
    logger,
} from '@/utils';
import {
    getSourcePagesSamples,
    updateSourcePageData,
    updateSourcePageData_batch,
} from '@/samples/sourcePages/sourcePageSample';
import {
    getSourcesMethods,
    sourcesNames,
} from '@services/crawler/sourcesArray';
import { saveError } from '@utils/logger';
import * as cheerio from 'cheerio';

const sourcesMethods = getSourcesMethods();

export function getDownloadLinksFromPageContent(
    $: any,
    title: string,
    type: MovieType,
    year: string,
    sourceName: string,
): any[] {
    try {
        const sourceMethods = sourcesMethods[sourceName as keyof typeof sourcesMethods];
        const links = $('a');

        let downloadLinks: DownloadLink[] = [];
        for (let j = 0, links_length = links.length; j < links_length; j++) {
            const link = $(links[j]).attr('href');
            if (!link) {
                continue;
            }

            if (
                sourceMethods.extraChecker?.($, links[j], title, type) ||
                LinkUtils.checkFormat(link, title)
            ) {
                const link_info = sourceMethods.getFileData($, links[j], type, null, title);
                const qualitySample = sourceMethods.getQualitySample
                    ? sourceMethods.getQualitySample($, links[j], type) || ''
                    : '';
                if (link_info !== 'trailer' && link_info !== 'ignore') {
                    let season = 0;
                    let episode = 0;
                    let isNormalCase = false;
                    if (type.includes('serial') || link_info.match(/^s\d+e\d+(-?e\d+)?\./i)) {
                        if (type.includes('anime')) {
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
                        qualitySample: qualitySample,
                        sourceName: sourceName,
                        season,
                        episode,
                        type: CrawlerLinkType.DIRECT,
                    });
                }
            }
        }

        downloadLinks = LinkInfoUtils.filterLowResDownloadLinks(downloadLinks);
        downloadLinks = LinkInfoUtils.handleRedundantPartNumber(downloadLinks);

        if (sourceMethods.addTitleNameToInfo && !type.includes('serial')) {
            downloadLinks = sourceMethods.addTitleNameToInfo(downloadLinks, title, year);
        }
        if (sourceMethods.handleLinksExtraStuff) {
            downloadLinks = sourceMethods.handleLinksExtraStuff(downloadLinks);
        }

        return CrawlerUtils.removeDuplicateLinks(downloadLinks, true);
    } catch (error) {
        saveError(error);
        return [];
    }
}

export function getDownloadLinksFromLinkInfo(downloadLinks: DownloadLink[]): DownloadLink[] {
    try {
        const result = [];

        for (let i = 0, len = downloadLinks.length; i < len; i++) {
            const downloadLink = { ...downloadLinks[i] };
            const temp = downloadLink.info.split(' - ');
            downloadLink.info = LinkInfoUtils.fixLinkInfoOrder(temp[0]);
            if (temp[1]) {
                downloadLink.info += ' - ' + temp[1];
            }
            result.push(downloadLink);
        }
        return result;
    } catch (error) {
        saveError(error);
        return [];
    }
}

export function getLinksDoesntMatchLinkRegex(
    downloadLinks: DownloadLink[],
    type: MovieType,
): any[] {
    const badLinks = downloadLinks.filter(
        (item) =>
            (!item.info.match(LinkInfoUtils.linkInfoRegex) &&
                !item.info
                    .replace(new RegExp(`\\.(${LinkInfoUtils.encodersRegex.source})(?=(\\.|$))`, 'gi'), '')
                    .match(LinkInfoUtils.linkInfoRegex) &&
                !item.info.match(LinkInfoUtils.countriesRegex)) ||
            item.info.match(/[\u0600-\u06FF]/),
    );

    const isSerial = type.includes('serial');
    const badSeasonEpisode = downloadLinks.filter(({
                                                       season,
                                                       episode,
                                                       info,
                                                       link,
                                                   }) => {
        if (type.includes('movie') && (season !== 0 || episode !== 0)) {
            return true;
        }
        if (isSerial) {
            if (
                season === 0 &&
                !link.match(/s0+\.?e\d{1,2}/i) &&
                !info.match(/\. \([a-zA-Z\s]+ \d{1,2}\)/) &&
                !info.match(/\. \([a-zA-Z\s]+\)$/) &&
                !info.match(LinkInfoUtils.specialRegex)
            ) {
                return true;
            }
            if (
                season <= 1 &&
                episode === 0 &&
                !link.match(/s\d{1,2}-?e0+/i) &&
                !link.match(/\.e0+\./i) &&
                !info.match(LinkInfoUtils.specialRegex)
            ) {
                return true;
            }
            if (season > 47 || episode > 1300) {
                return true;
            }
        }
        return false;
    });

    return [...badLinks, ...badSeasonEpisode].map((item) => {
        return {
            link: item.link,
            info: item.info,
            seasonEpisode: `S${item.season}E${item.episode}`,
        };
    });
}

export async function comparePrevDownloadLinksWithNewMethod(
    sourceName: string[] | null = null,
    mode = 'pageContent',
    { updateMode = true, batchUpdate = true, batchUpdateCount = 50 } = {},
): Promise<{
    total: number;
    checked: number;
    diffs: number;
    updated: number;
}> {
    const stats = {
        total: 0,
        checked: 0,
        diffs: 0,
        updated: 0,
    };

    try {
        logger.warn('------------- START OF (comparePrevDownloadLinksWithNewMethod) -----------');
        const sources = sourceName || sourcesNames;
        console.time('comparePrevDownloadLinksWithNewMethod');
        for (let i = 0; i < sources.length; i++) {
            logger.warn(
                `------------- START OF (comparePrevDownloadLinksWithNewMethod [${sources[i]}]) -----------`,
            );
            let sourcePages: any[] | string = [];
            let start = 1;
            let lastFileIndex = 1;
            let pageDataUpdateArray: any[] = [];
            while (true) {
                sourcePages = await getSourcePagesSamples(sources[i], start, start);
                start++;
                if (sourcePages.length === 0) {
                    logger.warn(
                        `------------- END OF (comparePrevDownloadLinksWithNewMethod [${sources[i]}]) -----------`,
                    );
                    break;
                }
                stats.total += sourcePages.length;

                for (let j = 0; j < sourcePages.length; j++) {
                    if (lastFileIndex !== sourcePages[j].fileIndex) {
                        //new source page file
                        if (batchUpdate) {
                            await updateSourcePageData_batch(pageDataUpdateArray, [
                                'downloadLinks',
                            ]);
                            pageDataUpdateArray = [];
                        }
                        lastFileIndex = sourcePages[j].fileIndex;
                        logger.warn(
                            `------------- START OF [${sources[i]}] -fileIndex:${lastFileIndex} -----------`,
                        );
                    }
                    stats.checked++;
                    const {
                        sourceName: sName,
                        fileIndex,
                        downloadLinks,
                        pageContent,
                        pageLink,
                        title,
                        type,
                        year,
                    } = sourcePages[j];
                    const $ = cheerio.load(pageContent);
                    let newDownloadLinks =
                        mode === 'pageContent'
                            ? getDownloadLinksFromPageContent($, title, type, year, sName)
                            : mode === 'checkRegex'
                                ? getLinksDoesntMatchLinkRegex(downloadLinks, type)
                                : getDownloadLinksFromLinkInfo(downloadLinks);

                    if (mode === 'checkRegex') {
                        if (newDownloadLinks.length === 0) {
                            continue;
                        }
                        stats.diffs++;
                        logger.warn(`
                            ${sName} |
                            ${fileIndex} | 
                            ${stats.checked} / ${stats.total} | 
                            ${pageDataUpdateArray.length}/${batchUpdateCount} | 
                            ${title} |
                            ${type} | 
                            ${pageLink}`,
                        );
                        logger.warn(
                            `prev vs new: ${downloadLinks.length} vs ${newDownloadLinks.length}`,
                        );
                        for (let k = 0; k < newDownloadLinks.length; k++) {
                            logger.warn(newDownloadLinks[k]);
                            logger.info('-----------');
                        }

                        let answer = await TerminalUtils.question(
                            'press \'y/yes\' to continue',
                        );
                        logger.info('');
                        while (answer !== 'y' && answer !== 'yes') {
                            answer = await TerminalUtils.question(
                                'press \'y/yes\' to continue',
                            );
                            logger.info('');
                        }

                        logger.info('-------------------------');
                        logger.info('-------------------------');
                        newDownloadLinks = getDownloadLinksFromPageContent(
                            $,
                            title,
                            type,
                            year,
                            sName,
                        );
                    }

                    if (!Bun.deepEquals(downloadLinks, newDownloadLinks)) {
                        logger.warn(`
                            ${sName}
                            ${fileIndex}
                            ${stats.checked} / ${stats.total} | 
                            ${pageDataUpdateArray.length}/${batchUpdateCount} | 
                            ${title} |
                            ${type} |
                            ${pageLink}`,
                        );
                        logger.warn(
                            `prev vs new: ${downloadLinks.length} vs ${newDownloadLinks.length}`,
                        );
                        printDiffLinks(downloadLinks, newDownloadLinks);
                        stats.diffs++;
                        if (updateMode) {
                            const {
                                answer,
                                resetFlag,
                            } = await handleUpdatePrompt(
                                newDownloadLinks,
                                sourcePages[j],
                                pageDataUpdateArray,
                                stats,
                                batchUpdate,
                                batchUpdateCount,
                            );
                            if (resetFlag) {
                                pageDataUpdateArray = [];
                            }
                            if (mode === 'checkRegex' && answer === 'yes') {
                                j--;
                            }
                        }
                        logger.info('-------------------------');
                        logger.info('-------------------------');
                    } else if (mode === 'checkRegex') {
                        logger.warn(
                            '************ No diff in new extracted links, check linkInfoRegex or linksExtractorFunctions',
                        );
                    }
                }
                //end of source page files
                if (batchUpdate) {
                    await updateSourcePageData_batch(pageDataUpdateArray, ['downloadLinks']);
                    pageDataUpdateArray = [];
                }
            }
        }
        console.timeEnd('comparePrevDownloadLinksWithNewMethod');
        logger.info(JSON.stringify(stats));
        logger.warn('------------- END OF (comparePrevDownloadLinksWithNewMethod) -----------');
        return stats;
    } catch (error) {
        saveError(error);
        return stats;
    }
}

function printDiffLinks(downloadLinks: DownloadLink[], newDownloadLinks: DownloadLink[]): void {
    for (let k = 0; k < Math.max(downloadLinks.length, newDownloadLinks.length); k++) {
        if (!Bun.deepEquals(downloadLinks[k], newDownloadLinks[k])) {
            if (!downloadLinks[k] || !newDownloadLinks[k]) {
                logger.warn('', {
                    link1: downloadLinks[k],
                    link2: newDownloadLinks[k],
                });
                continue;
            }
            const keys = [
                ...new Set([...Object.keys(newDownloadLinks[k]), ...Object.keys(downloadLinks[k])]),
            ];
            const link1 = { link: downloadLinks[k].link };
            const link2 = { link: newDownloadLinks[k].link };
            for (let i = 0; i < keys.length; i++) {
                if (
                    downloadLinks[k][keys[i] as keyof DownloadLink] !==
                    newDownloadLinks[k][keys[i] as keyof DownloadLink]
                ) {
                    //@ts-expect-error ...
                    link1[keys[i]] = downloadLinks[k][keys[i]];
                    //@ts-expect-error ...
                    link2[keys[i]] = newDownloadLinks[k][keys[i]];
                }
            }
            logger.warn('', {
                link1: link1,
                link2: link2,
            });
            logger.info('------------------');
        }
    }
}

async function handleUpdatePrompt(
    newDownloadLinks: DownloadLink[],
    pageData: any,
    pageDataUpdateArray: any[],
    stats: any,
    batchUpdate: boolean,
    batchUpdateCount: number,
): Promise<{ answer: string; resetFlag: boolean }> {
    const answer = await TerminalUtils.question(
        'update this movie data?',
    );
    logger.info('');

    if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
        stats.updated++;
        pageData.downloadLinks = newDownloadLinks;
        if (batchUpdate) {
            pageDataUpdateArray.push(pageData);
            if (pageDataUpdateArray.length >= batchUpdateCount) {
                await updateSourcePageData_batch(pageDataUpdateArray, ['downloadLinks']);
                return { answer: answer.toLowerCase(), resetFlag: true };
            }
        } else {
            await updateSourcePageData(pageData, ['downloadLinks']);
        }
    } else if (batchUpdate) {
        await updateSourcePageData_batch(pageDataUpdateArray, ['downloadLinks']);
        return { answer: answer.toLowerCase(), resetFlag: true };
    }
    logger.info('');
    return { answer: answer.toLowerCase(), resetFlag: false };
}
