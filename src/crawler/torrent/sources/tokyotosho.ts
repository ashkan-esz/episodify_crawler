import axios from 'axios';
import * as cheerio from 'cheerio';
import { saveLinksStatus } from '@/crawler/searchTools';
import {
    CrawlerExtraConfigs,
    CrawlerLink,
    CrawlerLinkType,
    MovieType,
    PageState,
    PageType,
    SourceConfig,
    SourceExtractedData,
    TorrentTitle,
} from '@/types';
import { replaceSpecialCharacters } from '@/utils/crawler';
import { releaseRegex, releaseRegex2 } from '@/utils/linkInfo';
import save from '@crawler/save';
import { addPageLinkToCrawlerStatus } from '@crawler/status/status';
import * as Torrent from '@crawler/torrent/torrent';
import { saveError } from '@utils/logger';


export default async function tokyotosho(
    sourceConfig: SourceConfig,
    pageCount: number,
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
                return await tokyotosho(sourceConfig, pageCount, extraConfigs);
            }
            return [1, 0];
        }
        if (
            [500, 504, 521, 522, 525].includes(error.response?.status) &&
            extraConfigs.retryCounter < 2
        ) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            extraConfigs.retryCounter++;
            return await tokyotosho(sourceConfig, pageCount, extraConfigs);
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
        const searchUrl = `${sourceUrl.split('/?')[0]}/search.php?terms=${searchTitle}&type=1&searchName=true`;
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
    } catch (error: any) {
        if (error.response?.status !== 521 && error.response?.status !== 522) {
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
            let info = fixLinkInfo($($a[i]).text());
            if (ignoreLink(info)) {
                continue;
            }

            if ($($a[i]).parent().hasClass('desc-top')) {
                let animeType = MovieType.ANIME_SERIAL;
                if (info.includes(' movie')) {
                    animeType = MovieType.ANIME_MOVIE;
                }

                let title = getTitle(info);
                let se = Torrent.fixSeasonEpisode(info, false);
                let sizeText = $($($a[i]).parent().parent().next().children()[0])?.text() || '';
                sizeText =
                    sizeText
                        .split('|')
                        .find((item: string) => item.toLowerCase().includes('size'))
                        ?.trim() || sizeText;
                const size = Torrent.getFixedFileSize($, sizeText);

                if (size > 10 * 1024) {
                    //size > 10gb
                    continue;
                }

                const type = href.startsWith('magnet:')
                    ? CrawlerLinkType.MAGNET
                    : href.includes('/torrent') || href.endsWith('.torrent')
                      ? CrawlerLinkType.TORRENT
                      : CrawlerLinkType.DIRECT;

                if (type === CrawlerLinkType.MAGNET) {
                    info = fixLinkInfo($($a[i]).next().text());
                    if (ignoreLink(info)) {
                        continue;
                    }
                    if (info.includes(' movie')) {
                        animeType = MovieType.ANIME_MOVIE;
                    }
                    title = getTitle(info);
                    se = Torrent.fixSeasonEpisode(info, false);
                }

                const yearMatch = title.match(/(?<!(at|of))\s\d\d\d\d$/i);
                let year = '';
                if (yearMatch?.[0] && Number(yearMatch[0]) >= 1999 && Number(yearMatch[0]) < 2050) {
                    title = title.replace(yearMatch[0], '').trim();
                    year = Number(yearMatch[0]).toString();
                }

                if (
                    title.match(/\ss\d+$/i) ||
                    title.match(/\svol\s\d/i) ||
                    title.includes('tv complete')
                ) {
                    continue;
                }

                const link: CrawlerLink = {
                    link: href,
                    info: info.replace(/\.+\s+/g, ' '),
                    season: se.season,
                    episode: se.episode,
                    sourceName: sourceConfig.config.sourceName,
                    type: type,
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

function ignoreLink(info: string): boolean {
    return (
        !!info.match(/\(\d{4}\)/) ||
        info.includes('[batch]') ||
        info.includes('(batch)') ||
        info.includes('[rav]')
    );
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
        .replace(/\.\s?(mkv|mp4|avi|wmv)/g, '');

    return Torrent.normalizeSeasonText(info.toLowerCase());
}

function getTitle(text: string): string {
    text = text
        .split(' - ')[0]
        .replace(/\.\s?m4v$/, '')
        .replace(/^zip\./, '')
        .replace(/hk-?rip/gi, 'HD-RIP')
        .replace(/\sblu(\s|-)ray/, '')
        .split(new RegExp(`[\(\\[](${releaseRegex.source}|BD)`, 'i'))[0]
        .split(new RegExp(`[\(\\[](${releaseRegex2.source}|BD)`, 'i'))[0]
        .split(Torrent._japaneseCharactersRegex)[0]
        .split(/_-\s?_\d+/g)[0]
        .split(/_\d+-\d+_/g)[0]
        .replace(/\.+\s+/g, ' ')
        .replace(/\d+v\d/i, (r) => r.split(/v/i)[0])
        .replace(/(\s\d\d+\s)\[[a-zA-Z\d]+]$/, '')
        .replace(/\s\d\d+$/, '')
        .replace(/\s\(([a-zA-Z]{3,4}\s)?\d{4}\)/, '')
        .split('[')[0]
        .split(/\s\d+-\d+\s*_?\s?$/g)[0]
        .split(/\s\((web|dvd|raw|vhd|ld|jpbd)/)[0]
        .split(/\s\d+\s\((480|720|1080|2160)p/)[0]
        .split(/\s\(?(480|720|1080|2160)([p)])/)[0]
        .split(/((\s|-|_)\d+)+(_|\s)+\(\d+x\d+/)[0]
        .split(/(\.|\s)sdr(\.|\s)/g)[0]
        .split(/\sep\d/)[0]
        .replace(/(?<!(movie))\s_\d+\s?_$/, '')
        .replace(/\s\(?(ja|ca|sp|op)\)?\s*$/, '')
        .replace(/\s\(((un)?censored\s)?[a-zA-Z]+\ssub\)$/, '')
        .replace(/\ss0?1$/, '')
        .replace(/\sfilms?$/, '')
        .trim();

    text = text.replace(/(?<!(\d|th|nd))\sseason(?=(\.s\d+e\d+))/, ''); // up na ken season.s2e01 --> up na ken

    // let year = new Date().getFullYear();
    // text = text.split(new RegExp(`\\s${year}\\s(480\|720p\|1080\|2160p)p`))[0];
    text = text.split(new RegExp(`(\\s\|\\.)\\d{4}(\\s\|\\.)(480\|720p\|1080\|2160p)p`))[0];

    const splitArr = text.split(/\s|\./g);
    // console.log(splitArr);
    const index = splitArr.findIndex((item: string) => item.match(/s\d+e\d+/));
    if (index !== -1) {
        let temp = splitArr.slice(0, index).join(' ').split('(')[0];
        temp = temp
            .replace(
                /\s(tv|OVA|ONA|OAD|NCED|NCOP|Redial)\s\d+([-,]\d+)*(\s\(engsubs?\))?(\+[a-z]+)?$/i,
                '',
            )
            .replace(/\s\d+([-,]\d+)+\s\(engsubs?\)$/, '')
            .replace(/\s\d\d\d+-\d\d\d+$/, '')
            .split('(')[0];
        temp = replaceSpecialCharacters(temp);
        return Torrent.removeSeasonText(temp);
    }

    text = text
        .replace(/\s\(\d\d\d+x\d\d\d+\)$/, '')
        .replace(
            /\s(tv|OVA|ONA|OAD|NCED|NCOP|Redial)\s\d+([-,]\d+)*(\s\(engsubs?\))?(\+[a-z]+)?$/i,
            '',
        )
        .replace(/\s\d+([-,]\d+)+\s\(engsubs?\)$/, '')
        .replace(/\s\d\d\d+-\d\d\d+$/, '')
        .replace(/\s1-\d$/, '')
        .split('(')[0];
    const temp = replaceSpecialCharacters(text);
    return Torrent.removeSeasonText(temp);
}
