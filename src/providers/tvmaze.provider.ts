import { ServerAnalysisRepo } from '@/repo';
import { Episode, EpisodeInfo, getEpisodeModel, MovieType } from '@/types';
import { getFixedGenres, getFixedSummary } from '@/extractors';
import { CrawlerErrors } from '@/status/warnings';
import { saveError } from '@utils/logger';
import axios from 'axios';
import { MediaProvider } from './index';
import { Crawler as CrawlerUtils } from '@/utils';

export class TVMazeProvider implements MediaProvider {
    public readonly name = 'TVMaze';
    public readonly baseUrl = 'https://api.tvmaze.com';

    constructor() {}

    async getApiData(
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        imdbID: string,
        premiered: string,
        type: MovieType,
        canRetry: boolean,
    ): Promise<any> {
        title = title
            .toLowerCase()
            .replace(' all seasons', '')
            .replace(/\sall$/, '')
            .replace(' full episodes', '');

        title = CrawlerUtils.replaceSpecialCharacters(title);
        const url = `https://api.tvmaze.com/singlesearch/shows?q=${decodeURIComponent(title)}&embed[]=nextepisode&embed[]=episodes&embed[]=cast&embed[]=images`;

        let waitCounter = 0;
        while (waitCounter < 12) {
            try {
                const response = await axios.get(url);
                const data = response.data;
                const titleMatch = this.checkTitle(
                    data,
                    title,
                    alternateTitles,
                    titleSynonyms,
                    imdbID,
                    premiered,
                );
                if (titleMatch) {
                    return data;
                } else {
                    return await this.checkMultiSearches(
                        title,
                        alternateTitles,
                        titleSynonyms,
                        imdbID,
                        premiered,
                    );
                }
            } catch (error: any) {
                if (error.response && error.response.status === 429) {
                    //too much request
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    waitCounter++;
                } else if (error.code === 'EAI_AGAIN') {
                    if (waitCounter > 6) {
                        return null;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    waitCounter += 3;
                } else if (error.response && error.response.status === 404) {
                    if (type.includes('anime') && canRetry) {
                        const newTitle = this.getEditedTitle(title);
                        if (newTitle !== title) {
                            return await this.getApiData(
                                newTitle,
                                alternateTitles,
                                titleSynonyms,
                                imdbID,
                                premiered,
                                type,
                                false,
                            );
                        }
                    }
                    return null;
                } else {
                    if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
                        error.isFetchError = true;
                        error.url = url;
                    }
                    await saveError(error);
                    return null;
                }
            }
        }
        ServerAnalysisRepo.saveCrawlerWarning(CrawlerErrors.api.tvmaze.lotsOfApiCall);
        return null;
    }

    async checkMultiSearches(
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        imdbID: string,
        premiered: string,
    ): Promise<any> {
        const multiSearcheUrl = `https://api.tvmaze.com/search/shows?q=${decodeURIComponent(title)}&embed[]=nextepisode&embed[]=episodes&embed[]=cast`;
        const data = await this.callApi(multiSearcheUrl);
        if (!data) {
            return null;
        }

        for (let i = 0; i < data.length; i++) {
            const thisTitleData = data[i].show;
            if (
                this.checkTitle(
                    thisTitleData,
                    title,
                    alternateTitles,
                    titleSynonyms,
                    imdbID,
                    premiered,
                )
            ) {
                const titleUrl = `https://api.tvmaze.com/shows/${thisTitleData.id}?embed[]=nextepisode&embed[]=episodes&embed[]=cast&embed[]=images`;
                const titleData = await this.callApi(titleUrl);
                if (
                    titleData &&
                    this.checkTitle(
                        titleData,
                        title,
                        alternateTitles,
                        titleSynonyms,
                        imdbID,
                        premiered,
                    )
                ) {
                    return titleData;
                }
            }
        }

        if (data.length === 1) {
            let id = data[0]?.show?.id;
            if (id) {
                const url = `https://api.tvmaze.com/shows/${id}/akas`;
                const res = await this.callApi(url);
                if (res) {
                    for (let i = 0; i < res.length; i++) {
                        data[0].show.name = res[i].name;
                        if (
                            this.checkTitle(
                                data[0].show,
                                title,
                                alternateTitles,
                                titleSynonyms,
                                imdbID,
                                premiered,
                            )
                        ) {
                            const titleUrl = `https://api.tvmaze.com/shows/${id}?embed[]=nextepisode&embed[]=episodes&embed[]=cast&embed[]=images`;
                            const titleData = await this.callApi(titleUrl);
                            if (titleData) {
                                return titleData;
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    getApiFields(data: any): TVMazeFields | null {
        try {
            const apiFields: TVMazeFields = {
                imdbID: data.externals.imdb || '',
                tvmazeID: Number(data.id) || 0,
                posters: (data._embedded.images || []).filter(
                    (item: any) => item.type === 'poster',
                ),
                backgroundPosters: (data._embedded.images || []).filter(
                    (item: any) => item.type === 'background',
                ),
                cast: data._embedded.cast || [],
                nextEpisode: this.getNextEpisode(data),
                episodes: this.getEpisodes(data),
                summary_en: getFixedSummary(data.summary),
                genres: getFixedGenres(data.genres),
                isAnimation: data.type.toLowerCase() === 'animation',
                isAnime: data.genres?.includes('anime') || data.genres?.includes('Anime'),
                updateFields: {
                    rawTitle: data.name
                        .trim()
                        .replace(/^["']|["']$/g, '')
                        .replace(/volume \d/i, (res: string) => res.replace('Volume', 'Vol')),
                    premiered: data.premiered || '',
                    year: data.premiered ? data.premiered.split(/[-–]/g)[0] : '',
                    duration: data.runtime
                        ? data.runtime + ' min'
                        : data.averageRuntime
                          ? data.averageRuntime + ' min'
                          : '',
                    status: data.status.toLowerCase(),
                    movieLang: data.language ? data.language.toLowerCase() : '',
                    releaseDay: data.schedule.days
                        ? (data.schedule.days[0] || '').toLowerCase()
                        : '',
                    officialSite: data.officialSite || '',
                    webChannel: data.webChannel ? data.webChannel.name || '' : '',
                },
            };
            if (!apiFields.updateFields.releaseDay && apiFields.updateFields.premiered) {
                const dayNumber = new Date(apiFields.updateFields.premiered).getDay();
                apiFields.updateFields.releaseDay = CrawlerUtils.getDayName(dayNumber);
            }
            apiFields.updateFields = CrawlerUtils.purgeObjFalsyValues(apiFields.updateFields);
            return apiFields;
        } catch (error) {
            saveError(error);
            return null;
        }
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
                if (error.response && error.response.status === 429) {
                    //too much request
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    waitCounter++;
                } else if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
                    error.isFetchError = true;
                    error.url = url;
                    await saveError(error);
                    return null;
                } else {
                    if (error.response && error.response.status !== 404) {
                        await saveError(error);
                    }
                    return null;
                }
            }
        }
        ServerAnalysisRepo.saveCrawlerWarning(CrawlerErrors.api.tvmaze.lotsOfApiCall);
        return null;
    }

    getEditedTitle(title: string): string {
        return title
            .replace('saenai heroine no sodatekata fine', 'saenai heroine no sodatekata')
            .replace('biohazard infinite darkness', 'resident evil infinite darkness')
            .replace(' wo ', ' o ')
            .replace(' the ', ' this ')
            .replace(' sotsu', '')
            .replace('brorhood', 'brotherhood')
            .replace(' zunousen', ' zuno sen')
            .replace(' kusoge', ' kusogee')
            .replace('summons', 'calls')
            .replace('dont', "don't")
            .replace('wont', "won't")
            .replace('heavens', "heaven's")
            .replace('havent', "haven't")
            .replace(' im ', " i'm ")
            .replace(' comedy', ' come')
            .replace(' renai ', " ren'ai ")
            .replace(/(?<=(^|\s))vol \d/, (res) => res.replace('vol', 'volume'));
    }

    checkTitle(
        data: any,
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        imdbID: string,
        premiered: string,
        // titleYear: string,
        // yearIgnored: boolean,
        // type: MovieType,
    ): boolean {
        const titleYear = premiered.split('-')[0];
        if (
            titleYear &&
            data.premiered &&
            Math.abs(Number(titleYear) - Number(data.premiered.split(/[-–]/g)[0])) > 1
        ) {
            return false;
        }

        let apiTitle = data.name.toLowerCase();
        const apiTitle_simple = CrawlerUtils.replaceSpecialCharacters(apiTitle);
        alternateTitles = alternateTitles.map((value) =>
            CrawlerUtils.replaceSpecialCharacters(value.toLowerCase()),
        );
        titleSynonyms = titleSynonyms.map((value) =>
            CrawlerUtils.replaceSpecialCharacters(value.toLowerCase()),
        );

        const specialCase1 = title.replace(
            'cautious hero: the hero is overpowered but overly cautious',
            'the hero is overpowered but overly cautious',
        );
        const specialCase2 = title.replace(
            'iya na kao sare nagara opantsu misete moraitai',
            'i want you to make a disgusted face and show me your underwear',
        );
        const specialCase3 = title
            .replace('nounai', 'nonai')
            .replace('love comedy wo', 'rabu kome o');
        const specialCase4 = title.replace('bougyoryoku', 'bogyoryoku');

        title = title.replace(/volume \d/, (res) => res.replace('volume', 'vol'));
        apiTitle = apiTitle.replace(/volume \d/, (res: string) => res.replace('volume', 'vol'));

        return (
            (imdbID && imdbID === data.externals.imdb) ||
            this.normalizeText(title) === this.normalizeText(apiTitle) ||
            this.normalizeText(title) === this.normalizeText(apiTitle_simple) ||
            title.replace(' wo ', ' o ') === apiTitle_simple ||
            title.replace(/\swo$/, ' o') === apiTitle_simple ||
            specialCase4 === apiTitle_simple ||
            specialCase1 === apiTitle_simple ||
            specialCase2 === apiTitle_simple ||
            specialCase3 === apiTitle_simple ||
            alternateTitles.includes(apiTitle) ||
            alternateTitles.includes(apiTitle_simple) ||
            alternateTitles.includes(apiTitle_simple.replace('this', 'the')) ||
            titleSynonyms.includes(apiTitle) ||
            titleSynonyms.includes(apiTitle_simple) ||
            title.replace(/.$/, '') === apiTitle_simple ||
            title.replace(/..$/, '') === apiTitle_simple ||
            this.checkSpecialCases(title, apiTitle_simple)
        );
    }

    checkSpecialCases(title: string, apiTitle_simple: string): boolean {
        const lastWord = title.split(' ').pop();
        if (!lastWord) {
            return false;
        }

        const temp = apiTitle_simple.split(' ');
        const words = temp.slice(temp.length - lastWord.length);
        return title === apiTitle_simple.replace(words.join(' '), words.map((w) => w[0]).join(''));
    }

    normalizeText(text: string): string {
        return text
            .replace(' movie', '')
            .replace('specials', 'ova')
            .replace(/\sthe animation(\s\d+)?(\stv)?$/, '')
            .replace(/tv|the|precent|will|\s+/g, '')
            .replace(/volume \d/, (res) => res.replace('volume', 'vol'))
            .replace(/[ck]/g, 'c')
            .replace(/wo|ou/g, 'o')
            .replace(/ai|ia|s/g, '')
            .replace(/an/g, 'a')
            .replace(/\s?[&:]\s?/g, '')
            .trim();
    }

    private getNextEpisode(data: any): EpisodeInfo | null {
        const nextEpisodeInfo = data._embedded.nextepisode;
        if (!nextEpisodeInfo) {
            return null;
        }

        return {
            title: nextEpisodeInfo.name || '',
            season: nextEpisodeInfo.season,
            episode: nextEpisodeInfo.number,
            releaseStamp: nextEpisodeInfo.airstamp || '',
            summary: nextEpisodeInfo.summary
                ? nextEpisodeInfo.summary
                      .replace(/<p>|<\/p>|<b>|<\/b>/g, '')
                      .replace(/([.…])+$/, '')
                      .trim()
                : '',
        };
    }

    private getEpisodes(data: any): Episode[] {
        return data._embedded.episodes.map((value: any) => {
            let episodeDurations = value.runtime ? value.runtime + ' min' : '0 min';
            episodeDurations = episodeDurations.replace('30 min', '24 min');
            return getEpisodeModel(
                value.name || '',
                value.airdate,
                value.airstamp,
                episodeDurations,
                value.season,
                value.number,
                '0',
                '',
            );
        });
    }
}

export type TVMazeFields = {
    imdbID: string;
    tvmazeID: number;
    posters: any[];
    backgroundPosters: any[];
    cast: any[];
    nextEpisode: EpisodeInfo | null;
    episodes: Episode[];
    summary_en: string;
    genres: string[];
    isAnimation: boolean;
    isAnime: boolean;
    updateFields:
        | {
              rawTitle: string;
              premiered: string;
              year: string;
              duration: string;
              status: string;
              movieLang: string;
              releaseDay: string;
              officialSite: string;
              webChannel: string;
          }
        | Record<string, any>;
    releaseDay?: string;
};
