import config from '@/config';
import { saveCrawlerWarning } from '@/repo/serverAnalysis';
import { Episode, getEpisodeModel, MovieType } from '@/types';
import { MovieRates } from '@/types/movie';
import { getFixedGenres, getFixedSummary } from '@/extractors';
import { MediaProvider } from '@/providers/index';
import { CrawlerErrors } from '@/status/warnings';
import { saveError } from '@utils/logger';
import axios from 'axios';
import PQueue from 'p-queue';
import { Crawler as CrawlerUtils, logger } from '@/utils';

type ApiKey = {
    apiKey: string;
    callCount: number;
    limit: number;
    firstCallTime: Date;
};

export class OMDBProvider implements MediaProvider {
    public readonly name = 'OMDB';
    public readonly baseUrl = 'https://www.omdbapi.com';
    private apiKeys: ApiKey[] = [];
    private badKeys: string[] = [];

    constructor() {
        this.apiKeys = config.API_KEYS.omdbApiKeys.map((item: string) => {
            return {
                apiKey: item,
                callCount: 0,
                limit: 1000,
                firstCallTime: new Date(0),
            };
        });
    }

    async getApiData(
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        omdbID: string,
        premiered: string,
        type: MovieType,
        canRetry: boolean,
    ): Promise<any> {

        try {
            const originalTitle = title;
            title = title.toLowerCase()
                .replace('!!', '!')
                .replace(' all seasons', '')
                .replace(' all', '')
                .replace(' full episodes', '');
            title = CrawlerUtils.replaceSpecialCharacters(title, ['\'']);

            if (originalTitle.match(/\si+$/) && !canRetry) {
                title = originalTitle;
            }

            const titleYear = premiered.split('-')[0];
            const searchType = (type.includes('movie')) ? 'movie' : 'series';
            const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&type=${searchType}&plot=full`;
            let data;
            let yearIgnored = false;
            if (titleYear) {
                data = await this.callApi(url + `&y=${titleYear}`);
                if (data === null) {
                    data = await this.callApi(url);
                    yearIgnored = true;
                    if (data && data.Year && (Number(data.Year) - Number(titleYear) > 7)) {
                        return null;
                    }
                }
            } else {
                data = await this.callApi(url);
            }

            if (data === null) {
                if (canRetry) {
                    let newTitle = this.getEditedTitle(title);
                    if (newTitle === title) {
                        newTitle = this.getEditedTitleMovie(title);
                    }

                    if (newTitle !== title) {
                        const retryRes = await this.getApiData(newTitle, alternateTitles, titleSynonyms, '', premiered, type, false);
                        if (retryRes) {
                            return retryRes;
                        }
                    }

                    const splitTitle = title.split(" ").filter(item => item.endsWith('s'));
                    for (let i = 0; i < splitTitle.length; i++) {
                        const newSpl = splitTitle[i].replace(/s$/, '\'s');
                        newTitle = title.replace(splitTitle[i], newSpl);
                        const retryRes = await this.getApiData(newTitle, alternateTitles, titleSynonyms, '', premiered, type, false);
                        if (retryRes) {
                            return retryRes;
                        }
                    }

                    if (type.includes('anime')) {
                        newTitle = title.replace(/wo|ou/g, 'o').replace(/uu/g, 'u');
                        if (newTitle !== title) {
                            const retryRes = await this.getApiData(newTitle, alternateTitles, titleSynonyms, '', premiered, type, false);
                            if (retryRes) {
                                return retryRes;
                            }
                        }
                    }
                }
                return null;
            }

            if (
                type.includes('anime') &&
                data.Country.toLowerCase() !== 'n/a' &&
                !data.Country.toLowerCase().includes('japan') &&
                !data.Country.toLowerCase().includes('china') &&
                !data.Country.toLowerCase().includes('korea') &&
                !data.Language.toLowerCase().includes('japanese')
            ) {
                return null;
            }

            if (data) {
                data.yearIgnored = yearIgnored;
            }
            if (this.checkTitle(data, title, alternateTitles, titleSynonyms,'','', titleYear, yearIgnored, type)) {
                return data;
            }
            if (canRetry) {
                let newTitle = this.getEditedTitle(title);
                if (newTitle === title) {
                    newTitle = this.getEditedTitleMovie(title);
                }

                if (newTitle !== title) {
                    const retryRes = await this.getApiData(newTitle, alternateTitles, titleSynonyms,'', premiered, type, false);
                    if (retryRes) {
                        return retryRes;
                    }
                }
            }

            return null;
        } catch (error: any) {
            if (!error.response || error.response.status !== 500) {
                await saveError(error);
            }
            return null;
        }
    }

    getEditedTitle(title: string): string {
        return title
            .replace('!', '')
            .replace('arc', 'ark')
            .replace('5 ', 'go ')
            .replace('hunter x hunter movie 1 phantom rouge', 'gekijouban hunter x hunter fantomu ruju')
            .replace('date a bullet dead or bullet', 'date a bullet zenpen dead or bullet')
            .replace('ookami', 'okami')
            .replace('apple', 'aplle')
            .replace('douchuu', 'dochu')
            .replace('oukoku', 'okoku')
            .replace('suizou wo tabetai', 'suizo o tabetai')
            .replace(' wo ', ' o ')
            .replace(/\swo$/, ' o')
            .replace('yume o minai', 'yume wo minai')
            .replace('yuu yuu', 'yu yu')
            .replace('saibou', 'saibo')
            .replace('youma', 'yoma')
            .replace('yarou', 'yaro')
            .replace(/yuusha/g, 'yusha')
            .replace(/shinchou/g, 'shincho')
            .replace('kazarou', 'kazaro')
            .replace('majuu', 'maju')
            .replace('maid', 'meido')
            .replace('juunin', 'junin')
            .replace('gakkou', 'gakko')
            .replace('makenai love comedy', 'makenai love come')
            .replace('love comedy', 'rabukome')
            .replace('nani ka', 'nanika')
            .replace('drugstore', 'drug store')
            .replace('saikenki', 'saiken ki')
            .replace('maoujou', 'maou jou')
            .replace('oishasan', 'oisha san')
            .replace('tatteiru', 'tatte iru')
            .replace('regenesis', 're genesis')
            .replace('kancolle', 'kan colle')
            .replace('aruiwa', 'arui wa')
            .replace(' the movie', '')
            .replace(' movie ', ' ')
            .replace(' movie', '')
            .replace('summons', 'calls')
            .replace('dont', 'don\'t')
            .replace('wont', 'won\'t')
            .replace('heavens', 'heaven\'s')
            .replace('havent', 'haven\'t')
            .replace(' im ', ' i\'m ')
            .replace(' comedy', ' come')
            .replace(' renai ', ' ren\'ai ')
            .replace(' zunousen', ' zuno sen')
            .replace(' kusoge', ' kusogee')
            .replace(/(?<=(^|\s))vol \d/, (res) => res.replace('vol', 'volume'))
            .replace(' part 1', ' part one')
            .replace(' part 2', ' part two')
            .replace(' part 3', ' part three')
            .replace(' part 4', ' part four')
            .replace(/\s\s+/g, '')
            .replace(/[a-zA-Z]\d/, r => r.split('').join(' '))
            .replace('eiga', '')
            .trim();
    }

    private getEditedTitleMovie(title: string): string {
        return title
            .replace(/(?<=\s)\d$/, r => r
                .replace('4', 'iv')
                .replace('3', 'iii')
                .replace('2', 'ii')
                .replace('1', 'i'))
    }

    getApiFields(data: any, type: MovieType): OMDBFields | null {
        try {
            const apiFields: OMDBFields = {
                imdbID: data.imdbID,
                directorsNames: data.Director.split(',').map((item: string) => item.trim()).filter((value: string) => value && value.toLowerCase() !== 'n/a'),
                writersNames: data.Writer.split(',').map((item: string) => item.trim()).filter((value: string) => value && value.toLowerCase() !== 'n/a'),
                actorsNames: data.Actors.split(',').map((item: string) => item.trim()).filter((value: string) => value && value.toLowerCase() !== 'n/a'),
                summary_en: getFixedSummary(data.Plot),
                genres: data.Genre ? getFixedGenres(data.Genre.split(',')) : [],
                isAnime: (data.Genre?.toLowerCase().includes('anime')),
                rating: data.Ratings ? this.extractRatings(data.Ratings) : {},
                omdbTitle: CrawlerUtils.replaceSpecialCharacters(data.Title.toLowerCase()),
                yearIgnored: data.yearIgnored,
                year: data.Year.split(/[-–]/g)[0],
                poster: data?.Poster?.replace('N/A', '') || "",
                updateFields: {
                    rawTitle: data.Title.trim().replace(/^["']|["']$/g, '').replace(/volume \d/i,
                        (res: string) => res.replace('Volume', 'Vol')),
                    duration: data.Runtime || '0 min',
                    totalSeasons: (type.includes('movie')) ? 0 : Number(data.totalSeasons),
                    rated: data.Rated,
                    movieLang: data.Language.toLowerCase(),
                    country: data.Country.toLowerCase(),
                    boxOffice: (type.includes('movie')) ? data.BoxOffice : '',
                    awards: data.Awards || '',
                },
            };
            apiFields.updateFields = CrawlerUtils.purgeObjFalsyValues(apiFields.updateFields);
            return apiFields;
        } catch (error: any) {
            if (!error.response || error.response.status !== 500) {
                saveError(error);
            }
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
        const originalTitle = title;
        title = CrawlerUtils.replaceSpecialCharacters(originalTitle).replace(/volume \d/, (res) => res.replace('volume', 'vol'));
        alternateTitles = alternateTitles.map(value => CrawlerUtils.replaceSpecialCharacters(value.toLowerCase()).replace('uu', 'u'));
        titleSynonyms = titleSynonyms.map(value => CrawlerUtils.replaceSpecialCharacters(value.toLowerCase()).replace('uu', 'u'));
        const apiTitle = CrawlerUtils.replaceSpecialCharacters(data.Title.toLowerCase().trim());
        const apiTitle2 = CrawlerUtils.replaceSpecialCharacters(data.Title.split('-')[0].replace(/(?<=\d)\.0/, '').toLowerCase().trim());
        const apiYear = data.Year.split(/[-–]/g)[0];
        const matchYear = (type.includes('movie') || yearIgnored) ? Math.abs(Number(titleYear) - Number(apiYear)) <= 1 : true;
        if (!matchYear && titleYear) {
            return false;
        }
        const splitTitle = title.split(' ');
        const splitApiTitle = apiTitle.split(' ');
        let titlesMatched = true;
        for (let i = 0; i < splitTitle.length; i++) {
            if (!splitApiTitle.includes(splitTitle[i])) {
                titlesMatched = false;
                break;
            }
        }

        return (
            (matchYear || (type.includes('anime') && !titleYear)) &&
            (
                this.normalizeText(title) === this.normalizeText(apiTitle) ||
                this.normalizeText(title).replace(titleYear, '') === this.normalizeText(apiTitle).replace(titleYear, '') ||
                this.normalizeText(title) === this.normalizeText(apiTitle2) ||
                title.replace('uu', 'u') === apiTitle.replace('uu', 'u') ||
                (originalTitle.includes('the movie:') && title.replace('the movie', '').replace(/\s\s+/g, ' ') === apiTitle) ||
                alternateTitles.includes(apiTitle.replace('uu', 'u')) ||
                titleSynonyms.includes(apiTitle.replace('uu', 'u')) ||
                (!type.includes('anime') && titlesMatched) ||
                title.replace('summons', 'calls') === apiTitle.replace('summons', 'calls') ||
                (splitTitle.length > 8 && apiTitle.includes(title))
            )
        );
    }

    normalizeText(text: string): string {
        return CrawlerUtils.replaceSpecialCharacters(text)
            .replace(/[\[\]]/g, '')
            .replace(' movie', '')
            .replace('specials', 'ova')
            .replace('3rd season', '3')
            .replace('season 3', '3')
            .replace(/\dth season/, r => r.replace('th season', ''))
            .replace(/season \d/, r => r.replace('season ', ''))
            .replace(/\s?the animation(\s\d+)?(\stv)?$/, '')
            .replace(/tv|the|precent|will|\s+/g, '')
            .replace(/volume \d/, (res) => res.replace('volume', 'vol'))
            .replace(/(\s+|precent|movie|eiga|gekijou?ban)/gi, '')
            .replace(/[ck]/g, 'c')
            .replace(/wo|ou|o+/g, 'o')
            .replace(/ai|ia|s/g, '')
            .replace(/an/g, 'a')
            .trim();
    }

    async callApi(url: string): Promise<any> {
        try {
            let key = null;
            let response;
            while (true) {
                try {
                    key = this.getApiKey();
                    if (!key) {
                        if (config.DEBUG_MODE) {
                            logger.warn('ERROR: more omdb api keys are needed');
                        } else {
                            saveCrawlerWarning(CrawlerErrors.api.omdb.moreApiKeyNeeded);
                        }
                        return null;
                    }
                    response = await axios.get(url + `&apikey=${key.apiKey}`);
                    break;
                } catch (error: any) {
                    if (
                        (error.response && error.response.data.Error === 'Request limit reached!') ||
                        (error.response && error.response.status === 401)
                    ) {
                        if (error.response.data.Error && error.response.data.Error !== 'Request limit reached!' && key) {
                            if (config.DEBUG_MODE) {
                                console.log(`ERROR: Invalid omdb api key: ${key.apiKey}, (${error.response.data?.Error})`);
                            } else {
                                const m = CrawlerErrors.api.omdb.invalid(key.apiKey, error.response.data?.Error)
                                saveCrawlerWarning(m);
                            }
                            key.limit = 0;
                        }
                        if (key) {
                            key.callCount = key.limit + 1;
                        }
                    } else if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
                        error.isAxiosError = true;
                        error.url = url;
                        await saveError(error);
                        return null;
                    } else {
                        if (error.code === 'EAI_AGAIN') {
                            saveCrawlerWarning(CrawlerErrors.api.omdb.eaiError);
                            continue;
                        } else if (error.response?.status !== 500 &&
                            error.response?.status !== 503 &&
                            error.response?.status !== 520 &&
                            error.response?.status !== 521 &&
                            error.response?.status !== 522 &&
                            error.response?.status !== 524) {
                            saveError(error);
                        }
                        return null;
                    }
                }
            }

            if (
                response.data.Response === 'False' ||
                (response.data.Error && response.data.Error.includes('not found'))
            ) {
                return null;
            }
            return response.data;
        } catch (error: any) {
            if (error.response?.status !== 500 &&
                error.response?.status !== 503 &&
                error.response?.status !== 520 &&
                error.response?.status !== 521 &&
                error.response?.status !== 524) {
                await saveError(error);
            }
            return null;
        }
    }

    private extractRatings(ratings: any): MovieRates {
        const ratingObj: any = {};
        for (let i = 0; i < ratings.length; i++) {
            const sourceName = ratings[i].Source.toLowerCase();
            if (sourceName === "internet movie database") {
                ratingObj.imdb = Number(ratings[i].Value.split('/')[0]);
            }
            if (sourceName === "rotten tomatoes") {
                ratingObj.rottenTomatoes = Number(ratings[i].Value.replace('%', ''));
            }
            if (sourceName === "metacritic") {
                ratingObj.metacritic = Number(ratings[i].Value.split('/')[0]);
            }
        }
        return ratingObj;
    }

    async getEpisodesData(
        omdbTitle: string,
        yearIgnored: boolean,
        totalSeasons: any,
        premiered: string,
        lastSeasonsOnly: boolean = false,
        ): Promise<Episode[] | null> {
        try {
            const titleYear = premiered.split('-')[0];
            let episodes: Episode[] = [];
            totalSeasons = isNaN(totalSeasons) ? 0 : Number(totalSeasons);
            const startSeasonNumber = (lastSeasonsOnly && totalSeasons > 1) ? totalSeasons - 1 : 1;
            const promiseArray = [];

            for (let j = startSeasonNumber; j <= totalSeasons; j++) {
                let url = `https://www.omdbapi.com/?t=${omdbTitle}&Season=${j}&type=series`;
                if (!yearIgnored) {
                    url += `&y=${titleYear}`;
                }
                const seasonResult = await this.callApi(url);

                if (seasonResult !== null && seasonResult.Title.toLowerCase() === omdbTitle.toLowerCase()) {
                    const thisSeasonEpisodes = seasonResult.Episodes;
                    const seasonsEpisodeNumber = Number(thisSeasonEpisodes[thisSeasonEpisodes.length - 1].Episode);

                    for (let k = 1; k <= seasonsEpisodeNumber; k++) {
                        const searchYear = !yearIgnored ? `&y=${titleYear}` : '';
                        const episodeResultPromise = this.getEpisodesOfSeason(omdbTitle, searchYear, episodes, thisSeasonEpisodes, j, k);
                        promiseArray.push(episodeResultPromise);
                    }
                }
            }

            await Promise.allSettled(promiseArray);
            episodes = episodes.sort((a: Episode, b: Episode) => {
                const s1 = a.season ?? 0;
                const s2 = b.season ?? 0;
                const e1 = a.episode ?? 0;
                const e2 = b.episode ?? 0;
                return ((s1 > s2) || (s1 === b.season && e1 > e2)) ? 1 : -1;
            });

            return episodes;
        } catch (error: any) {
            if (!error.response || error.response.status !== 500) {
                await saveError(error);
            }
            return null;
        }
    }

    private getEpisodesOfSeason(
        omdbTitle: string,
        searchYear: string,
        episodes: any[],
        seasonEpisodes: any[],
        j: number,
        k: number,): Promise<any> {
        const url = `https://www.omdbapi.com/?t=${omdbTitle}&Season=${j}&Episode=${k}&type=series` + searchYear;
        return this.callApi(url).then(episodeResult => {
            const lastEpisodeDuration = (episodes.length === 0) ? '0 min' : episodes[episodes.length - 1].duration;
            if (episodeResult === null) {
                const episodeModel = getEpisodeModel(
                    'unknown', 'unknown', '',
                    lastEpisodeDuration, j, k,
                    '0', '');
                episodes.push(episodeModel);
            } else {
                let releaseDate = 'unknown';
                for (let i = 0; i < seasonEpisodes.length; i++) {
                    if (seasonEpisodes[i].Episode === episodeResult.Episode) {
                        releaseDate = seasonEpisodes[i].Released;
                        break;
                    }
                }

                const episodeModel = getEpisodeModel(
                    episodeResult.Title, releaseDate, '',
                    episodeResult.Runtime, Number(episodeResult.Season), Number(episodeResult.Episode),
                    episodeResult.imdbRating, episodeResult.imdbID);
                episodes.push(episodeModel);
            }
        });
    }

    private getApiKey(): ApiKey | null {
        this.freeApiKeys();
        const activeKeys = this.apiKeys.filter(item => item.limit > item.callCount);
        const usedKeys = activeKeys.filter(item => item.callCount > 0);
        const keys = usedKeys.length > 6
            ? usedKeys.sort((a, b) => a.callCount - b.callCount)
            : activeKeys.sort((a, b) => a.callCount - b.callCount);

        if (keys.length === 0) {
            return null;
        }
        if (keys[0].callCount === 0) {
            keys[0].firstCallTime = new Date();
        }
        keys[0].callCount++;
        return keys[0];
    }

    private freeApiKeys(): void {
        const now = new Date();
        for (let i = 0; i < this.apiKeys.length; i++) {
            if (
                this.apiKeys[i].firstCallTime &&
                CrawlerUtils.getDatesBetween(now, this.apiKeys[i].firstCallTime).hours >= 12
            ) {
                this.apiKeys[i].callCount = 0;
                this.apiKeys[i].firstCallTime = new Date(0);
            }
        }
    }

    async checkOmdbApiKeys(): Promise<{
        badKeys: string[];
        totalKeys: number;
    }> {
        const badKeys: string[] = [];

        const promiseQueue = new PQueue({ concurrency: 3 });
        for (let i = 0; i < this.apiKeys.length; i++) {
            promiseQueue.add(() =>
                axios
                    .get(`https://www.omdbapi.com/?t=attack&apikey=${this.apiKeys[i].apiKey}`)
                    .then((response) => {
                        if (
                            response.data.Response === 'False' ||
                            (response.data.Error && response.data.Error.includes('not found'))
                        ) {
                            badKeys.push(response.data.Error);
                        }
                    })
                    .catch((error) => {
                        if (
                            (error.response &&
                                error.response.data.Error === 'Request limit reached!') ||
                            (error.response && error.response.status === 401)
                        ) {
                            badKeys.push(error.response?.data?.Error);
                        } else {
                            badKeys.push(error.code);
                        }
                    }),
            );
        }
        await promiseQueue.onIdle();
        return {
            badKeys: badKeys,
            totalKeys: this.apiKeys.length,
        };
    }
}

export type OMDBFields = {
    imdbID: string;
    directorsNames: string[];
    writersNames: string[];
    actorsNames: string[];
    summary_en: string;
    genres: string[];
    isAnime: boolean;
    rating: MovieRates | any;
    omdbTitle: string;
    yearIgnored: boolean;
    year: string;
    poster: string;
    updateFields:
        | {
              rawTitle: string;
              duration: string;
              totalSeasons: number;
              rated: any;
              movieLang: string;
              country: string;
              boxOffice: string;
              awards: string;
          }
        | Record<string, any>;
};
