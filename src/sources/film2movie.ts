import config from '@/config';
import { PosterExtractor, SummaryExtractor, TrailerExtractor } from '@/extractors';
import { getTitleAndYear } from '@services/crawler/movieTitle';
import save from '@services/crawler/save';
import { search_in_title_page, wrapper_module } from '@services/crawler/searchTools';
import { subtitleFormatsRegex } from '@services/crawler/subtitle';
import {
    CrawlerExtraConfigs,
    DownloadLink,
    getWatchOnlineLinksModel,
    MovieType,
    SourceConfig,
    SourceExtractedData,
} from '@/types';
import { MovieTrailer } from '@/types/movie';
import { getSubtitleModel, Subtitle } from '@/types/subtitle';
import {
    checkDubbed,
    checkHardSub,
    convertTypeMovieToSerial,
    convertTypeSerialToMovie,
    convertTypeToAnime,
    getType,
    removeDuplicateLinks,
    replacePersianNumbers,
    validateYear,
} from '@/utils/crawler';
import { fixLinkInfo, fixLinkInfoOrder, purgeQualityText } from '@utils/linkInfo';
import { Axios as AxiosUtils } from '@/utils';
import { saveError } from '@utils/logger';

let prevTitles: { title: string; year: string; type: MovieType }[] = [];

export default async function film2movie(
    sourceConfig: SourceConfig,
    pageCount: number | null,
    extraConfigs: CrawlerExtraConfigs,
    ): Promise<number[]> {
    prevTitles = [];
    const {
        lastPage,
        linksCount
    } = await wrapper_module(sourceConfig, sourceConfig.movie_url, pageCount, search_title, extraConfigs);
    return [lastPage, linksCount];
}

async function search_title(
    link: any,
    pageNumber: number,
    $: any,
    url: string,
    sourceConfig: SourceConfig,
    extraConfigs: CrawlerExtraConfigs,
): Promise<number> {
    try {
        const rel = link.attr('rel');
        if (!rel || rel !== 'bookmark') {
            return 0;
        }

        let title = link.text().toLowerCase();
        let year = '';
        let type = getType(title);
        const pageLink = link.attr('href');
        if (config.DEBUG_MODE) {
            console.log(`film2movie/${type}/${pageNumber}/${title}  ========>  `);
        }
        if (
            title.includes('تلویزیونی ماه عسل') ||
            title.includes('ایران') ||
            title.includes('دانلود سریال پهلوانان') ||
            title.includes('دانلود سریال شکرستان') ||
            title.includes('کلاه قرمزی') ||
            title.includes('دانلود فصل')
        ) {
            return 0;
        }
        let typeFix: MovieType | null = null;
        if (
            (title.includes('دانلود برنامه') || title.includes('دانلود مسابقات')) &&
            !title.includes('سریال')
        ) {
            typeFix = convertTypeSerialToMovie(type);
        }
        ({ title, year } = getTitleAndYear(title, year, type));

        if (title.endsWith(' movie') || title.match(/\smovie\s\d+$/)) {
            // type = type.replace('serial', 'movie');
            type = convertTypeSerialToMovie(type);
        }

        if (
            !prevTitles.find(
                (item) => item.title === title && item.year === year && item.type === type,
            )
        ) {
            prevTitles.push({ title, type, year });
            if (prevTitles.length > 50) {
                prevTitles = prevTitles.slice(prevTitles.length - 30);
            }
        } else {
            return 0;
        }

        if (title === '') {
            return 0;
        }

        let pageSearchResult = await search_in_title_page(
            sourceConfig,
            extraConfigs,
            title,
            type,
            pageLink,
            pageNumber,
            getFileData,
        );
        if (!pageSearchResult) {
            return 0;
        }

        // let { downloadLinks, $2, cookies, pageContent } = pageSearchResult;
        let { downloadLinks, $2, cookies } = pageSearchResult;
        if ($2('.category')?.text().includes('انیمه') && !type.includes('anime')) {
            // type = 'anime_' + type;
            type = convertTypeToAnime(type);
        }
        if (!year) {
            year = fixYear($2);
        }
        if (
            type.includes('movie') &&
            downloadLinks.length > 0 &&
            (downloadLinks[0].link.match(/\.s\d+e\d+\./i) ||
                downloadLinks[0].link.match(/\.E\d\d\d?\..*\d\d\d\d?p\./i))
        ) {
            // type = type.replace('movie', 'serial');
            type = convertTypeMovieToSerial(type);
            pageSearchResult = await search_in_title_page(
                sourceConfig,
                extraConfigs,
                title,
                type,
                pageLink,
                pageNumber,
                getFileData,
            );
            if (!pageSearchResult) {
                return 0;
            }
            // ({ downloadLinks, $2, cookies, pageContent } = pageSearchResult);
            ({ downloadLinks, $2, cookies } = pageSearchResult);
        }
        if (
            type.includes('serial') &&
            downloadLinks.length > 0 &&
            downloadLinks.every((item) => item.season === 1 && item.episode === 0)
        ) {
            // type = type.replace('serial', 'movie');
            type = convertTypeSerialToMovie(type);
            pageSearchResult = await search_in_title_page(
                sourceConfig,
                extraConfigs,
                title,
                type,
                pageLink,
                pageNumber,
                getFileData,
            );
            if (!pageSearchResult) {
                return 0;
            }
            // ({ downloadLinks, $2, cookies, pageContent } = pageSearchResult);
            ({ downloadLinks, $2, cookies } = pageSearchResult);
        }
        if (
            typeFix &&
            (downloadLinks.length === 0 || !downloadLinks[0].link.match(/\.s\d+e\d+\./i))
        ) {
            type = typeFix; //convert type serial to movie
            downloadLinks = downloadLinks.map((item) => {
                item.season = 0;
                item.episode = 0;
                return item;
            });
        }
        downloadLinks = removeDuplicateLinks(
            downloadLinks,
            sourceConfig.config.replaceInfoOnDuplicate,
        );
        downloadLinks = handleLinksExtraStuff(downloadLinks);

        const extractedData: SourceExtractedData = {
            title: title,
            type: type,
            year: year,
            pageNumber: pageNumber,
            //----------
            pageLink: pageLink,
            downloadLinks: downloadLinks,
            watchOnlineLinks: [],
            torrentLinks: [],
            persianSummary: SummaryExtractor.getPersianSummary($2, title, year),
            poster: PosterExtractor.getPoster($2, pageLink, sourceConfig.config.sourceName),
            widePoster: "",
            trailers: TrailerExtractor.getTrailers(
                $2,
                pageLink,
                sourceConfig.config.sourceName,
                sourceConfig.config.vpnStatus.trailer,
            ),
            subtitles: getSubtitles($2, type, pageLink, sourceConfig.config.sourceName),
            rating: null,
            cookies: cookies,
        };

        if (extraConfigs.returnAfterExtraction) {
            return downloadLinks.length;
        }

        // check trailers are available
        const goodTrailers: MovieTrailer[] = [];
        for (let i = 0; i < extractedData.trailers.length; i++) {
            const fileSize = await AxiosUtils.getFileSize(extractedData.trailers[i].url, {
                ignoreError: true,
                timeout: 20 * 1000,
                errorReturnValue: -1,
            });
            if (fileSize !== -1) {
                goodTrailers.push(extractedData.trailers[i]);
            }
        }
        extractedData.trailers = goodTrailers;

        await save(extractedData, sourceConfig, extraConfigs);

        return downloadLinks.length;
    } catch (error) {
        saveError(error);
        return -1;
    }
}

export async function handlePageCrawler(
    pageLink: string,
    title: string,
    type: MovieType,
    pageNumber: number,
    sourceConfig: SourceConfig,
    extraConfigs: CrawlerExtraConfigs,
): Promise<number> {
    try {
        title = title.toLowerCase();
        let year = '';
        ({ title, year } = getTitleAndYear(title, year, type));

        let pageSearchResult = await search_in_title_page(
            sourceConfig,
            extraConfigs,
            title,
            type,
            pageLink,
            pageNumber,
            getFileData,
        );
        if (pageSearchResult) {
            // let { downloadLinks, $2, cookies, pageContent } = pageSearchResult;
            let { downloadLinks, $2, cookies } = pageSearchResult;
            if ($2('.category')?.text().includes('انیمه') && !type.includes('anime')) {
                if (type.includes('serial')) {
                    type = MovieType.ANIME_SERIAL;
                } else {
                    type = MovieType.ANIME_MOVIE;
                }
            }
            if (!year) {
                year = fixYear($2);
            }
            if (
                type.includes('movie') &&
                downloadLinks.length > 0 &&
                (downloadLinks[0].link.match(/\.s\d+e\d+\./i) ||
                    downloadLinks[0].link.match(/\.E\d\d\d?\..*\d\d\d\d?p\./i))
            ) {
                // type = type.replace('movie', 'serial');
                type = convertTypeMovieToSerial(type);
                pageSearchResult = await search_in_title_page(
                    sourceConfig,
                    extraConfigs,
                    title,
                    type,
                    pageLink,
                    pageNumber,
                    getFileData,
                );
                if (!pageSearchResult) {
                    return 0;
                }
                // ({ downloadLinks, $2, cookies, pageContent } = pageSearchResult);
                ({ downloadLinks, $2, cookies } = pageSearchResult);
            }
            if (
                type.includes('serial') &&
                downloadLinks.length > 0 &&
                downloadLinks.every((item) => item.season === 1 && item.episode === 0)
            ) {
                // type = type.replace('serial', 'movie');
                if (type === MovieType.SERIAL) {
                    type = MovieType.MOVIE;
                } else {
                    type = MovieType.ANIME_MOVIE;
                }

                pageSearchResult = await search_in_title_page(
                    sourceConfig,
                    extraConfigs,
                    title,
                    type,
                    pageLink,
                    pageNumber,
                    getFileData,
                );
                if (!pageSearchResult) {
                    return 0;
                }
                // ({ downloadLinks, $2, cookies, pageContent } = pageSearchResult);
                ({ downloadLinks, $2, cookies } = pageSearchResult);
            }

            downloadLinks = removeDuplicateLinks(
                downloadLinks,
                sourceConfig.config.replaceInfoOnDuplicate,
            );
            downloadLinks = handleLinksExtraStuff(downloadLinks);

            const extractedData: SourceExtractedData = {
                title: title,
                type: type,
                year: year,
                pageNumber: pageNumber,
                //----------
                pageLink: pageLink,
                downloadLinks: downloadLinks,
                watchOnlineLinks: [],
                torrentLinks: [],
                persianSummary: SummaryExtractor.getPersianSummary($2, title, year),
                poster: PosterExtractor.getPoster($2, pageLink, sourceConfig.config.sourceName),
                widePoster: "",
                trailers: TrailerExtractor.getTrailers(
                    $2,
                    pageLink,
                    sourceConfig.config.sourceName,
                    sourceConfig.config.vpnStatus.trailer,
                ),
                subtitles: getSubtitles($2, type, pageLink, sourceConfig.config.sourceName),
                rating: null,
                cookies: cookies,
            };

            await save(extractedData, sourceConfig, extraConfigs);
            return downloadLinks.length;
        }
        return 0;
    } catch (error) {
        saveError(error);
        return -1;
    }
}

function fixYear($: any): string {
    try {
        const postInfo = $('.postinfo');
        if (postInfo) {
            const temp = $($(postInfo).children()[1]).text().toLowerCase();
            const yearArray = temp
                .split(',')
                .filter((item: string) => item && !isNaN(Number(item.trim())));
            if (yearArray.length === 0) {
                return '';
            }
            return validateYear(yearArray[0]);
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getWatchOnlineLinks(
    $: any,
    type: MovieType,
    pageLink: string,
    sourceName: string,
): DownloadLink[] {
    //NOTE: links from film2movie.upera.tv
    //NOTE: cannot extract season/episode from link
    try {
        let result = [];
        const $a = $('a');
        for (let i = 0; i < $a.length; i++) {
            const infoNode = type.includes('serial')
                ? $($a[i]).parent()
                : $($a[i]).parent().parent().prev();
            const infoText = $(infoNode).text();
            if (infoText && infoText.includes('پخش آنلاین')) {
                const linkHref = $($a[i]).attr('href');
                if (linkHref.includes('.upera.')) {
                    const info = getFileData($, $a[i], type);
                    const watchOnlineLink = getWatchOnlineLinksModel(
                        linkHref,
                        info,
                        type,
                        sourceName,
                    );
                    result.push(watchOnlineLink);
                }
            }
        }

        result = removeDuplicateLinks(result);
        return result;
    } catch (error) {
        saveError(error);
        return [];
    }
}

function getSubtitles($: any, type: MovieType, pageLink: string, sourceName: string): Subtitle[] {
    try {
        let result = [];
        const $a = $('a');
        for (let i = 0, _length = $a.length; i < _length; i++) {
            const linkHref = $($a[i]).attr('href');
            if (linkHref && linkHref.match(subtitleFormatsRegex)) {
                const subtitle = getSubtitleModel(linkHref, '', type, sourceName);
                result.push(subtitle);
            }
        }

        result = removeDuplicateLinks(result);
        return result;
    } catch (error) {
        saveError(error);
        return [];
    }
}

export function getFileData($: any, link: any, type: MovieType): string {
    try {
        return type.includes('serial')
            ? getFileData_serial($, link, type)
            : getFileData_movie($, link, type);
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getFileData_serial($: any, link: any, type: MovieType): string {
    if ($(link).hasClass('wp-embedded-video')) {
        return 'ignore';
    }
    let textNode = $(link).parent();
    let text = textNode.text();
    while (
        text.includes('بخش اول') ||
        text.includes('بخش دوم') ||
        text.includes('قسمت اول') ||
        text.includes('قسمت دوم') ||
        text.includes('فصل ') ||
        text.includes('دانلود صوت دوبله فارسی') ||
        text.match(/^[-=]+$/)
    ) {
        textNode = textNode.prev();
        text = textNode.text();
    }
    text = replacePersianNumbers(text.replace(/[:_|]/g, ''));
    const linkHref = $(link).attr('href');
    const Censored =
        text.toLowerCase().includes('family') ||
        checkDubbed(text, linkHref) ||
        checkHardSub(text) ||
        checkHardSub(linkHref)
            ? 'Censored'
            : '';
    let quality = purgeQualityText(text).replace(/\s/g, '.').replace('.Family', '');

    const resMatch = quality.match(/^\d+p/g)?.[0] || null;
    if (resMatch && Number(resMatch.replace('p', '')) < 480) {
        quality = quality.replace(/^\d+p\.?/, '');
    }

    quality = quality.replace(/&\.(\d+\.)?/g, '');

    const roundMatch = linkHref.match(/\.Round\d\d?\./i);
    const round =
        roundMatch
            ?.pop()
            .replace(/\./g, '')
            .replace(/\d\d?/, (res: string) => '_' + res) || '';
    let info = [quality, round, Censored].filter(Boolean).join('.');
    info = fixSpecialCases(info);
    info = fixLinkInfo(info, linkHref, type);
    info = fixLinkInfoOrder(info);
    return info;
}

function getFileData_movie($: any, link: any, type: MovieType): string {
    const parent = $(link).parent()[0].name === 'p' ? $(link).parent() : $(link).parent().parent();
    let textNode = $(parent).prev();
    let text = textNode.text();
    while (
        text.includes('بخش اول') ||
        text.includes('بخش دوم') ||
        text.includes('قسمت اول') ||
        text.includes('قسمت دوم') ||
        text.includes('فصل ') ||
        text.includes('دانلود صوت دوبله فارسی') ||
        text.match(/^[-=]+$/)
    ) {
        textNode = textNode.prev();
        text = textNode.text();
    }
    text = replacePersianNumbers(text);
    const linkHref = $(link).attr('href');
    const Censored =
        $(link).next().text().toLowerCase().includes('family') ||
        checkDubbed(linkHref, '') ||
        checkHardSub(linkHref)
            ? 'Censored'
            : '';
    const quality = purgeQualityText(text.replace(/[()]/g, ' ')).replace(/\s/g, '.');
    let info = [quality, Censored].filter(Boolean).join('.');
    info = fixSpecialCases(info);
    info = fixLinkInfo(info, linkHref, type);
    info = fixLinkInfoOrder(info);
    return info;
}

function fixSpecialCases(info: string): string {
    info = info
        .replace('قطر', 'Gatar')
        .replace('دحه', 'Doha')
        .replace('پرتغال', 'Portugal')
        .replace('فرانسه', 'France')
        .replace('ایتالیا', 'Italy')
        .replace('کاتالنیا', 'Catalunya')
        .replace('آلمان', 'Germany')
        .replace('بحرین', 'Bahrain')
        .replace('امیلیا-رمانیا', 'Emilia-Romagna')
        .replace('امیلیارمانیا', 'Emilia-Romagna')
        .replace('اسپانیا', 'Spanish')
        .replace('مناک', 'Monaco')
        .replace('جمهری.آذریجان', 'Azerbaijan')
        .replace('اتریش', 'Austrian')
        .replace('استیریا', 'Styria')
        .replace('مجارستان', 'Hungarian')
        .replace('بریتانیا', 'British')
        .replace('گرند.پری', 'Grand-Prix')
        .replace('بلژیک', 'Belgium')
        .replace('تسکانی', 'Tuscan')
        .replace('رسیه', 'Russian')
        .replace('آیفل', 'Eifel')
        .replace('ترکیه', 'Turkish')
        .replace('صخیر', 'Sakhir')
        .replace('ابظبی', 'Abu-Dhabi')
        .replace('خرز', 'Jerez')
        .replace('اندلس', 'Andalucia')
        .replace('جمهری.چک', 'Czech-Republic')
        .replace('سن.مارین', 'Lenovo-San-Marino')
        .replace('آراگن', 'Aragon')
        .replace('ترئل', 'Teruel')
        .replace('ارپا', 'Europa')
        .replace('النسیا', 'Valenciana')
        .replace('دیتنا', 'Daytona')
        .replace('آتلانتا', 'Atlanta')
        .replace('آرلینگتن', 'Arlington')
        .replace('تمپا', 'Tampa')
        .replace('سن.دیگ', 'San-Diego')
        .replace('گلندیل', 'Glendale')
        .replace('اکلند', 'Oakland')
        .replace('آناهایم', 'Anaheim')
        .replace('سنت.لئیس', 'St-Louis');

    return info.replace(/.+\.\d\d\d\d?p/, (res: string) => res.split('.').reverse().join('.'));
}

export function handleLinksExtraStuff(downloadLinks: DownloadLink[]): DownloadLink[] {
    for (let i = 0; i < downloadLinks.length; i++) {
        if (downloadLinks[i].info.includes('OVA') && downloadLinks[i].season === 1) {
            downloadLinks[i].season = 0;
        }
    }
    return downloadLinks;
}
