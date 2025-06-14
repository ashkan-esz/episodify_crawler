import config from '@/config';
import { getFixedGenres, getFixedSummary } from '@/extractors';
import { updateCronJobsStatus } from '@/jobs/job.status';
import { MediaProvider } from '@/providers/index';
import * as kitsu from '@/providers/kitsu.provider';
import { addStaffAndCharacters } from '@/providers/staffAndCharacter';
import { CrawlerRepo, Movies as moviesDb } from '@/repo';
import { saveCrawlerWarning } from '@/repo/serverAnalysis';
import { CrawlerErrors } from '@/status/warnings';
import { S3Storage } from '@/storage';
import { MovieType, VPNStatus } from '@/types';
import {
    dataLevelConfig,
    getMovieModel,
    Movie,
    MovieReleaseState,
    MovieStatus,
    TitleObj,
} from '@/types/movie';
import { Crawler as CrawlerUtils } from '@/utils';
import { isValidNumberString } from '@services/crawler/movieTitle';
import {
    checkNeedTrailerUpload,
    uploadTitlePosterAndAddToTitleModel,
    uploadTitleYoutubeTrailerAndAddToTitleModel,
} from '@services/crawler/posterAndTrailer';
import { saveError } from '@utils/logger';
import axios from 'axios';
// @ts-expect-error ...
import isEqual from 'lodash.isequal';
import { LRUCache } from 'lru-cache';
import { ObjectId } from 'mongodb';
import PQueue from 'p-queue';

type RateLimitConfig = {
    minuteLimit: number;
    secondLimit: number;
    minute: number;
    minute_call: number;
    second: number;
    second_call: 0;
};

export class JikanProvider implements MediaProvider {
    public readonly name = 'Jikan';
    public readonly baseUrl = 'https://api.jikan.moe/v4';
    private cache: any;
    private readonly rateLimitConfig: RateLimitConfig = {
        minuteLimit: 60,
        secondLimit: 1,
        minute: new Date().getMinutes(),
        minute_call: 0,
        second: new Date().getSeconds(),
        second_call: 0,
    };

    constructor() {
        this.cache = new LRUCache({
            max: 500,
            maxSize: 5000,
            sizeCalculation: () => {
                return 1;
            },
            ttl: 4 * 60 * 60 * 1000, //4 hour
            ttlResolution: 5 * 1000,
        });
    }

    async getApiData(
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        jikanID: number,
        premiered: string,
        type: MovieType,
        // canRetry: boolean,
    ): Promise<any> {
        try {
            const yearMatch = title.match(/\(?\d\d\d\d\)?/g)?.pop() || null;
            if (yearMatch && !premiered && Number(yearMatch) < 3000) {
                title = title.replace(yearMatch, '').trim();
                premiered = yearMatch;
            }
            // get jikan data directly with jikanID
            if (jikanID) {
                const animeUrl = `https://api.jikan.moe/v4/anime/${jikanID}/full`;
                const fullData = await this.callApi(animeUrl, 0);
                if (fullData) {
                    const allTitles = this.getTitlesFromData(fullData);
                    if (this.checkTitle(title, type, allTitles)) {
                        return this.getModifiedJikanApiData(allTitles, fullData);
                    }
                }
            }

            const jikanSearchResult: any[] = await this.getSearchResult(title, type, premiered);
            if (!jikanSearchResult) {
                return null;
            }

            if (
                type.includes('serial') &&
                jikanSearchResult.length > 1 &&
                (
                    jikanSearchResult[0].title ||
                    (jikanSearchResult[0].titles?.find((t: any) => t.type === 'Default')?.title ??
                        '')
                ).replace(/the|\(tv\)|\s+/gi, '') ===
                    (
                        jikanSearchResult[1].title ||
                        (jikanSearchResult[1].titles?.find((t: any) => t.type === 'Default')
                            ?.title ??
                            '')
                    ).replace(/the|\(tv\)|\s+/gi, '') &&
                jikanSearchResult[0].type.match(/ova|ona/gi) &&
                Number(jikanSearchResult[0].episodes) < Number(jikanSearchResult[1].episodes)
            ) {
                jikanSearchResult.shift();
            }

            for (let i = 0; i < jikanSearchResult.length; i++) {
                if (
                    (type.includes('serial') &&
                        premiered &&
                        jikanSearchResult[i].aired?.from?.split('-')[0] !== premiered &&
                        Number(jikanSearchResult[i].episodes) === 0) ||
                    (type.includes('movie') && Number(jikanSearchResult[i].episodes) > 1)
                ) {
                    continue;
                }

                const allTitles = this.getTitlesFromData(jikanSearchResult[i]);

                if (this.checkTitle(title, type, allTitles)) {
                    const animeUrl = `https://api.jikan.moe/v4/anime/${jikanSearchResult[i].mal_id}/full`;
                    const fullData = await this.callApi(animeUrl, 0);
                    if (!fullData) {
                        return null;
                    }
                    return this.getModifiedJikanApiData(allTitles, fullData);
                }
            }
            return null;
        } catch (error) {
            saveError(error);
            return null;
        }
    }

    async getSearchResult(title: string, type: MovieType, year: string): Promise<any> {
        let searchTitle = title.match(/^\d+$/g) || title.length < 3 ? ' ' + title : title;
        searchTitle = searchTitle.length < 3 ? ' ' + searchTitle : searchTitle;
        let yearSearch = '';
        if (year) {
            const temp = Number(year);
            yearSearch = `&start_date=${temp - 1}-01-01&end_date=${temp + 1}-04-01`;
        }
        const animeSearchUrl =
            `https://api.jikan.moe/v4/anime?q=${searchTitle}&limit=10${yearSearch}`.trim();
        let data = await this.callApi(animeSearchUrl, 0);
        data = data?.data;
        if (!data && title.length === 2) {
            const searchTitle = title.split('').join("'");
            const animeSearchUrl =
                `https://api.jikan.moe/v4/anime?q=${searchTitle}&limit=10${yearSearch}`.trim();
            data = await this.callApi(animeSearchUrl, 0);
            data = data?.data;
        } else if (title.includes('vol ')) {
            const editTitle = title.replace(/(?<=(^|\s))vol \d/, (res) =>
                res.replace('vol', 'volume'),
            );
            if (title !== editTitle) {
                const animeSearchUrl =
                    `https://api.jikan.moe/v4/anime?q=${editTitle}&limit=10${yearSearch}`.trim();
                data = await this.callApi(animeSearchUrl, 0);
                data = data?.data;
            }
        } else if (year && type.includes('movie')) {
            const temp = Number(year);
            const animeSearchUrl =
                `https://api.jikan.moe/v4/anime?q=${searchTitle}&limit=10&start_date=${temp - 1}-01-01`.trim();
            data = await this.callApi(animeSearchUrl, 0);
            data = data?.data;
        }

        return data;
    }

    getEditedTitle(title: string): string {
        return title;
    }

    checkTitle(title: string, type: MovieType, allTitles: any): boolean {
        const {
            apiTitle,
            apiTitle_simple,
            apiTitleEnglish_simple,
            apiTitleJapanese,
            titleSynonyms,
        } = allTitles;

        return (
            title
                .replace(/tv|the|precent|\s+/g, '')
                .replace(/volume \d/, (res) => res.replace('volume', 'vol'))
                .trim() ===
                apiTitle_simple
                    .replace(/the|tv|precent|\s+/g, '')
                    .replace(/volume \d/, (res: string) => res.replace('volume', 'vol'))
                    .trim() ||
            this.normalizeText(title) === this.normalizeText(apiTitle_simple) ||
            this.normalizeText(title) === this.normalizeText(apiTitleEnglish_simple) ||
            title === apiTitleJapanese ||
            titleSynonyms.includes(title) ||
            titleSynonyms
                .map((item: string) => item.replace(/\s+/g, ''))
                .includes(title.replace(/\s+/g, '')) ||
            this.normalizeText(title) ===
                this.normalizeText(apiTitle_simple + ' ' + apiTitleEnglish_simple) ||
            this.normalizeText(title) ===
                this.normalizeText(apiTitle_simple + ' ' + titleSynonyms[0]) ||
            this.normalizeText(title) ===
                this.normalizeText(apiTitle_simple + ' ' + titleSynonyms[1]) ||
            apiTitle.toLowerCase().includes('"' + title + '"')
        );
    }

    normalizeText(title: string): string {
        return CrawlerUtils.replaceSpecialCharacters(title)
            .replace(' movie', '')
            .replace('specials', 'ova')
            .replace('3rd season', '3')
            .replace('season 3', '3')
            .replace(/\dth season/, (r) => r.replace('th season', ''))
            .replace(/season \d/, (r) => r.replace('season ', ''))
            .replace(/\sthe animation(\s\d+)?(\stv)?$/, '')
            .replace(/tv|the|precent|will|\s+/g, '')
            .replace(/volume \d/, (res) => res.replace('volume', 'vol'))
            .replace(/[ck]/g, 'c')
            .replace(/y/g, 'ies')
            .replace(/wo|ou|o+/g, 'o')
            .replace(/ai|ia|s/g, '')
            .replace(/an/g, 'a')
            .trim();
    }

    getApiFields(data: any): JikanFields | null {
        try {
            const apiFields: JikanFields = {
                jikanID: data.mal_id,
                jikanRelatedTitles: this.getRelatedTitles(data),
                summary_en: getFixedSummary(data.synopsis),
                genres: getFixedGenres(data.genres.map((item: any) => item.name)),
                status: data.status.toLowerCase().includes('finished')
                    ? MovieStatus.ENDED
                    : MovieStatus.RUNNING,
                endYear: data.aired.to ? data.aired.to.split('T')[0] || '' : '',
                myAnimeListScore: Number(data.score) || 0,
                youtubeTrailer: data.trailer.url,
                jikanPoster: this.getImageUrl(data),
                updateFields: {
                    rawTitle: data.titleObj.rawTitle
                        .replace(/^["']|["']$/g, '')
                        .replace(/volume \d/i, (res: string) => res.replace('Volume', 'Vol')),
                    premiered: data.aired.from ? data.aired.from.split('T')[0] : '',
                    year: data.aired.from ? data.aired.from.split(/[-–]/g)[0] : '',
                    animeType: data.animeType,
                    duration:
                        data.duration === 'Unknown' ||
                        data.duration === '1 min per ep' ||
                        data.duration.match(/\d+ sec/g)
                            ? ''
                            : CrawlerUtils.convertHourToMinute(
                                  data.duration.replace('per' + ' ep', '').trim(),
                              ).replace('23 min', '24 min'),
                    releaseDay:
                        data.broadcast === null || data.broadcast === 'Unknown'
                            ? ''
                            : data.broadcast.day?.replace(/s$/, '').toLowerCase() || '',
                    rated: data.rating === 'None' ? '' : data.rating || '',
                    animeSource: data.source,
                    animeSeason: data.season?.toLowerCase() || '',
                },
            };
            if (
                apiFields.updateFields.duration === '0 min' &&
                apiFields.updateFields.animeType.toLowerCase() === 'tv'
            ) {
                apiFields.updateFields.duration = '24 min';
            }
            if (
                !apiFields.updateFields.releaseDay &&
                apiFields.updateFields.premiered &&
                apiFields.updateFields.animeType.toLowerCase() === 'tv'
            ) {
                const dayNumber = new Date(data.aired.from).getDay();
                apiFields.updateFields.releaseDay = CrawlerUtils.getDayName(dayNumber);
            }

            apiFields.updateFields = CrawlerUtils.purgeObjFalsyValues(apiFields.updateFields);
            return apiFields;
        } catch (error) {
            saveError(error);
            return null;
        }
    }

    async getCharactersStaff(jikanID: number): Promise<{ characters: any[]; staff: any[] } | null> {
        if (jikanID) {
            const animeCharactersUrl = `https://api.jikan.moe/v4/anime/${jikanID}/characters`;
            const animeCharacters = await this.callApi(animeCharactersUrl, 0);
            const animeStaffUrl = `https://api.jikan.moe/v4/anime/${jikanID}/staff`;
            const animeStaff = await this.callApi(animeStaffUrl, 0);
            if (animeCharacters || animeStaff) {
                return {
                    characters: animeCharacters || [],
                    staff: animeStaff || [],
                };
            }
        }
        return null;
    }

    async getPersonInfo(jikanID: number): Promise<any> {
        if (jikanID) {
            const url = `https://api.jikan.moe/v4/people/${jikanID}`;
            return await this.callApi(url, 8);
        }
        return null;
    }

    async getCharacterInfo(jikanID: number): Promise<any> {
        if (jikanID) {
            const url = `https://api.jikan.moe/v4/characters/${jikanID}`;
            return await this.callApi(url, 8);
        }
        return null;
    }

    private getRelatedTitles(data: any): {
        jikanID: number;
        relation: string;
    }[] {
        if (!data.relations) {
            return [];
        }

        const relatedTitles = [];
        for (let i = 0; i < data.relations.length; i++) {
            let relation = data.relations[i].relation;
            if (relation === 'Character') {
                continue;
            }
            const entry = data.relations[i].entry;
            for (let j = 0; j < entry.length; j++) {
                if (entry[j].type === 'anime') {
                    relatedTitles.push({
                        jikanID: entry[j].mal_id,
                        relation: relation,
                    });
                }
            }
        }
        return relatedTitles;
    }

    private getModifiedJikanApiData(allTitles: any, fullData: any): any {
        delete fullData.title;
        delete fullData.title_english;
        delete fullData.title_japanese;
        delete fullData.title_synonyms;

        const titleObj = this.getTitleObjFromData(allTitles);
        return {
            ...fullData,
            animeType: fullData.type,
            titleObj: titleObj,
        };
    }

    private getTitleObjFromData(allTitles: any): TitleObj {
        const titleObj: TitleObj = {
            title: allTitles.apiTitle_simple,
            rawTitle: allTitles.apiTitle
                .replace(/^["']|["']$/g, '')
                .replace(/volume \d/i, (res: string) => res.replace('Volume', 'Vol')),
            alternateTitles: [],
            titleSynonyms: allTitles.titleSynonyms,
            jikanID: 0,
        };
        const temp = CrawlerUtils.removeDuplicateElements(
            [allTitles.apiTitleEnglish, allTitles.apiTitleJapanese]
                .filter(Boolean)
                .map((value) => value.toLowerCase()),
        );
        if (
            temp.length > 1 &&
            temp[1].includes(temp[0].replace('.', '')) &&
            temp[1].match(/(\dth|2nd|3rd) season/gi)
        ) {
            temp.shift();
        }
        titleObj.alternateTitles = temp;
        return titleObj;
    }

    private async handleRateLimits(): Promise<void> {
        while (true) {
            const now = new Date();
            const minute = now.getMinutes();
            const second = now.getSeconds();
            if (this.rateLimitConfig.minute !== minute) {
                this.rateLimitConfig.minute = minute;
                this.rateLimitConfig.minute_call = 0;
            }
            if (this.rateLimitConfig.second !== second) {
                this.rateLimitConfig.second = second;
                this.rateLimitConfig.second_call = 0;
            }
            if (
                this.rateLimitConfig.second_call < this.rateLimitConfig.secondLimit &&
                this.rateLimitConfig.minute_call < this.rateLimitConfig.minuteLimit
            ) {
                this.rateLimitConfig.minute_call++;
                this.rateLimitConfig.second_call++;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }

    async callApi(url: string, timeoutSec: number): Promise<any> {
        const cacheResult = this.cache.get(url);
        if (cacheResult === 'notfound: jikan error') {
            return null;
        }
        if (cacheResult) {
            return cacheResult;
        }

        let waitCounter = 0;
        while (waitCounter < 12) {
            try {
                // eslint-disable-next-line no-async-promise-executor
                const response: any = await new Promise(async (resolve, reject) => {
                    await this.handleRateLimits();

                    const source = axios.CancelToken.source();
                    const hardTimeout =
                        timeoutSec === 0 ? 3 * 60 * 1000 : 1.5 * timeoutSec * 1000 + 7;
                    const timeoutId = setTimeout(() => {
                        source.cancel('hard timeout');
                    }, hardTimeout);

                    axios
                        .get(url, {
                            cancelToken: source.token,
                            timeout: timeoutSec * 1000,
                        })
                        .then((result) => {
                            clearTimeout(timeoutId);
                            return resolve(result);
                        })
                        .catch((err) => {
                            clearTimeout(timeoutId);
                            return reject(err);
                        });
                });

                let data = response.data.data;
                if (response.data.pagination) {
                    data = {
                        pagination: response.data.pagination,
                        data: response.data.data,
                    };
                }
                this.cache.set(url, { ...data });
                return data;
            } catch (error: any) {
                if (error.response && error.response.status === 429) {
                    //too much request
                    const waitTime = 2000;
                    waitCounter++;
                    await new Promise((resolve) => setTimeout(resolve, waitTime));
                } else if (error.response?.status === 504) {
                    const waitTime = 3000;
                    waitCounter += 3;
                    await new Promise((resolve) => setTimeout(resolve, waitTime));
                } else {
                    if (error.code === 'EAI_AGAIN') {
                        saveCrawlerWarning(CrawlerErrors.api.jikan.eaiError);
                        return null;
                    }
                    if (error.message === 'hard timeout') {
                        return null;
                    }
                    if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
                        error.isAxiosError = true;
                        error.url = url;
                        await saveError(error);
                        return null;
                    }
                    if (
                        error.code === 'ECONNABORTED' ||
                        !error.response ||
                        (error.response &&
                            error.response.status !== 404 &&
                            error.response.status !== 500 &&
                            error.response.status !== 503 &&
                            error.response.status !== 504)
                    ) {
                        await saveError(error);
                    }
                    this.cache.set(url, 'notfound: jikan error');
                    return null;
                }
            }
        }
        saveCrawlerWarning(CrawlerErrors.api.jikan.lotsOfApiCall);
        return null;
    }

    private getTitlesFromData(fullData: any): {
        apiTitle: string;
        apiTitle_simple: string;
        apiTitleEnglish: string;
        apiTitleEnglish_simple: string;
        apiTitleJapanese: string;
        titleSynonyms: string;
    } {
        let apiTitle =
            fullData.title ||
            fullData.titles
                ?.find((t: any) => t.type === 'Default')
                ?.title.replace(/\sthe animation(\s\d+)?(\stv)?$/, '');
        const yearMatch = apiTitle?.match(/\(\d\d\d\d\)/g)?.pop() || null;
        if (yearMatch) {
            apiTitle = apiTitle.replace(yearMatch, '').trim();
        }
        let apiTitle_simple = CrawlerUtils.replaceSpecialCharacters(apiTitle?.toLowerCase() || '');
        const apiTitleEnglish = (
            fullData.title_english ||
            fullData.titles?.find((t: any) => t.type === 'English')?.title ||
            ''
        ).replace(/-....+-/g, '');
        let apiTitleEnglish_simple = CrawlerUtils.replaceSpecialCharacters(
            apiTitleEnglish.toLowerCase(),
        );
        let japaneseTitle = (
            fullData.title_japanese ||
            fullData.titles?.find((t: any) => t.type === 'Japanese')?.title ||
            ''
        ).toLowerCase();
        japaneseTitle = japaneseTitle.includes('movie')
            ? japaneseTitle
            : japaneseTitle.replace(/-....+-/g, '');
        const apiTitleJapanese = CrawlerUtils.replaceSpecialCharacters(japaneseTitle);
        const titleSynonyms =
            fullData.title_synonyms?.map((value: string) => value.toLowerCase()) || [];

        const splitApiTitle = apiTitle_simple.split(' ');
        const splitApiTitle_lastPart = splitApiTitle[splitApiTitle.length - 1];
        if (isValidNumberString(splitApiTitle_lastPart) && Number(splitApiTitle_lastPart) > 2000) {
            const number = splitApiTitle.pop();
            apiTitle_simple = splitApiTitle.join(' ');
            apiTitle = apiTitle.replace(`(${number})`, '').trim();
            apiTitle = apiTitle.replace(number, '').trim();
        }

        apiTitle_simple = apiTitle_simple.replace(/tv/gi, '').replace(/\s\s+/g, ' ').trim();
        apiTitle_simple = apiTitle_simple.replace(/(?<=(^|\s))volume \d/, (res) =>
            res.replace('volume', 'vol'),
        );
        apiTitle = apiTitle.replace('(TV)', '').replace(/\s\s+/g, ' ').trim();
        apiTitle = apiTitle.replace(/(?<=(^|\s))volume \d/i, (res: string) =>
            res.replace('Volume', 'Vol'),
        );
        apiTitleEnglish_simple = apiTitleEnglish_simple
            .replace(/tv/gi, '')
            .replace(/\s\s+/g, ' ')
            .trim();
        apiTitleEnglish_simple = apiTitleEnglish_simple.replace(/(?<=(^|\s))volume \d/i, (res) =>
            res.replace('Volume', 'Vol'),
        );

        return {
            apiTitle,
            apiTitle_simple,
            apiTitleEnglish,
            apiTitleEnglish_simple,
            apiTitleJapanese,
            titleSynonyms,
        };
    }

    private getImageUrl(jikanData: any): string {
        const images: string[] = [
            jikanData.images?.webp?.large_image_url,
            jikanData.images?.jpg?.large_image_url,
            jikanData.images?.webp?.image_url,
            jikanData.images?.jpg?.image_url,
            jikanData.images?.webp?.small_image_url,
            jikanData.images?.jpg?.small_image_url,
        ];
        for (let i = 0; i < images.length; i++) {
            if (images[i] && !images[i].includes('/icon/')) {
                return images[i];
            }
        }
        return '';
    }

    async updateJikanData(isJobFunction: boolean = false) {
        if (isJobFunction) {
            updateCronJobsStatus('updateJikanData', 'comingSoon');
        }
        // reset temp rank
        await CrawlerRepo.resetTempRank(true);
        await CrawlerRepo.changeMoviesReleaseStateDB(
            MovieReleaseState.COMING_SOON,
            'comingSoon_temp_anime',
            [MovieType.ANIME_MOVIE, MovieType.ANIME_SERIAL],
        );
        await this.add_comingSoon_topAiring_Titles(MovieReleaseState.COMING_SOON, 8, isJobFunction);
        await CrawlerRepo.changeMoviesReleaseStateDB(
            'comingSoon_temp_anime',
            MovieReleaseState.WAITING,
            [MovieType.ANIME_MOVIE, MovieType.ANIME_SERIAL],
        );
        await CrawlerRepo.replaceRankWithTempRank('animeTopComingSoon', true);

        if (isJobFunction) {
            updateCronJobsStatus('updateJikanData', 'topAiring');
        }
        // reset temp rank
        await CrawlerRepo.resetTempRank(true);
        await this.add_comingSoon_topAiring_Titles('topAiring', 8, isJobFunction);
        await CrawlerRepo.replaceRankWithTempRank('animeTopAiring', true);

        if (isJobFunction) {
            updateCronJobsStatus('updateJikanData', 'animeSeasonNow');
        }
        // reset temp rank
        await CrawlerRepo.resetTempRank(true);
        await this.add_comingSoon_topAiring_Titles('animeSeasonNow', 4, isJobFunction);
        await CrawlerRepo.replaceRankWithTempRank('animeSeasonNow', true);

        if (isJobFunction) {
            updateCronJobsStatus('updateJikanData', 'animeSeasonUpcoming');
        }
        // reset temp rank
        await CrawlerRepo.resetTempRank(true);
        await this.add_comingSoon_topAiring_Titles('animeSeasonUpcoming', 4, isJobFunction);
        await CrawlerRepo.replaceRankWithTempRank('animeSeasonUpcoming', true);
    }

    private async add_comingSoon_topAiring_Titles(
        mode: string,
        numberOfPage: number,
        isJobFunction: boolean,
    ): Promise<void> {
        const updatePromiseQueue = new PQueue({ concurrency: 25 });
        const insertPromiseQueue = new PQueue({ concurrency: 5 });

        let intervalId = null;
        let page = 1;
        if (isJobFunction) {
            intervalId = setInterval(() => {
                updateCronJobsStatus(
                    'updateJikanData',
                    `Mode: ${mode}, page: ${page}/${numberOfPage},
            insert remained: ${insertPromiseQueue.size + insertPromiseQueue.pending}(-${insertPromiseQueue.pending}),
            update remained: ${updatePromiseQueue.size + updatePromiseQueue.pending}(-${updatePromiseQueue.pending})`.replace(
                        /([\n\t]+)|\s+/g,
                        ' ',
                    ),
                );
            }, 1000);
        }

        let rank = 0;
        for (let k = 1; k <= numberOfPage; k++) {
            page = k;
            let url = '';
            if (mode === 'comingSoon') {
                url = `https://api.jikan.moe/v4/top/anime?filter=upcoming&page=${k}`;
            } else if (mode === 'topAiring') {
                url = `https://api.jikan.moe/v4/top/anime?filter=airing&page=${k}`;
            } else if (mode === 'animeSeasonNow') {
                url = `https://api.jikan.moe/v4/seasons/now?page=${k}`;
            } else {
                url = `https://api.jikan.moe/v4/seasons/upcoming?page=${k}`;
            }

            const apiData = await this.callApi(url, 0);
            if (!apiData) {
                continue;
            }

            let comingSoon_topAiring_titles = apiData.data;
            const uniqueTitles: any = [];
            for (let i = 0; i < comingSoon_topAiring_titles.length; i++) {
                if (
                    !uniqueTitles.find(
                        (t: any) => t.mal_id === comingSoon_topAiring_titles[i].mal_id,
                    )
                ) {
                    uniqueTitles.push(comingSoon_topAiring_titles[i]);
                }
            }
            comingSoon_topAiring_titles = uniqueTitles;

            for (let i = 0; i < comingSoon_topAiring_titles.length; i++) {
                rank++;
                const titleDataFromDB = await CrawlerRepo.searchOnMovieCollectionDB(
                    { 'apiIds.jikanID': comingSoon_topAiring_titles[i].mal_id },
                    {
                        ...dataLevelConfig['medium'],
                        apiIds: 1,
                        castUpdateDate: 1,
                        endYear: 1,
                        poster_s3: 1,
                        poster_wide_s3: 1,
                        trailer_s3: 1,
                    },
                );
                if (titleDataFromDB) {
                    const saveRank = rank;
                    updatePromiseQueue.add(() =>
                        this.update_comingSoon_topAiring_Title(
                            titleDataFromDB,
                            comingSoon_topAiring_titles[i],
                            mode,
                            saveRank,
                        ),
                    );
                } else {
                    const saveRank = rank;
                    insertPromiseQueue.add(() =>
                        this.insert_comingSoon_topAiring_Title(
                            comingSoon_topAiring_titles[i],
                            mode,
                            saveRank,
                        ),
                    );
                }
            }

            if (!apiData.pagination.has_next_page) {
                break;
            }
        }

        await updatePromiseQueue.onIdle();
        await insertPromiseQueue.onIdle();
        if (intervalId) {
            clearInterval(intervalId);
        }
    }

    private async update_comingSoon_topAiring_Title(
        titleDataFromDB: Movie,
        semiJikanData: any,
        mode: string,
        rank: number,
    ): Promise<void> {
        try {
            const updateFields: any = {};

            if (mode === 'comingSoon' || mode === 'animeSeasonUpcoming') {
                if (
                    titleDataFromDB.releaseState !== 'done' &&
                    titleDataFromDB.releaseState !== 'comingSoon' &&
                    titleDataFromDB.releaseState !== 'waiting'
                ) {
                    updateFields.releaseState = 'comingSoon';
                }
            } else {
                // topAiring|animeSeasonNow
                if (titleDataFromDB.releaseState === 'comingSoon') {
                    updateFields.releaseState = 'waiting';
                }
            }
            updateFields.tempRank_anime = rank;

            let jikanApiFields = null;
            if (titleDataFromDB.castUpdateDate !== null) {
                const titles = this.getTitlesFromData(semiJikanData);
                jikanApiFields = this.getApiFields(
                    this.getModifiedJikanApiData(titles, semiJikanData),
                );
            } else {
                //need related titles, doesnt exist in semiJikanData
                const type =
                    semiJikanData.type === 'Movie' ? MovieType.ANIME_MOVIE : MovieType.ANIME_SERIAL;
                const temp = (
                    semiJikanData.title ||
                    (semiJikanData?.titles?.find((t: any) => t.type === 'Default')?.title ?? '')
                ).toLowerCase();
                const title = CrawlerUtils.replaceSpecialCharacters(temp);
                const jikanData = await this.getApiData(
                    title,
                    [],
                    [],
                    semiJikanData.mal_id,
                    '',
                    type,
                    // true,
                );
                if (jikanData) {
                    jikanApiFields = this.getApiFields(jikanData);
                }
            }

            if (jikanApiFields) {
                const keys1 = Object.keys(jikanApiFields.updateFields);
                for (let i = 0; i < keys1.length; i++) {
                    if (
                        // @ts-expect-error ...
                        !isEqual(titleDataFromDB[keys1[i]], jikanApiFields.updateFields[keys1[i]])
                    ) {
                        // @ts-expect-error ...
                        updateFields[keys1[i]] = jikanApiFields.updateFields[keys1[i]];
                    }
                }

                const keys2 = ['genres', 'status', 'endYear'];
                for (let i = 0; i < keys2.length; i++) {
                    // @ts-expect-error ...
                    if (!isEqual(titleDataFromDB[keys2[i]], jikanApiFields[keys2[i]])) {
                        // @ts-expect-error ...
                        updateFields[keys2[i]] = jikanApiFields[keys2[i]];
                    }
                }

                if (titleDataFromDB.apiIds.jikanID !== jikanApiFields.jikanID) {
                    titleDataFromDB.apiIds.jikanID = jikanApiFields.jikanID;
                    updateFields.apiIds = titleDataFromDB.apiIds;
                }

                if (titleDataFromDB.rating.myAnimeList !== jikanApiFields.myAnimeListScore) {
                    titleDataFromDB.rating.myAnimeList = jikanApiFields.myAnimeListScore;
                    updateFields.rating = titleDataFromDB.rating;
                }

                jikanApiFields.summary_en = jikanApiFields.summary_en.replace(/([.…])+$/, '');
                if (
                    titleDataFromDB.summary.english !== jikanApiFields.summary_en &&
                    jikanApiFields.summary_en
                ) {
                    titleDataFromDB.summary.english = jikanApiFields.summary_en;
                    titleDataFromDB.summary.english_source = 'jikan';
                    updateFields.summary = titleDataFromDB.summary;
                }

                if (titleDataFromDB._id) {
                    await this.handleAnimeRelatedTitles(
                        titleDataFromDB._id,
                        jikanApiFields.jikanRelatedTitles,
                    );
                }
            }

            const imageUrl = this.getImageUrl(semiJikanData);
            if (imageUrl && titleDataFromDB.posters.length === 0) {
                await uploadTitlePosterAndAddToTitleModel(titleDataFromDB, imageUrl, updateFields);
            } else if (
                imageUrl &&
                titleDataFromDB.posters.length === 1 &&
                (!titleDataFromDB.poster_s3 || titleDataFromDB.poster_s3.originalUrl !== imageUrl)
            ) {
                await uploadTitlePosterAndAddToTitleModel(
                    titleDataFromDB,
                    imageUrl,
                    updateFields,
                    true,
                );
            }

            if (titleDataFromDB.poster_wide_s3 === null) {
                const KITSU = new kitsu.KITSUProvider();
                const kitsuApiData = await KITSU.getApiData(
                    titleDataFromDB.title,
                    [],
                    [],
                    titleDataFromDB.apiIds.kitsuID,
                    titleDataFromDB.year,
                    titleDataFromDB.type,
                );
                if (kitsuApiData) {
                    const kitsuApiFields = KITSU.getApiFields(kitsuApiData);
                    if (kitsuApiFields && kitsuApiFields.kitsuPosterCover) {
                        const s3WidePoster = await S3Storage.uploadTitlePosterToS3(
                            titleDataFromDB.title,
                            titleDataFromDB.type,
                            titleDataFromDB.year,
                            kitsuApiFields.kitsuPosterCover,
                            false,
                            true,
                        );
                        if (s3WidePoster) {
                            titleDataFromDB.poster_wide_s3 = s3WidePoster;
                            updateFields.poster_wide_s3 = s3WidePoster;
                        }
                    }
                }
            }

            if (checkNeedTrailerUpload(titleDataFromDB.trailer_s3, titleDataFromDB.trailers)) {
                await uploadTitleYoutubeTrailerAndAddToTitleModel(
                    '',
                    titleDataFromDB,
                    semiJikanData.trailer.url,
                    updateFields,
                );
            }

            if (titleDataFromDB.castUpdateDate === null) {
                const allApiData = {
                    jikanApiFields: jikanApiFields || {
                        jikanID: titleDataFromDB.apiIds.jikanID,
                    },
                };
                if (titleDataFromDB._id) {
                    await addStaffAndCharacters(
                        '',
                        titleDataFromDB._id,
                        allApiData,
                        titleDataFromDB.castUpdateDate,
                    );
                    updateFields.castUpdateDate = new Date();
                }
            }

            if (titleDataFromDB._id) {
                await CrawlerRepo.updateMovieByIdDB(titleDataFromDB._id, updateFields);
            }
        } catch (error) {
            saveError(error);
        }
    }

    private async insert_comingSoon_topAiring_Title(
        semiJikanData: any,
        mode: string,
        rank: number,
    ): Promise<string> {
        const type =
            semiJikanData.type === 'Movie' ? MovieType.ANIME_MOVIE : MovieType.ANIME_SERIAL;
        // eslint-disable-next-line no-unsafe-optional-chaining
        const title = CrawlerUtils.replaceSpecialCharacters(
            (
                semiJikanData.title ||
                (semiJikanData.titles?.find((t: any) => t.type === 'Default')?.title ?? '')
            ).toLowerCase(),
        );
        const jikanApiData = await this.getApiData(
            title,
            [],
            [],
            semiJikanData.mal_id,
            '',
            type,
            // true,
        );

        if (jikanApiData) {
            let titleModel = getMovieModel(
                jikanApiData.titleObj,
                '',
                type,
                [],
                [],
                '',
                '',
                '',
                '',
                [],
                [],
                [],
                {
                    poster: VPNStatus.ALL_OK,
                    trailer: VPNStatus.ALL_OK,
                    downloadLink: VPNStatus.ALL_OK,
                },
            );

            const jikanApiFields = this.getApiFields(jikanApiData);
            if (jikanApiFields) {
                titleModel = { ...titleModel, ...jikanApiFields.updateFields };
                titleModel.status = jikanApiFields.status;
                if (config.IGNORE_HENTAI && jikanApiFields.updateFields.rated === 'Rx - Hentai') {
                    return 'ignore hentai';
                }
                if (titleModel.apiIds.jikanID !== jikanApiFields.jikanID) {
                    titleModel.apiIds.jikanID = jikanApiFields.jikanID;
                }
            }

            const imageUrl = this.getImageUrl(jikanApiData);
            await uploadTitlePosterAndAddToTitleModel(titleModel, imageUrl);
            await uploadTitleYoutubeTrailerAndAddToTitleModel(
                '',
                titleModel,
                jikanApiData.trailer.url,
            );

            titleModel.insert_date = new Date(0);
            titleModel.apiUpdateDate = new Date(0);
            if (mode === 'comingSoon' || mode === 'animeSeasonUpcoming') {
                titleModel.releaseState = MovieReleaseState.COMING_SOON;
            } else {
                titleModel.releaseState = MovieReleaseState.WAITING;
            }
            titleModel.tempRank_anime = rank;
            titleModel.movieLang = 'japanese';
            titleModel.country = 'japan';
            titleModel.endYear = jikanApiFields?.endYear || '';
            titleModel.rating.myAnimeList = jikanApiFields?.myAnimeListScore || 0;
            titleModel.summary.english = jikanApiFields?.summary_en.replace(/([.…])+$/, '') ?? '';
            titleModel.summary.english_source = 'jikan';
            titleModel.genres = jikanApiFields?.genres ?? [];

            const KITSU = new kitsu.KITSUProvider();
            const kitsuApiData = await KITSU.getApiData(
                titleModel.title,
                [],
                [],
                titleModel.apiIds.kitsuID,
                titleModel.year,
                titleModel.type,
            );
            if (kitsuApiData) {
                const kitsuApiFields = KITSU.getApiFields(kitsuApiData);
                if (kitsuApiFields && kitsuApiFields.kitsuPosterCover) {
                    const s3WidePoster = await S3Storage.uploadTitlePosterToS3(
                        titleModel.title,
                        titleModel.type,
                        titleModel.year,
                        kitsuApiFields.kitsuPosterCover,
                        false,
                        true,
                    );
                    if (s3WidePoster) {
                        titleModel.poster_wide_s3 = s3WidePoster;
                    }
                }
            }

            const insertedId = await CrawlerRepo.insertMovieToDB(titleModel);

            if (insertedId && jikanApiFields) {
                const allApiData = {
                    jikanApiFields,
                };
                await this.handleAnimeRelatedTitles(insertedId, jikanApiFields.jikanRelatedTitles);
                await addStaffAndCharacters('', insertedId, allApiData, titleModel.castUpdateDate);
                await CrawlerRepo.updateMovieByIdDB(insertedId, {
                    castUpdateDate: new Date(),
                });
            }
        }

        return 'ok';
    }

    async handleAnimeRelatedTitles(titleId: ObjectId | undefined, jikanRelatedTitles: any[]): Promise<void> {
        try {
            if (!titleId) {
                return;
            }

            for (let i = 0; i < jikanRelatedTitles.length; i++) {
                const searchResult = await CrawlerRepo.searchOnMovieCollectionDB(
                    { 'apiIds.jikanID': jikanRelatedTitles[i].jikanID },
                    { _id: 1 },
                );

                if (searchResult && searchResult._id) {
                    await moviesDb.addRelatedMovies(
                        searchResult._id,
                        titleId,
                        jikanRelatedTitles[i].relation,
                    );
                }
            }
        } catch (error) {
            saveError(error);
        }
    }

    getCacheSize(): { size: number; calculatedSize: number; limit: number } {
        return {
            size: this.cache.size,
            calculatedSize: this.cache.calculatedSize,
            limit: 5000,
        };
    }

    flushCachedData(): void {
        this.cache.clear();
    }
}

export type JikanFields = {
    jikanID: number;
    jikanRelatedTitles: { jikanID: number; relation: string }[];
    summary_en: string;
    genres: string[];
    status: MovieStatus;
    endYear: string;
    myAnimeListScore: number;
    youtubeTrailer: string;
    jikanPoster: string;
    updateFields:
        | {
              rawTitle: string;
              premiered: string;
              year: string;
              animeType: string;
              duration: string;
              releaseDay: string;
              rated: string;
              animeSource: string;
              animeSeason: string;
          }
        | Record<string, any>;
};
