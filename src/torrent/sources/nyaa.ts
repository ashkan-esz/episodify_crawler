import axios from 'axios';
import * as cheerio from 'cheerio';
import {
    CrawlerExtraConfigs,
    CrawlerLinkType,
    DownloadLink,
    MovieType,
    PageState,
    PageType,
    SourceConfig,
    SourceExtractedData,
    TorrentTitle,
} from '@/types';
import { saveError } from '@utils/logger';
import { replaceSpecialCharacters } from '@utils/crawler';
import { releaseRegex, releaseRegex2 } from '@utils/linkInfo';
import { saveLinksStatus } from '@/searchTools';
import save from '@/save';
import { addPageLinkToCrawlerStatus } from '@/status/status';
import * as Torrent from '@/torrent/torrent';

export default async function nyaa(
    sourceConfig: SourceConfig,
    pageCount: number | null,
    extraConfigs: CrawlerExtraConfigs,
): Promise<number[]> {
    try {
        saveLinksStatus(sourceConfig.movie_url, PageType.MainPage, PageState.Fetching_Start);
        const res = await axios.get(sourceConfig.movie_url);
        saveLinksStatus(sourceConfig.movie_url, PageType.MainPage, PageState.Fetching_End);

        const $ = cheerio.load(res.data);
        const titles = extractLinks($, sourceConfig.movie_url, sourceConfig);

        const linksCount = titles.reduce((acc, item) => acc + item.links.length, 0);

        // console.log(JSON.stringify(titles, null, 4));

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
        if (error.code === 'EAI_AGAIN') {
            if (extraConfigs.retryCounter < 2) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                extraConfigs.retryCounter++;
                return await nyaa(sourceConfig, pageCount, extraConfigs);
            }
            return [1, 0];
        }
        if (
            [500, 504, 521, 522, 525].includes(error.response?.status) &&
            extraConfigs.retryCounter < 2
        ) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            extraConfigs.retryCounter++;
            return await nyaa(sourceConfig, pageCount, extraConfigs);
        }
        if (![521, 522, 525].includes(error.response?.status)) {
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
        const searchUrl = sourceUrl + searchTitle;
        saveLinksStatus(sourceUrl, PageType.MainPage, PageState.Fetching_Start);
        const res = await axios.get(searchUrl);
        saveLinksStatus(sourceUrl, PageType.MainPage, PageState.Fetching_End);

        const $ = cheerio.load(res.data);
        let titles = extractLinks($, sourceUrl, sourceConfig);

        if (extraConfigs.equalTitlesOnly) {
            titles = titles.filter((t) => t.title === title);
        } else {
            titles = titles.slice(0, 5);
        }

        const linksCount = titles.reduce((acc, item) => acc + item.links.length, 0);

        // console.log(JSON.stringify(titles, null, 4))
        // return

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
    } catch (error) {
        saveError(error);
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
        type: titleData.type || MovieType.ANIME_SERIAL,
        year: titleData.year,
        pageNumber: 1,
        //----------
        pageLink: '#' + titleData.title.replace(/\s+/g, '-'),
        downloadLinks: [],
        watchOnlineLinks: [],
        torrentLinks: titleData.links,
        persianSummary: '',
        poster: '',
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
            if (href?.match(/\d+\.torrent/i)) {
                let infoNode = $($a[i]).parent().prev().children();
                if (infoNode.length > 1) {
                    infoNode = infoNode[infoNode.length - 1];
                }
                let info = $(infoNode).text();
                info = fixLinkInfo(info);
                if (
                    info.match(/\(\d{4}\)/) ||
                    info.includes(' complete') ||
                    info.includes(' vostfr') ||
                    info.match(/\s\d+ ~ \d+/) ||
                    info.match(/-\s\d+-\d+\s/)
                ) {
                    continue;
                }

                let animeType = MovieType.ANIME_SERIAL;
                if (info.match(/(\s|-|_|\+)movie/)) {
                    animeType = MovieType.ANIME_MOVIE;
                }

                const title = getTitle(info);
                if (title.match(/\svol\s\d/i)) {
                    continue;
                }

                const se = Torrent.fixSeasonEpisode(info, false);
                const sizeText = $($($a[i]).parent().next())?.text() || '';
                const size = Torrent.getFixedFileSize($, sizeText);

                const link: DownloadLink = {
                    link: sourceUrl.split(/\/\?/)[0] + href,
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
                    (item) =>
                        item.title.replace(/\s+/g, '') === title.replace(/\s+/g, '') &&
                        item.type === animeType,
                );
                if (findResult) {
                    findResult.links.push(link);
                } else {
                    titles.push({
                        title: title,
                        type: animeType,
                        links: [link],
                        year: '',
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
        .replace(/s\d+\s+-\s+\d+/i, (r: string) => r.replace(/\s+-\s+/, 'E')) // S2 - 13
        .replace(/(?<!(part|\.))\s\d+\s+-\s+\d+\s/i, (r: string) =>
            r.replace(/^\s/, '.S').replace(/\s+-\s+/, 'E'),
        ) // 12 - 13
        .replace(/\s-\s(?=s\d+e\d+)/i, '.')
        .replace(/\.\s?(mkv|mp4|avi|wmv)/, '')
        .trim();

    info = Torrent.normalizeSeasonText(info.toLowerCase());

    const quality = info.match(/\s[\[(](web\s)?\d\d\d\d?p[\])]/gi);
    if (quality) {
        const temp = quality[0].match(/\d\d\d\d?p/i)?.[0];
        if (temp) {
            info = temp + '.' + info.replace(quality[0], '');
        }
    }
    info = info.replace(/([a-zA-Z])(?<![se])(?=\d)/g, '$1 ');
    return info;
}

function getTitle(text: string): string {
    text = text
        .split(' - ')[0]
        .replace(/^zip\./, '')
        .replace(/hk-?rip/gi, 'HD-RIP')
        .split(new RegExp(`[\(\\[](${releaseRegex.source}|BD)`, 'i'))[0]
        .split(new RegExp(`[\(\\[](${releaseRegex2.source}|BD)`, 'i'))[0]
        .split(Torrent._japaneseCharactersRegex)[0]
        .split(/_-_\d+/g)[0]
        .split(/_\d+-\d+_/g)[0]
        .replace(/^\d\d\d\d?p\./, '')
        .replace(/(\s\d\d+)?\.(mkv|mp4|avi|wmv)/, '')
        .replace(/\sii+$/, '')
        .replace(/\s\(\d{4}\)/, '')
        .split(/[\[？|]/g)[0]
        .split(/\s\((web|dvd|raw|vhd|ld|jpbd)/)[0]
        .split(/\s\(?(480|720|1080|2160)p/)[0]
        .split(/_\(\d+x\d+/)[0]
        .trim()
        .replace(/(?<!(movie))\s?(_\d+\s?)+_?$/, '')
        .replace(/\s\(\d+-\d+\)\s*$/, '')
        .replace(/\send$/, '')
        .replace(/\s\((ja|ca)\)$/, '')
        .replace(/\s\(((un)?censored\s)?[a-zA-Z]+\ssub\)$/, '')
        .replace(/\ss0?1$/, '')
        .replace(/\s\(?dual audio\)?/, '')
        .replace(/ovas$/, 'ova')
        .replace(/(\s|-|_|\+)movie('?)(s?)$/, '')
        .trim();

    const splitArr = text.split(/\s|\./g);
    const index = splitArr.findIndex((item: string) => item.match(/s\d+e\d+/));
    if (index !== -1) {
        let temp = replaceSpecialCharacters(splitArr.slice(0, index).join(' '));
        if (index <= splitArr.length && temp.endsWith('season')) {
            temp = temp.replace(/\sseason$/, '');
        }
        return Torrent.removeSeasonText(temp);
    }

    text = text.replace(/\s\d\d\d*-\d\d\d*$/, '');
    const temp = replaceSpecialCharacters(text);
    return Torrent.removeSeasonText(temp);
}
