import {
    DownloadLink,
    Episode,
    MoviesGroupedLink,
    Quality,
    Season,
    SeasonEpisode,
} from '@/types/downloadLink';
import { MovieType, SourceVpnStatus, VPNStatus } from '@/types/source';
import { groupSubtitles } from '@/crawler/subtitle';
import { GroupedSubtitle, Subtitle } from '@/types/subtitle';
import { getLatestData } from '@crawler/latestData';


export enum MovieReleaseState {
    DONE = 'done',
    IN_THEATERS = 'inTheaters',
    COMING_SOON = 'comingSoon',
    WAITING = 'waiting',
    BOX_OFFICE = 'boxOffice',
}

export enum MovieStatus {
    ENDED = 'ended',
    RUNNING = 'running',
    UNKNWON = 'unknown',
}

export type MovieRank = {
    animeTopComingSoon: number;
    animeTopAiring: number;
    animeSeasonNow: number;
    animeSeasonUpcoming: number;
    comingSoon: number;
    inTheaters: number;
    boxOffice: number;
    like: number;
    like_month: number;
    view_month: number;
    follow_month: number;
};

export type MovieSource = {
    sourceName: string;
    pageLink: string;
};

export type MoviePoster = {
    url: string;
    info: string;
    size: number;
    vpnStatus: VPNStatus;
    thumbnail: string;
    blurHash: string;
};

export type MoviePosterS3 = {
    url: string;
    originalUrl: string;
    originalSize: number;
    size: number;
    vpnStatus: VPNStatus;
    thumbnail: string;
    blurHash: string;
};

export type MovieTrailer = {
    url: string;
    info: string;
    vpnStatus: VPNStatus;
};

export type MovieTrailerS3 = {
    url: string;
    originalUrl: string;
    size: number;
    vpnStatus: VPNStatus;
};

export type MovieSummary = {
    persian: string;
    persian_source: string;
    english: string;
    english_source: string;
};

export type MoviesLatestData = {
    season: number;
    episode: number;
    quality: string;
    updateReason: string;
    hardSub: string;
    dubbed: string;
    censored: string;
    subtitle: string;
    watchOnlineLink: string;
    torrentLinks: string;
};

export type MovieRates = {
    imdb: number;
    rottenTomatoes: number;
    metacritic: number;
    myAnimeList: number;
    tvmaze?: number;
    mal?: number;
    omdb?: number;
};

export type Movie = {
    _id: string;
    releaseState: MovieReleaseState;
    rank: MovieRank;
    title: string;
    type: MovieType;
    rawTitle: string;
    alternateTitles: string[];
    titleSynonyms: string[];
    qualities: MoviesGroupedLink[];
    seasons: Season[];
    sources: MovieSource[];
    seasonEpisode: SeasonEpisode[];
    add_date: Date;
    insert_date: Date;
    update_date: Date | null;
    apiUpdateDate: Date;
    castUpdateDate: Date | null;
    posters: MoviePoster[];
    poster_s3: MoviePosterS3 | null;
    poster_wide_s3: MoviePosterS3 | null;
    trailers: MovieTrailer[];
    trailer_s3: MovieTrailerS3 | null;
    summary: MovieSummary;
    trailerDate: number;
    subtitles: GroupedSubtitle[];
    latestData: MoviesLatestData;
    status: MovieStatus;
    releaseDay: string;
    year: string;
    premiered: string;
    endYear: string;
    officialSite: string;
    webChannel: string;
    nextEpisode: Episode | null;
    duration: string;
    totalDuration: string;
    //3rd party api data
    apiIds: {
        imdbID: string;
        tvmazeID: number;
        jikanID: number;
        kitsuID: number;
        amvID: number;
        gogoID: string;
    };
    totalSeasons: number;
    boxOffice: string;
    boxOfficeData: {
        weekend: string;
        gross: string;
        weeks: number;
    };
    rated: string;
    movieLang: string;
    country: string;
    genres: string[];
    rating: {
        imdb: number;
        rottenTomatoes: number;
        metacritic: number;
        myAnimeList: number;
    };
    awards: string;
    //jikan api data
    animeType: string;
    animeSource: string;
    animeSeason: string;
    torrentDownloaderConfig: MovieTorrentDownloaderConfig | null;
    removeTorrentLinks: string[];
    downloadTorrentLinks: string[];
    //
    tempRank_anime?: number;
};

export type TitleObj = {
    title: string;
    rawTitle: string;
    alternateTitles: string[];
    titleSynonyms: string[];
    jikanID: number;
};

export function getMovieModel(
    titleObj: TitleObj,
    page_link: string,
    type: MovieType,
    siteDownloadLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
    sourceName: string,
    year: string,
    poster: string,
    persianSummary: string,
    trailers: MovieTrailer[],
    watchOnlineLinks: DownloadLink[],
    subtitles: Subtitle[],
    sourceVpnStatus: SourceVpnStatus,
): Movie {
    const latestData = getLatestData(
        siteDownloadLinks,
        watchOnlineLinks,
        torrentLinks,
        subtitles,
        type,
    );

    return {
        _id: '',
        releaseState: MovieReleaseState.DONE,
        rank: {
            animeTopComingSoon: -1,
            animeTopAiring: -1,
            animeSeasonNow: -1,
            animeSeasonUpcoming: -1,
            comingSoon: -1,
            inTheaters: -1,
            boxOffice: -1,
            like: -1,
            like_month: -1,
            view_month: -1,
            follow_month: -1,
        },
        title: titleObj.title,
        type: type,
        rawTitle: titleObj.rawTitle,
        alternateTitles: titleObj.alternateTitles,
        titleSynonyms: titleObj.titleSynonyms,
        qualities: [],
        seasons: [],
        sources: sourceName
            ? [
                  {
                      sourceName: sourceName,
                      pageLink: page_link,
                  },
              ]
            : [],
        seasonEpisode: [],
        add_date: new Date(),
        insert_date: new Date(),
        update_date: null,
        apiUpdateDate: new Date(),
        castUpdateDate: null,
        posters: [
            {
                url: poster,
                info: sourceName,
                size: 0,
                vpnStatus: sourceVpnStatus.poster,
                thumbnail: '',
                blurHash: '',
            },
        ].filter((item) => item.url),
        poster_s3: null, // {url,originalUrl,originalSize,size,vpnStatus,thumbnail,blurHash}
        poster_wide_s3: null, // {url,originalUrl,originalSize,size,vpnStatus,thumbnail,blurHash}
        trailer_s3: null, // {url,originalUrl,size,vpnStatus}
        summary: {
            persian: persianSummary,
            persian_source: sourceName,
            english: '',
            english_source: '',
        },
        trailers: trailers, // [{'url,info,vpnStatus'}]
        trailerDate: trailers.length > 0 ? Date.now() : 0,
        subtitles: groupSubtitles(subtitles),
        latestData: latestData, //season, episode, quality, updateReason, hardSub, dubbed, censored, subtitle, watchOnlineLink, torrentLinks
        status: type.includes('movie') ? MovieStatus.ENDED : MovieStatus.UNKNWON,
        releaseDay: '',
        year: year.toString(),
        premiered: year.toString(),
        endYear: year.toString(),
        officialSite: '',
        webChannel: '',
        nextEpisode: null,
        duration: '0 min',
        totalDuration: '',
        //3rd party api data
        apiIds: {
            imdbID: '',
            tvmazeID: 0,
            jikanID: titleObj.jikanID || 0,
            kitsuID: 0,
            amvID: 0,
            gogoID: '',
        },
        totalSeasons: 0,
        boxOffice: '',
        boxOfficeData: {
            weekend: '',
            gross: '',
            weeks: 0,
        },
        rated: '',
        movieLang: '',
        country: '',
        genres: [],
        rating: {
            imdb: 0,
            rottenTomatoes: 0,
            metacritic: 0,
            myAnimeList: 0,
        },
        awards: '',
        //jikan api data
        animeType: '',
        animeSource: '',
        animeSeason: '',
        torrentDownloaderConfig: null,
        removeTorrentLinks: [],
        downloadTorrentLinks: [],
    };
}

export type MovieTorrentDownloaderConfig = {
    disabled: boolean;
    newEpisodeQualities: Quality;
    movieQualities: Quality;
    torrentFilesExpireHour: number;
    bypassIfHasDownloadLink: boolean;
    newEpisodeLinkLimit: number;
    movieLinkLimit: number;
};

export const torrentDownloaderConfig = Object.freeze({
    disabled: false,
    newEpisodeQualities: '1080p',
    movieQualities: '1080p',
    torrentFilesExpireHour: 7 * 24,
    bypassIfHasDownloadLink: true,
    newEpisodeLinkLimit: 2,
    movieLinkLimit: 2,
});

export const dataLevelConfig = Object.freeze({
    dlink: Object.freeze({
        rawTitle: 1,
        type: 1,
        year: 1,
        posters: 1,
        qualities: 1,
        seasons: 1,
        subtitles: 1,
        sources: 1,
    }),
    low: Object.freeze({
        title: 1,
        year: 1,
        premiered: 1,
        posters: 1,
        type: 1,
        rawTitle: 1,
        rating: 1,
        latestData: 1,
        poster_wide_s3: 1,
    }),
    telbot: Object.freeze({
        rawTitle: 1,
        type: 1,
        year: 1,
        premiered: 1,
        posters: 1,
        poster_s3: 1,
        poster_wide_s3: 1,
        genres: 1,
        summary: 1,
        rating: 1,
        rated: 1,
        country: 1,
        latestData: 1,
        duration: 1,
        releaseDay: 1,
        seasonEpisode: 1,
        insert_date: 1,
        update_date: 1,
    }),
    medium: Object.freeze({
        releaseState: 1,
        rank: 1,
        title: 1,
        rawTitle: 1,
        type: 1,
        year: 1,
        premiered: 1,
        posters: 1,
        poster_wide_s3: 1,
        alternateTitles: 1,
        rating: 1,
        summary: 1,
        genres: 1,
        trailers: 1,
        trailerDate: 1,
        latestData: 1,
        insert_date: 1,
        update_date: 1,
        nextEpisode: 1,
        releaseDay: 1,
        status: 1,
        boxOfficeData: 1,
    }),
    info: Object.freeze({
        seasons: 0,
        qualities: 0,
        subtitles: 0,
    }),
    high: Object.freeze({}),
});
