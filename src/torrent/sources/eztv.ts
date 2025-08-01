import * as cheerio from 'cheerio';
import {
    type CrawlerExtraConfigs,
    CrawlerLinkType,
    type DownloadLink,
    MovieType,
    PageState,
    PageType,
    type SourceConfig,
    type SourceExtractedData,
    type TorrentTitle,
} from '@/types';
import save from '@services/crawler/save';
import { saveLinksStatus } from '@services/crawler/searchTools';
import { addPageLinkToCrawlerStatus } from '@/status/status';
import { replaceSpecialCharacters } from '@utils/crawler';
import * as FetchUtils from '@utils/fetchUtils';
import { saveError } from '@utils/logger';
import * as Torrent from '../torrent';

export default async function eztv(
    sourceConfig: SourceConfig,
    pageCount: number | null,
    extraConfigs: CrawlerExtraConfigs,
): Promise<number[]> {
    try {
        saveLinksStatus(sourceConfig.movie_url, PageType.MainPage, PageState.Fetching_Start);
        const res = await FetchUtils.myFetch(sourceConfig.movie_url, {
            timeout: 10_000,
            retry: 3,
            retryDelay: 5000,
            retryStatusCodes: [...Torrent._retryStatusCodes],
            headers:{
                Cookie: 'layout=def_wlinks;',
            }
        });
        saveLinksStatus(sourceConfig.movie_url, PageType.MainPage, PageState.Fetching_End);

        const $ = cheerio.load(res);
        const titles = extractLinks($, sourceConfig.movie_url, sourceConfig);

        const linksCount = titles.reduce((acc, item) => acc + item.links.length, 0);

        // logger.info(JSON.stringify(titles, null, 4));
        // return [1, linksCount];

        if (extraConfigs.returnAfterExtraction) {
            return [1, linksCount];
        }

        await Torrent.handleCrawledTitles(
            titles,
            1,
            pageCount,
            saveCrawlData,
            sourceConfig,
            extraConfigs,
        );

        return [1, linksCount]; //pageNumber
    } catch (error: any) {
        if (FetchUtils.checkErrStatusCodeEAI(error)) {
            if (extraConfigs.retryCounter < 2) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                extraConfigs.retryCounter++;
                return await eztv(sourceConfig, pageCount, extraConfigs);
            }
            return [1, 0];
        }

        if (![521, 522, 525].includes(FetchUtils.getErrStatusCode(error))) {
            saveError(error);
        }
        return [1, 0];
    }
}

export async function searchByTitle(
    sourceUrl: string,
    title: string,
    sourceConfig: SourceConfig,
    extraConfigs: CrawlerExtraConfigs,
): Promise<number[] | TorrentTitle[]> {
    try {
        const searchTitle = title.replace(/\s+/g, '+');
        const searchUrl = sourceUrl.split('/home')[0] + '/search/' + searchTitle;

        saveLinksStatus(searchUrl, PageType.MainPage, PageState.Fetching_Start);
        const res = await FetchUtils.myFetch(searchUrl, {
            timeout: 10_000,
            retry: 3,
            retryDelay: 5000,
            retryStatusCodes: [...Torrent._retryStatusCodes],
            headers:{
                Cookie: 'layout=def_wlinks;',
            }
        });
        saveLinksStatus(searchUrl, PageType.MainPage, PageState.Fetching_End);

        const $ = cheerio.load(res);
        let titles = extractLinks($, sourceUrl, sourceConfig);

        if (extraConfigs.equalTitlesOnly) {
            titles = titles.filter((t) => t.title === title);
        } else {
            titles = titles.slice(0, 5);
        }

        const linksCount = titles.reduce((acc, item) => acc + item.links.length, 0);

        // logger.info(JSON.stringify(titles, null, 4))
        // return [1, linksCount];

        if (extraConfigs.returnTitlesOnly) {
            return titles;
        }
        if (extraConfigs.returnAfterExtraction) {
            return [1, linksCount];
        }

        await Torrent.handleSearchedCrawledTitles(
            titles,
            1,
            1,
            saveCrawlData,
            sourceConfig,
            extraConfigs,
        );

        return [1, linksCount]; //pageNumber
    } catch (error: any) {
        if (![521, 522, 525].includes(FetchUtils.getErrStatusCode(error))) {
            saveError(error);
        }

        return [1, 0];
    }
}

async function saveCrawlData(
    titleData: TorrentTitle,
    sourceConfig: SourceConfig,
    extraConfigs: CrawlerExtraConfigs,
): Promise<void> {
    await addPageLinkToCrawlerStatus('#' + titleData.title.replace(/\s+/g, '-'), 1);
    const extractedData: SourceExtractedData = {
        title: titleData.title,
        type: titleData.type || MovieType.SERIAL,
        year: titleData.year,
        pageNumber: 1,
        //----------
        pageLink: '#' + titleData.title.replace(/\s+/g, '-'),
        downloadLinks: [],
        watchOnlineLinks: [],
        torrentLinks: titleData.links,
        persianSummary: '',
        poster: '',
        widePoster: '',
        trailers: [],
        subtitles: [],
        rating: null,
        cookies: [],
    };

    await save(extractedData, sourceConfig, extraConfigs);
}

function extractLinks($: any, sourceUrl: string, sourceConfig: SourceConfig): TorrentTitle[] {
    const $a = $('a');
    let titles: TorrentTitle[] = [];

    for (let i = 0; i < $a.length; i++) {
        try {
            const href = $($a[i]).attr('href');
            if (href?.match(/\.torrent$/i)) {
                let info = $($($a[i]).parent().prev()).text();
                info = fixLinkInfo(info);
                if (info.match(/\(\d{4}\)/)) {
                    continue;
                }

                let title = getTitle(info);
                const yearMatch = title.match(/(?<!(at|of))\s\d\d\d\d/i);
                let year = '';
                if (yearMatch?.[0] && Number(yearMatch[0]) >= 1999 && Number(yearMatch[0]) < 2050) {
                    title = title.replace(yearMatch[0], '').trim();
                    year = Number(yearMatch[0]).toString();
                }
                title = Torrent.removeSeasonText(title);

                const se = Torrent.fixSeasonEpisode(info, false);
                const sizeText = $($($a[i]).parent().next())?.text() || '';
                const size = Torrent.getFixedFileSize($, sizeText);

                if ((se.season === 1 && se.episode === 0) || href.includes('.COMPLETE.')) {
                    continue;
                }

                const link: DownloadLink = {
                    link: href,
                    info: info,
                    season: se.season,
                    episode: se.episode,
                    sourceName: sourceConfig.config.sourceName,
                    type: CrawlerLinkType.TORRENT,
                    size: size, //in mb
                    localLink: '',
                    localLinkExpire: 0,
                    okCount: 0,
                    badCount: 0,
                };

                const findResult = titles.find(
                    (item) => item.title.replace(/\s+/g, '') === title.replace(/\s+/g, ''),
                );

                if (findResult) {
                    findResult.links.push(link);
                } else {
                    titles.push({
                        title: title,
                        type: MovieType.SERIAL,
                        year: year,
                        links: [link],
                    });
                }
            }
        } catch (error) {
            saveError(error);
        }
    }

    titles = Torrent.mergeTitleLinks(titles);
    return titles;
}

function fixLinkInfo(info: string): string {
    info = info
        .trim()
        .replace(/^\[[a-zA-Z\-\s\d]+]\s?/i, '')
        .replace(/\s?\[[a-zA-Z\s\d]+](?=\.)/i, '')
        .replace(/s\d+\s+-\s+\d+/i, (r) => r.replace(/\s+-\s+/, 'E')) // S2 - 13
        .replace(/(?<!(part|\.))\s\d+\s+-\s+\d+\s/i, (r) =>
            r.replace(/^\s/, '.S').replace(/\s+-\s+/, 'E'),
        ) // 12 - 13
        .replace(/\s-\s(?=s\d+e\d+)/i, '.')
        .replace(/\.\s?(mkv|mp4|avi|wmv)/g, '')
        .trim();

    info = Torrent.normalizeSeasonText(info.toLowerCase());

    const quality = info.match(/\s[\[(](web\s)?\d\d\d\d?p[\])]/gi);
    if (quality) {
        const temp = quality[0].match(/\d\d\d\d?p/i)?.[0];
        if (temp) {
            info = temp + '.' + info.replace(quality[0], '');
        }
    }

    return info;
}

function getTitle(text: string): string {
    text = text
        .split(' - ')[0]
        .split(Torrent._japaneseCharactersRegex)[0]
        .split(/_-_\d+/g)[0]
        .split(/_\d+-\d+_/g)[0]
        .replace(/^zip\./, '')
        .replace(/^\d\d\d\d?p\./, '')
        .replace(/(\s\d\d+)?\.\s?(mkv|mp4|avi|wmv)/, '')
        .replace(/\s\(\d{4}\)/, '')
        .split(/[\[？]/g)[0]
        .replace(/\s\((ja|ca|au|uk|us|nz|afl|sp|op)\)$/, '')
        .replace(/\s\(((un)?censored\s)?[a-zA-Z]+\ssub\)$/, '')
        .replace(/\s(au|uk|us|ca|nz|afl|sp|op)(?=(\ss\d+e\d+|$))/, '')
        .replace(/(?<=[a-zA-Z])\ss\s(?=[a-zA-Z])/, 's ')
        .replace(/\sin l a/, ' in la')
        .replace(/\ss0?1$/, '')
        .trim();

    const splitArr = text.split(/\s|\./g);
    const index = splitArr.findIndex((item) => item.match(/s\d+e\d+/));
    if (index !== -1) {
        return replaceSpecialCharacters(splitArr.slice(0, index).join(' '));
    }
    return replaceSpecialCharacters(text);
}
