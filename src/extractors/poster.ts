import { hasSidebarClass } from '@/sources/generic';
import { sourcesNames } from '@services/crawler/sourcesArray';
import { Crawler as CrawlerUtils, logger, TerminalUtils } from '@/utils';
import { saveError } from '@utils/logger';
import * as cheerio from 'cheerio';
import fastDiff from 'fast-diff';
import chalk from 'chalk';
import {
    updateSourcePageData,
    getSourcePagesSamples,
} from '@/samples/sourcePages/sourcePageSample';

const badPosterRegex = /https:\/\/image\.salamdl\.[a-zA-Z]+\/t\/p\/w\d+_and_h\d+_bestv\d+/i;

export function getPoster(
    $: any,
    pageLink: string,
    sourceName: string,
    dontRemoveDimensions = false,
): string {
    try {
        const $img = $('img');

        if (sourceName === 'film2movie') {
            for (let i = 0, imgLen = $img.length; i < imgLen; i++) {
                const id = $($img[i]).attr('id');
                const alt = $img[i].attribs.alt;
                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                if (
                    (id && id === 'myimg') ||
                    (src.includes('.jpg') && alt && alt.includes('دانلود'))
                ) {
                    return purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                }
            }
            return '';
        }

        for (let i = 0, imgLen = $img.length; i < imgLen; i++) {
            const parent = $img[i].parent.name;
            if (['a', 'figure'].includes(parent)) {
                const parentClass = $($img[i]).parent()?.attr('class') || '';
                if (parentClass.includes('gallery')) {
                    continue;
                }

                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                const poster = purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                if (poster) {
                    return poster;
                }
            }
        }

        for (let i = 0, imgLen = $img.length; i < imgLen; i++) {
            const parent = $img[i].parent.name;
            if (['p', 'div', 'strong', 'span', 'aside'].includes(parent)) {
                const parentClass = $($img[i]).parent()?.attr('class') || '';
                if (isWidePoster(parent, parentClass)) {
                    continue;
                }

                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                const poster = purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                if (poster) {
                    return poster;
                }
            }
        }

        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

export function getWidePoster(
    $: any,
    pageLink: string,
    sourceName: string,
    dontRemoveDimensions = false,
): string {
    try {
        const $div = $('div[style*="background-image"]');
        // const $div = $('div');
        const $img = $('img');

        for (let i = 0, Len = $div.length; i < Len; i++) {
            const bgImageMatch = $($div[i])
                .attr('style')
                ?.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/gi);

            if (!bgImageMatch || !bgImageMatch[0]) {
                continue;
            }

            const src = bgImageMatch[0].split('url(').pop().replace(/\)$/, '');
            const poster = purgePoster($, $div[i], src, pageLink, dontRemoveDimensions);
            if (poster && poster !== getPoster($, pageLink, sourceName)) {
                return poster;
            }
        }

        for (let i = 0, Len = $img.length; i < Len; i++) {
            const parent = $img[i].parent.name;
            const parentClass = $($img[i]).parent()?.attr('class') || '';

            if (isWidePoster(parent, parentClass)) {
                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                const poster = purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                if (poster && poster !== getPoster($, pageLink, sourceName)) {
                    return poster;
                }
            }
        }

        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function isWidePoster(parentName: string, parentClass: string): boolean {
    return (
        parentName === 'div' &&
        (parentClass.includes('background') ||
            (parentClass.includes('cover') && !parentClass.match(/post[._-]cover/)) ||
            !!parentClass.match(/single.?image/g))
    );
}

function purgePoster(
    $: any,
    img: any,
    src: string,
    pageLink: string,
    dontRemoveDimensions = false,
): string {
    if (
        src === '' ||
        src.match(badPosterRegex) ||
        (!src.includes('upload') && !src.includes('/cdn/')) ||
        src.toLowerCase().includes('/logo') ||
        src.endsWith('.gif') ||
        src.includes('https://www.w3.org/') ||
        src.includes('data:image/') ||
        src.includes('menu') ||
        src.match(/([\/\-_])(Logo|noavatar)[a-z-_]*\./i) ||
        src.match(/imdb\.[a-z\d]+$/i) ||
        hasSidebarClass($(img))
    ) {
        // if (config.nodeEnv === 'dev') {
        //     logger.warn('************************************ BAD POSTER: ', src);
        // }
        return '';
    }

    const width = Number($(img).attr('width') || 120);
    if (width < 120) {
        // if (config.nodeEnv === 'dev') {
        //     logger.warn('************************************ BAD POSTER: ', src);
        // }
        return '';
    }

    //wide poster
    if (src.includes('backdrop')) {
        return '';
    }

    if (['a', 'figure'].includes(img.parent.name)) {
        let parentHref = $(img.parent).attr('href');
        if (!parentHref) {
            parentHref = $(img.parent.parent).attr('href');
        }

        if (
            parentHref &&
            CrawlerUtils.getDecodedLink(parentHref).replace(/\/$/, '') !==
            CrawlerUtils.getDecodedLink(pageLink).replace(/\/$/, '') &&
            CrawlerUtils.getDecodedLink(parentHref).replace(/\/$/, '').split('-')[0] !==
            CrawlerUtils.getDecodedLink(src).replace(/\/$/, '').split('-')[0]
        ) {
            return '';
        }
    }

    if (['div'].includes(img.parent.name)) {
        if ($(img.parent).hasClass('head')) {
            return '';
        }
    }

    // if (img.parent.name === "div" && img.parent.parent?.name === "div" &&
    //     $(img.parent.parent).attr('id')?.includes('tab')) {
    //     return '';
    // }

    src = src.replace(/.+(?=https:)/, '');

    if (!dontRemoveDimensions) {
        src = src.replace(/-\d\d\d+x\d\d\d+(?=\.)/g, '');
    }

    src = src.split(/[?&][a-zA-Z\d]+=/g)[0];

    if (!src.startsWith('http')) {
        //relative links
        src = pageLink.split(/(?<=([a-zA-Z\d])\/)/g)[0] + src.replace(/^\//, '');
    }

    return src;
}

export async function comparePrevPosterWithNewMethod(
    sourceName: string[] | null = null,
    updateMode = true,
    autoUpdateIfNeed = false,
): Promise<any> {
    const stats = {
        total: 0,
        checked: 0,
        diffs: 0,
        updated: 0,
    };

    try {
        logger.warn('------------- START OF (comparePrevPosterWithNewMethod) -----------');
        const sources = sourceName || sourcesNames;
        console.time('comparePrevPosterWithNewMethod');
        for (let i = 0; i < sources.length; i++) {
            logger.warn(
                `------------- START OF (comparePrevPosterWithNewMethod [${sources[i]}]) -----------`,
            );
            let sourcePages: any[] | string = [];
            let start = 1;
            let lastFileIndex = 1;
            while (true) {
                sourcePages = await getSourcePagesSamples(sources[i], start, start);
                start++;
                if (sourcePages.length === 0) {
                    logger.warn(
                        `------------- END OF (comparePrevPosterWithNewMethod [${sources[i]}]) -----------`,
                    );
                    break;
                }
                stats.total += sourcePages.length;

                for (let j = 0; j < sourcePages.length; j++) {
                    if (lastFileIndex !== sourcePages[j].fileIndex) {
                        lastFileIndex = sourcePages[j].fileIndex;
                        logger.warn(
                            `------------- START OF [${sources[i]}] -fileIndex:${lastFileIndex} -----------`,
                        );
                    }
                    stats.checked++;
                    const {
                        sourceName: sName,
                        poster,
                        pageContent,
                        fileIndex,
                        title,
                        type,
                        year,
                        pageLink,
                    } = sourcePages[j];
                    let $ = cheerio.load(pageContent);
                    const newPoster = getPoster($, pageLink, sName);
                    if (!newPoster) {
                        logger.warn(
                            `--- empty poster (${title}) (year:${year}): \n,
                            ${fileIndex} |
                            ${stats.checked} / ${stats.total} |
                            ${title} |
                            ${type} |
                            ${pageLink}`,
                        );
                    }

                    if (poster !== newPoster) {
                        logger.warn(`
                            ${sName} |
                            ${fileIndex} |
                            ${stats.checked} / ${stats.total} |
                            ${title} |
                            ${type} |
                            ${pageLink}`,
                        );
                        const diff = fastDiff(poster, newPoster);
                        const diffs: string[] = [];
                        let t = poster;
                        diff.forEach((part: fastDiff.Diff) => {
                            const value = part[1]?.toString() ?? '';
                            if (part[0] === 1) {
                                const p = chalk.green(value);
                                t = t.replace(value, p);
                                diffs.push(p);
                            } else if (part[0] === -1) {
                                const p = chalk.red(value);
                                t = t.replace(value, p);
                                diffs.push(p);
                            }
                        });
                        logger.info('', {
                            ps1: poster,
                            ps2: newPoster,
                        });
                        logger.warn(`${chalk.blue('RES')}: ${t}\n${chalk.blue('DIFFS')}: ${diffs}`);

                        stats.diffs++;

                        if (updateMode) {
                            const checkUpdateIsNeededResult = checkUpdateIsNeeded(diffs, diff);
                            if (checkUpdateIsNeededResult && autoUpdateIfNeed) {
                                logger.info('------ semi manual update');
                                sourcePages[j].poster = newPoster;
                                await updateSourcePageData(sourcePages[j], ['poster']);
                                stats.updated++;
                                continue;
                            }

                            const answer = await TerminalUtils.question(
                                `update this movie data? [checkUpdateIsNeeded=${checkUpdateIsNeededResult}]`,
                            );
                            logger.info('');
                            if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
                                stats.updated++;
                                sourcePages[j].poster = newPoster;
                                await updateSourcePageData(sourcePages[j], ['poster']);
                            }
                            logger.info('');
                        }
                        logger.info('-------------------------');
                        logger.info('-------------------------');
                    }
                }
            }
        }
        console.timeEnd('comparePrevPosterWithNewMethod');
        logger.info(JSON.stringify(stats));
        logger.warn('------------- END OF (comparePrevPosterWithNewMethod) -----------');
        return stats;
    } catch (error) {
        saveError(error);
        return stats;
    }
}

function checkUpdateIsNeeded(diffs: string[], diff: any[]): boolean {
    const changes = diff.filter((item) => item[0] !== 0);
    logger.warn(JSON.stringify(changes));

    return (
        (diffs.length === 1 &&
            changes[0][0] === -1 &&
            changes[0][1].match(/^-\d\d\dx\d\d\d$/i)) ||
        (diffs.length === 1 &&
            changes[0][0] === -1 &&
            changes[0][1].match(badPosterRegex))
    );
}
