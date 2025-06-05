import axios from 'axios';
import * as cheerio from 'cheerio';
import { saveLinksStatus } from '@/searchTools';
import {
    CrawlerExtraConfigs,
    CrawlerLinkType,
    DownloadLink,
    MovieType, PageState, PageType,
    SourceConfig,
    SourceExtractedData,
    TorrentTitle,
} from '@/types';
import { replaceSpecialCharacters } from '@utils/crawler';
import { releaseRegex, releaseRegex2 } from '@utils/linkInfo';
import save from '@/save';
import { addPageLinkToCrawlerStatus } from '@/status/status';
import * as Torrent from '@/torrent/torrent';
import { saveError } from '@utils/logger';


export default async function shanaproject(
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
                return await shanaproject(sourceConfig, pageCount, extraConfigs);
            }
            return [1, 0];
        }
        if (
            [500, 504, 521, 522, 525].includes(error.response?.status) &&
            extraConfigs.retryCounter < 2
        ) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            extraConfigs.retryCounter++;
            return await shanaproject(sourceConfig, pageCount, extraConfigs);
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
        const searchUrl = `${sourceUrl.split('/?')[0].replace(/\/$/, '')}/search/?title=${searchTitle}&subber=`;
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
            if ($($a[i]).children().hasClass('release_download')) {
                const href = $($a[i]).attr('href');
                let info = $($($($a[i]).parent().next().children()[1]).children()[2]).text();
                info = fixLinkInfo(info);
                if (info.match(/\(\d{4}\)/) || info.match(/\s\d+ ~/) || info.includes('~hr-gz')) {
                    continue;
                }

                let title = $($($a[i]).prev().prev().prev().children().children()[0])
                    .text()
                    .toLowerCase();
                title = getTitle(title);

                if (title.includes('tv complete')) {
                    continue;
                }

                const yearMatch = title.match(/(?<!(at|of))\s\d\d\d\d$/i);
                let year = '';
                if (yearMatch?.[0] && Number(yearMatch[0]) >= 1999 && Number(yearMatch[0]) < 2050) {
                    title = title.replace(yearMatch[0], '').trim();
                    year = Number(yearMatch[0]).toString();
                }

                const se = Torrent.fixSeasonEpisode(info, false);
                const sizeText = $($($a[i]).prev())?.text() || '';
                const size = Torrent.getFixedFileSize($, sizeText);

                if (size > 10 * 1024) {
                    //size > 10gb
                    continue;
                }

                if (se.episode === 0) {
                    const temp = $($($a[i]).prev().prev().prev().prev()).text();
                    if (!isNaN(temp)) {
                        se.episode = Number(temp);
                    } else if (temp.match(/\d+v\d/)) {
                        se.episode = Number(temp.toLowerCase().split('v')[0]);
                    } else if (temp.match(/\d+-\d+/)) {
                        continue;
                    }
                }

                const link: DownloadLink = {
                    link: sourceUrl.replace(/\/$/, '') + href,
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
                        type: MovieType.ANIME_SERIAL,
                        year: year,
                        links: [link],
                    });
                }
            }
        } catch (error) {
            saveError(error);
        }
    }

    for (let i = 0; i < titles.length; i++) {
        const seasonMatch = titles[i].title.match(/\ss\d+$/gi);
        if (seasonMatch) {
            titles[i].title = titles[i].title.replace(seasonMatch[0], '');
            const season = Number(seasonMatch[0].replace(' s', ''));
            for (let j = 0; j < titles[i].links.length; j++) {
                titles[i].links[j].season = season;
            }
        }
    }

    titles = Torrent.mergeTitleLinks(titles);
    return titles;
}

function fixLinkInfo(info: string): string {
    info = info
        .replace(/^\[[a-zA-Z\-\s\d]+]\s?/i, '')
        .replace(/\s?\[[a-zA-Z\s\d]+](?=\.)/i, '')
        .replace(/s\d+\s+-\s+\d+/i, (r) => r.replace(/\s+-\s+/, 'E')) // S2 - 13
        .replace(/(?<!(part|\.))\s\d+\s+-\s+\d+\s/i, (r) =>
            r.replace(/^\s/, '.S').replace(/\s+-\s+/, 'E'),
        ) // 12 - 13
        .replace(/\s-\s(?=s\d+e\d+)/i, '.')
        .replace(/\.\s?(mkv|mp4|avi|wmv)/g, '')
        .replace(/\s\(?(ja|ca|sp|op)\)?\s*$/, '')
        .replace(/\s\(((un)?censored\s)?[a-zA-Z]+\ssub\)$/, '')
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

function getTitle(title: string): string {
    const currentYear = new Date().getFullYear();

    title = title.split(' - ')[0];
    title = replaceSpecialCharacters(title)
        .replace(' ' + currentYear, '')
        .replace(' ' + (currentYear - 1), '');

    title = title
        .replace(/ blu ray/, '')
        .split(/(\s|\.|_)s\d+e\d+/gi)[0]
        .split(new RegExp(`[\(\\[](${releaseRegex.source}|BD)`, 'i'))[0]
        .split(new RegExp(`[\(\\[](${releaseRegex2.source}|BD)`, 'i'))[0]
        .split(Torrent._japaneseCharactersRegex)[0]
        .split(/_-_\d+/g)[0]
        .split(/_\d+-\d+_/g)[0]
        .split(/(\.|\s)sdr(\.|\s)/g)[0]
        .replace(/\ss0?1$/, '')
        .replace(/\sfilms?$/, '')
        .replace(/\s\(?(ja|ca|sp|op)\)?\s*$/, '');

    title = Torrent.removeSeasonText(title);
    return title;
}
