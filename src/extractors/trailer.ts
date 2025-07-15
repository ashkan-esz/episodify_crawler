import { VPNStatus } from '@/types';
import type { MovieTrailer } from '@/types/movie';
import {
    getSourcePagesSamples,
    updateSourcePageData,
} from '@/samples/sourcePages/sourcePageSample';
import { hasSidebarClass } from '@/sources/generic';
import { sourcesNames } from '@services/crawler/sourcesArray';
import { Crawler as CrawlerUtils, TerminalUtils } from '@/utils';
import { saveError } from '@utils/logger';
import * as cheerio from 'cheerio';

export function getTrailers(
    $: any,
    pageLink: string,
    sourceName: string,
    trailerVpnStatus: VPNStatus,
): MovieTrailer[] {
    try {
        let result = [];
        const $video = $('video');
        const $div = $('div');
        const $a = $('a');

        //bia2anime|bia2hd|golchindl
        if (sourceName !== 'film2movie') {
            for (let i = 0, len = $video.length; i < len; i++) {
                const sourceChild = $($video[i]).children()[0];
                if (sourceChild && sourceChild.attribs?.src) {
                    const src = sourceChild.attribs.src.replace('دانلود', '').replace('دانلو', '');
                    result.push(purgeTrailer(src, pageLink, sourceName, '720p', trailerVpnStatus));
                }
            }
        }

        //digimoviez
        for (let i = 0, len = $div.length; i < len; i++) {
            if ($($div[i]).hasClass('on_trailer_bottom')) {
                const src = $div[i].attribs['data-trailerlink'];
                if (
                    src &&
                    src.toLowerCase().includes('trailer') &&
                    !hasSidebarClass($($div[i]), ['related'])
                ) {
                    result.push(purgeTrailer(src, pageLink, sourceName, '720p', trailerVpnStatus));
                }
            }
        }

        //film2movie|golchindl|salamdl
        for (let i = 0, len = $a.length; i < len; i++) {
            let src = $($a[i]).attr('href');
            if (
                src &&
                src.toLowerCase().includes('trailer') &&
                !hasSidebarClass($($a[i]), ['related'])
            ) {
                if (src.includes('.mp4') || src.includes('.mkv')) {
                    src = src.replace('rel=', '');
                    result.push(purgeTrailer(src, pageLink, sourceName, '', trailerVpnStatus));
                }
            }
        }

        //avamovie|salamdl|vipo
        for (let i = 0, len = $a.length; i < len; i++) {
            const src = $a[i].attribs.href || $a[i].attribs.src;
            const text = $($a[i]).text() || '';
            if (src && !hasSidebarClass($($a[i]), ['related'])) {
                if (
                    (text.includes('تریلر') && src.toLowerCase().includes('/trailer/')) ||
                    src.match(/\.trailer\.mp4$/i)
                ) {
                    result.push(purgeTrailer(src, pageLink, sourceName, '720p', trailerVpnStatus));
                }
            }
        }

        //f2m
        for (let i = 0, len = $video.length; i < len; i++) {
            const src = $video[i].attribs.href || $video[i].attribs.src;
            const text = $($video[i]).text() || '';
            if (src && !hasSidebarClass($($video[i]), ['related'])) {
                if (
                    (text.includes('تریلر') && src.toLowerCase().includes('/trailer/')) ||
                    src.match(/OFFICIAL([.\-_])?TRAILER/i) ||
                    src.match(/[._-](trailer|teaser|seasonTeaser)(\d)?\.mp4$/i) ||
                    src.match(/\.s\d+\.mp4$/i)
                ) {
                    result.push(purgeTrailer(src, pageLink, sourceName, '720p', trailerVpnStatus));
                }
            }
        }

        result = CrawlerUtils.removeDuplicateLinks<MovieTrailer>(result.filter((item) => item !== null));
        return result;
    } catch (error) {
        saveError(error);
        return [];
    }
}

function purgeTrailer(
    url: string,
    pageLink: string,
    sourceName: string,
    quality: string,
    vpnStatus: VPNStatus,
    ): MovieTrailer | null {
    if (
        url.includes('media-imdb.com') ||
        url.includes('aparat.com') ||
        url.includes('imdb.com') ||
        url.startsWith('ftp:') ||
        url.match(/[\/._-]comment\./) ||
        url.match(/[\/._-]new-[a-z]+\./) ||
        url.match(/\.(jpe?g|png)$/)
    ) {
        return null;
    }

    url = url.trim().replace(/\s/g, '%20');

    if (!url.startsWith('http')) {
        //relative links
        url = pageLink.split(/(?<=([a-zA-Z\d])\/)/g)[0] + url.replace(/^\//, '');
    }

    if (sourceName === 'film2movie') {
        //from: https://dl200.ftk.pw/?s=7&f=/trailer/***.mp4
        //to: https://dl7.ftk.pw/trailer/***.mp4
        const temp = url.match(/\/\?s=\d+&f=(?=(\/(trailer|user|serial)))/gi);
        if (temp) {
            const match = temp.pop();
            const number = Number(match?.match(/\d+/g)?.pop() ?? '');
            url = url.replace(/(?<=dl)\d+(?=\.)/, number.toString()).replace(match ?? '', '');
        }
    }

    if (!quality) {
        const qualityMatch = url.match(/(\d\d\d\d?p)|((?<=_)\d\d\d\d?(?=\.))/g);
        if (qualityMatch) {
            quality = qualityMatch.pop() ?? '';
            if (Number(quality) > 1080) {
                quality =
                    url.includes('.72p.') || url.toLowerCase().includes('hd') ? '720p' : '480p';
            }
        } else {
            if (url.toLowerCase().includes('4k')) {
                quality = '2160p';
            } else {
                quality =
                    url.includes('.72p.') || url.toLowerCase().includes('hd') ? '720p' : '480p';
            }
        }
        if (!quality.endsWith('p')) {
            quality += 'p';
        }
        quality = quality.replace('7200p', '720p').replace('700p', '720p').replace('3600p', '360p');
    }
    return {
        url: url.replace(/\?_=\d+$/g, ''),
        info: sourceName + '-' + quality,
        vpnStatus: vpnStatus,
    };
}

export async function comparePrevTrailerWithNewMethod(
    sourceName: string[] | null = null,
    updateMode = true,
    autoUpdateIfNeed = false,
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
        console.log('------------- START OF (comparePrevTrailerWithNewMethod) -----------');
        const sources = sourceName || sourcesNames;
        console.time('comparePrevTrailerWithNewMethod');
        for (let i = 0; i < sources.length; i++) {
            console.log(
                `------------- START OF (comparePrevTrailerWithNewMethod [${sources[i]}]) -----------`,
            );
            let sourcePages: any[] | string = [];
            let start = 1;
            let lastFileIndex = 1;
            while (true) {
                sourcePages = await getSourcePagesSamples(sources[i], start, start);
                start++;
                if (sourcePages.length === 0) {
                    console.log(
                        `------------- END OF (comparePrevTrailerWithNewMethod [${sources[i]}]) -----------`,
                    );
                    break;
                }
                stats.total += sourcePages.length;

                for (let j = 0; j < sourcePages.length; j++) {
                    if (lastFileIndex !== sourcePages[j].fileIndex) {
                        lastFileIndex = sourcePages[j].fileIndex;
                        console.log(
                            `------------- START OF [${sources[i]}] -fileIndex:${lastFileIndex} -----------`,
                        );
                    }
                    stats.checked++;
                    const { sourceName: sName, trailers, pageContent } = sourcePages[j];
                    const $ = cheerio.load(pageContent);
                    const newTrailers = getTrailers($, '', sName, VPNStatus.NO_VPN);

                    if (!Bun.deepEquals(trailers, newTrailers)) {
                        const {
                            sourceName: sName,
                            fileIndex,
                            title,
                            type,
                            pageLink,
                        } = sourcePages[j];
                        console.log(
                            sName,
                            '|',
                            fileIndex,
                            '|',
                            stats.checked + '/' + stats.total,
                            '|',
                            title,
                            '|',
                            type,
                            '|',
                            pageLink,
                        );
                        console.log({
                            ps1: trailers,
                            ps2: newTrailers,
                        });
                        stats.diffs++;

                        if (updateMode) {
                            const checkUpdateIsNeededResult = checkUpdateIsNeeded(
                                trailers,
                                newTrailers,
                            );
                            if (checkUpdateIsNeededResult && autoUpdateIfNeed) {
                                console.log('------ semi manual update');
                                sourcePages[j].trailers = newTrailers;
                                await updateSourcePageData(sourcePages[j], ['trailers']);
                                stats.updated++;
                                continue;
                            }

                            const answer = await TerminalUtils.question(`update this movie data? [checkUpdateIsNeeded=${checkUpdateIsNeededResult}]`)
                            console.log();
                            if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
                                stats.updated++;
                                sourcePages[j].trailers = newTrailers;
                                await updateSourcePageData(sourcePages[j], ['trailers']);
                            }
                            console.log();
                        }
                        console.log('-------------------------');
                        console.log('-------------------------');
                    }
                }
            }
        }
        console.timeEnd('comparePrevTrailerWithNewMethod');
        console.log(JSON.stringify(stats));
        console.log('------------- END OF (comparePrevTrailerWithNewMethod) -----------');
        return stats;
    } catch (error) {
        saveError(error);
        return stats;
    }
}

function checkUpdateIsNeeded(trailers: MovieTrailer[], newTrailers: MovieTrailer[]): boolean {
    return trailers.length === 0 && newTrailers.length > 0;
}
