import { saveCrawlerWarning } from '@/repo/serverAnalysis';
import { MovieType } from '@/types';
import { TitleObj } from '@/types/movie';
import { getFixedSummary } from '@crawler/extractors';
import { MediaProvider } from '@crawler/providers/index';
import { CrawlerErrorMessages } from '@crawler/status/warnings';
import { saveError } from '@utils/logger';
import axios from 'axios';
import { Crawler as CrawlerUtils } from '@/utils';

export class KITSUProvider implements MediaProvider {
    public readonly name = 'KITSU';
    public readonly baseUrl = 'https://kitsu.io';

    constructor() {}

    async getApiData(
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        kitsuID: number,
        year: string,
        type: MovieType,
        // canRetry: boolean,
    ): Promise<any> {
        try {
            const yearMatch = title.match(/\(?\d\d\d\d\)?/g)?.pop() || null;
            if (yearMatch && !year && Number(yearMatch) < 3000) {
                title = title.replace(yearMatch, '').trim();
                year = yearMatch;
            }

            title = title
                .toLowerCase()
                .replace(' all seasons', '')
                .replace(' all', '')
                .replace(' full episodes', '');
            title = CrawlerUtils.replaceSpecialCharacters(title);

            if (kitsuID) {
                const animeUrl = 'https://kitsu.io/api/edge/anime/' + kitsuID;
                let fullData = await this.callApi(animeUrl);
                if (fullData) {
                    fullData = fullData.data;
                    if (fullData) {
                        this.addTitleObjToKitsuData(fullData, year);
                        if (this.checkTitle(fullData, title, [], [], '', '', year, false, type)) {
                            return fullData;
                        }
                    }
                }
            }

            const url = `https://kitsu.io/api/edge/anime?filter[text]=${decodeURIComponent(title)}`;
            let searchResult = await this.callApi(url);
            if (!searchResult || !searchResult.data) {
                return null;
            }
            searchResult = searchResult.data;

            if (!year && searchResult.length > 1) {
                return null;
            }

            for (let i = 0; i < searchResult.length; i++) {
                if (
                    (type.includes('serial') &&
                        year &&
                        searchResult[i].attributes?.startDate?.split('-')[0] !== year &&
                        Number(searchResult[i].attributes.episodeCount) === 0) ||
                    (type.includes('serial') && searchResult[i].attributes.subtype === 'movie') ||
                    (type.includes('movie') &&
                        Number(searchResult[i].attributes.episodeCount) > 1) ||
                    searchResult[i].attributes.subtype === 'music'
                ) {
                    continue;
                }

                //check year
                if (!searchResult[i].attributes.startDate) {
                    continue;
                }
                if (year) {
                    let apiYear = Number(searchResult[i].attributes.startDate.split('-')[0]);
                    if (Math.abs(apiYear - Number(year)) > 1) {
                        continue;
                    }
                }

                if (searchResult[i]) {
                    this.addTitleObjToKitsuData(searchResult[i], year);
                    if (
                        this.checkTitle(searchResult[i], title, [], [], '', '', year, false, type)
                    ) {
                        return searchResult[i];
                    }
                }
            }
            return null;
        } catch (error) {
            saveError(error);
            return null;
        }
    }

    checkTitle(
        data: any,
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        imdbID: string,
        premiered: string,
        titleYear: string,
        yearIgnored: boolean,
        type: MovieType,
    ): boolean {
        return (
            this.normalizeText(title) === this.normalizeText(data.titleObj.title) ||
            (type.includes('movie') &&
                this.normalizeText(title.replace(/\spart\s\d+/, '')) ===
                    this.normalizeText(data.titleObj.title.replace(/\spart\s\d+/, ''))) ||
            this.normalizeSeasonText(title) === this.normalizeSeasonText(data.titleObj.title) ||
            title === data.attributes.slug.replace(/-/g, ' ') ||
            data.titleObj.alternateTitles.includes(title) ||
            data.titleObj.alternateTitles
                .map((item: string) => item.toLowerCase().replace(/:/g, '').replace(/-/g, ' '))
                .includes(title) ||
            data.titleObj.alternateTitles
                .map((item: string) => item.toLowerCase().replace(/:/g, '').replace(/-/g, ' '))
                .includes(title.replace('3rd season', '3')) ||
            data.titleObj.alternateTitles
                .map((item: string) => CrawlerUtils.replaceSpecialCharacters(item))
                .includes(title) ||
            data.titleObj.alternateTitles.some(
                (item: string) => this.normalizeText(item) === this.normalizeText(title),
            ) ||
            data.titleObj.titleSynonyms.includes(title) ||
            data.titleObj.rawTitle.toLowerCase().includes('"' + title + '"')
        );
    }

    getEditedTitle(title: string): string {
        return title;
    }

    normalizeText(text: string): string {
        return CrawlerUtils.replaceSpecialCharacters(text)
            .replace(' movie', '')
            .replace('chapter', 'movie')
            .replace('specials', 'ova')
            .replace(/\sthe animation(\s\d+)?(\stv)?$/, '')
            .replace(/tv|the|precent|will|\s+/g, '')
            .replace(/volume \d/, (res) => res.replace('volume', 'vol'))
            .replace(/[ck]/g, 'c')
            .replace(/wo|ou/g, 'o')
            .replace(/ai|an/g, 'a')
            .trim();
    }

    private normalizeSeasonText(text: string): string {
        return text
            .replace('2nd season', '2')
            .replace('2nd attack', '2')
            .replace('zoku hen', 'season 2')
            .replace('3rd season', '3')
            .replace('season 3', '3')
            .replace(/\dth season/, (r) => r.replace('th season', ''))
            .replace(/season \d/, (r) => r.replace('season ', ''))
            .replace(/[ck]/g, 'c');
    }

    private addTitleObjToKitsuData(apiData: any, year: string): any {
        const yearRegex = new RegExp(` \\(?${year}\\)?\$`);
        const titleObj: TitleObj = {
            title: CrawlerUtils.replaceSpecialCharacters(
                apiData.attributes.canonicalTitle.toLowerCase(),
            ).replace(yearRegex, ''),
            rawTitle: apiData.attributes.canonicalTitle
                .replace(/^["']|["']$/g, '')
                .replace(/volume \d/i, (res: string) => res.replace('Volume', 'Vol'))
                .replace(/!+/g, '!')
                .replace(yearRegex, ''),
            alternateTitles: [],
            titleSynonyms: [],
            jikanID: 0,
        };
        const temp = CrawlerUtils.removeDuplicateElements(
            [
                apiData.attributes.titles.en,
                apiData.attributes.titles.en_jp,
                apiData.attributes.canonicalTitle,
                ...apiData.attributes.abbreviatedTitles,
            ]
                .filter(Boolean)
                .filter((item) => item !== titleObj.title && item !== titleObj.rawTitle)
                .map((value) =>
                    value
                        .toLowerCase()
                        .replace(/^["'“]|["'”]$/g, '')
                        .replace('\\r\\n', '')
                        .replace(/!+/g, '!')
                        .replace(yearRegex, ''),
                ),
        );
        if (
            temp.length > 1 &&
            temp[1].includes(temp[0].replace('.', '')) &&
            temp[1].match(/(\dth|2nd|3rd) season/gi)
        ) {
            temp.shift();
        }
        titleObj.alternateTitles = temp;
        apiData.titleObj = titleObj;
        return titleObj;
    }

    getApiFields(data: any): KITSUFields | null {
        try {
            const apiFields: KITSUFields = {
                titleObj: data.titleObj,
                kitsuID: Number(data.id),
                summary_en: getFixedSummary(data.attributes.synopsis),
                status: data.attributes.status
                    .toLowerCase()
                    .replace('finished', 'ended')
                    .replace('current', 'running')
                    .replace('unreleased', 'running')
                    .replace('releasing', 'running')
                    .replace('tba', 'to be determined'),
                endYear: data.attributes.endDate?.split('-')[0] || '',
                youtubeTrailer: data.attributes.youtubeVideoId
                    ? `https://www.youtube.com/watch?v=${data.attributes.youtubeVideoId}`
                    : '',
                rated: data.attributes.ageRating
                    ? data.attributes.ageRatingGuide
                        ? data.attributes.ageRating + ' - ' + data.attributes.ageRatingGuide
                        : data.attributes.ageRating
                    : '',
                kitsuPoster: this.getImageUrl(data.attributes.posterImage),
                kitsuPosterCover: this.getImageUrl(data.attributes.coverImage),
                premiered: data.attributes.startDate?.split('-')[0] || '',
                year: data.attributes.startDate?.split('-')[0] || '',
                animeType: data.attributes.subtype || '',
                duration: data.attributes.episodeLength
                    ? data.attributes.episodeLength + ' min'
                    : '',
                totalDuration: data.attributes.totalLength
                    ? data.attributes.totalLength + ' min'
                    : '',
            };
            if (apiFields.duration === '0 min' && apiFields.animeType.toLowerCase() === 'tv') {
                apiFields.duration = '24 min';
            }
            apiFields.rated = apiFields.rated
                .replace('PG -', 'PG-13 -')
                .replace('R - Violence', 'R - 17+ (violence & profanity)')
                .replace(', Profanity', '');
            if (apiFields.rated === 'PG' || apiFields.rated === 'PG-13 - Children') {
                apiFields.rated = 'PG-13 - Teens 13 or older';
            }
            if (apiFields.rated === 'R') {
                apiFields.rated = 'R - 17+ (violence & profanity)';
            }
            apiFields.animeType = apiFields.animeType
                .replace('movie', '')
                .replace('special', 'Special');
            return apiFields;
        } catch (error) {
            saveError(error);
            return null;
        }
    }

    private getImageUrl(imageData: any): string {
        if (!imageData) {
            return '';
        }
        const images = [
            imageData.original,
            imageData.large,
            imageData.medium,
            imageData.small,
            imageData.tiny,
        ];
        for (let i = 0; i < images.length; i++) {
            if (images[i] && !images[i].includes('/icon/')) {
                return images[i];
            }
        }
        return '';
    }

    async callApi(url: string): Promise<any> {
        let waitCounter = 0;
        while (waitCounter < 12) {
            try {
                const response = await axios.get(url, { timeout: 20000 });
                return response.data;
            } catch (error: any) {
                if (error.message === 'timeout of 20000ms exceeded') {
                    return null;
                }
                if (error.response?.status === 429) {
                    //too much request
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    waitCounter++;
                } else if ([500, 521].includes(error.response?.status) && waitCounter < 2) {
                    // failure from kitsu server
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    waitCounter++;
                } else if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
                    error.isAxiosError = true;
                    error.url = url;
                    await saveError(error);
                    return null;
                } else {
                    if (![404, 503, 521].includes(error.response?.status)) {
                        await saveError(error);
                    }
                    return null;
                }
            }
        }
        saveCrawlerWarning(CrawlerErrorMessages.apiCalls.kitsu.lotsOfApiCall);
        return null;
    }
}

export type KITSUFields = {
    titleObj: TitleObj;
    kitsuID: number;
    summary_en: string;
    status: string;
    endYear: string;
    youtubeTrailer: string;
    rated: string;
    kitsuPoster: string;
    kitsuPosterCover: string;
    premiered: string;
    year: string;
    animeType: string;
    duration: string;
    totalDuration: string;
};
