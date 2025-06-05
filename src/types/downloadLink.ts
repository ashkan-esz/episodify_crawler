import { CrawlerLinkType, MovieType } from '@/types/source';
import { getSeasonEpisode } from '@utils/crawler';

export enum Quality {
    '2160p' = '2160p',
    '1080p' = '1080p',
    '720p' = '720p',
    '480p' = '480p',
    '360p' = '360p',
    'others' = 'others',
}

export type DownloadLink = {
    link: string;
    info: string;
    type: CrawlerLinkType;
    season: number;
    episode: number;
    sourceName: string;
    size?: number;
    localLink?: string;
    localLinkExpire?: number | Date;
    okCount?: number;
    badCount?: number;
    qualitySample?: string;
};

export type MoviesGroupedLink = {
    quality: Quality;
    links: DownloadLink[];
    watchOnlineLinks: DownloadLink[];
    torrentLinks: DownloadLink[];
    checked?: boolean;
};

export type SeasonEpisode = {
    season: number;
    episode: number;
};

export type Season = {
    seasonNumber: number;
    episodes: Episode[];
};

export type SeasonWithEpisodesCount = {
    seasonNumber: number;
    episodes: number;
};

export type Episode = {
    title: string;
    released: string;
    releaseStamp: string;
    duration: string;
    season?: number;
    episode?: number;
    episodeNumber: number;
    imdbRating: string;
    imdbID: string;
    links: DownloadLink[];
    watchOnlineLinks: DownloadLink[];
    torrentLinks: DownloadLink[];

    checked?: boolean;
};

export type EpisodeInfo = {
    title: string;
    releaseStamp: string;
    season?: number;
    episode?: number;
    summary?: string;
};

//-----------------------------------------------------
//-----------------------------------------------------

export function getWatchOnlineLinksModel(
    link: string,
    info: string,
    movieType: MovieType,
    sourceName: string,
): DownloadLink {
    let season = 0,
        episode = 0;
    if (movieType.includes('serial')) {
        ({ season, episode } = getSeasonEpisode(link));
    }
    return {
        badCount: 0,
        localLink: '',
        localLinkExpire: 0,
        okCount: 0,
        qualitySample: '',
        size: 0,
        type: CrawlerLinkType.DIRECT,
        link: link.trim(),
        info: info,
        sourceName: sourceName,
        season: season,
        episode: episode,
    };
}

export function getEpisodeModel(
    title: string,
    released: string,
    releaseStamp: string,
    duration: string,
    season: number,
    episode: number,
    imdbRating: string,
    imdbID: string,
): Episode {
    return {
        title: title || 'unknown',
        released: released || '',
        releaseStamp: releaseStamp || '',
        duration: duration || '0 min',
        season: Number(season) || 0,
        episode: Number(episode) || 0,
        episodeNumber: Number(episode) || 0,
        imdbRating: imdbRating || '0',
        imdbID: imdbID || '',
        links: [],
        watchOnlineLinks: [],
        torrentLinks: [],
    };
}

export function getEpisodeModelPlaceholder(season: number, episode: number): Episode {
    return {
        title: 'unknown',
        released: 'unknown',
        releaseStamp: '',
        duration: '0 min',
        season: Number(season) || 0,
        episode: Number(episode) || 0,
        episodeNumber: Number(episode) || 0,
        imdbRating: '0',
        imdbID: '',
        links: [],
        watchOnlineLinks: [],
        torrentLinks: [],
    };
}
