import {
    CrawlerLinkType,
    DownloadLink,
    Episode,
    MoviesGroupedLink,
    Quality,
    Season,
} from '@/types';
import { expect, test } from 'bun:test';
import {
    checkEqualLinks,
    groupMovieLinks,
    groupSerialLinks,
    updateMoviesGroupedLinks,
    updateSerialLinks,
} from '../link.js';

test('link with same common fields result in equal=true', () => {
    const link1: DownloadLink = {
        link: 'link1',
        info: 'info1',
        qualitySample: 'qualitySample1',
        season: 1,
        episode: 2,
        type: CrawlerLinkType.DIRECT,
        sourceName: "SOURCE_NAME",
    };
    const link2: DownloadLink = {
        link: 'link1',
        info: 'info1',
        qualitySample: 'qualitySample1',
        season: 1,
        episode: 2,
        type: CrawlerLinkType.DIRECT,
        sourceName: "SOURCE_NAME",
    };
    expect(checkEqualLinks(link1, link2)).toBe(true);
});

test('link without same common fields result in equal=false', () => {
    const link1: DownloadLink = {
        link: 'link1',
        info: 'info1',
        qualitySample: 'qualitySample1',
        season: 1,
        episode: 2,
        type: CrawlerLinkType.DIRECT,
        sourceName: "SOURCE_NAME",
    };

    const link2: DownloadLink = {
        link: 'link2',
        info: 'info2',
        qualitySample: 'qualitySample1',
        season: 1,
        episode: 2,
        type: CrawlerLinkType.DIRECT,
        sourceName: "SOURCE_NAME",
    };
    expect(checkEqualLinks(link1, link2)).toBe(false);
});

test('group links of movie titles', () => {
    const links: DownloadLink[] = [
        {
            link: 'link1',
            info: '720p.WEB-DL',
            qualitySample: 'qualitySample1',
            sourceName: 'sourceName1',
            season: 0,
            episode: 0,
            type: CrawlerLinkType.DIRECT,
        },
        {
            link: 'link2',
            info: '1080p.x265',
            qualitySample: 'qualitySample2',
            sourceName: 'sourceName1',
            season: 0,
            episode: 0,
            type: CrawlerLinkType.DIRECT,
        },
    ];

    const watchOnlineLinks: DownloadLink[] = [
        {
            link: 'link1',
            info: '480p',
            sourceName: 'sourceName1',
            season: 0,
            episode: 0,
            type: CrawlerLinkType.DIRECT,
        },
        {
            link: 'link2',
            info: '720p.HDTV',
            sourceName: 'sourceName1',
            season: 0,
            episode: 0,
            type: CrawlerLinkType.DIRECT,
        },
    ];

    const torrentLinks: DownloadLink[] = [];

    const expectedResult: MoviesGroupedLink[] = [
        { quality: Quality["2160p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        {
            quality: Quality["1080p"],
            links: [
                {
                    link: 'link2',
                    info: '1080p.x265',
                    qualitySample: 'qualitySample2',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            watchOnlineLinks: [],
            torrentLinks: [],
        },
        {
            quality: Quality["720p"],
            links: [
                {
                    link: 'link1',
                    info: '720p.WEB-DL',
                    qualitySample: 'qualitySample1',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            watchOnlineLinks: [
                {
                    link: 'link2',
                    info: '720p.HDTV',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            torrentLinks: [],
        },
        {
            quality: Quality["480p"],
            links: [],
            watchOnlineLinks: [
                {
                    link: 'link1',
                    info: '480p',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            torrentLinks: [],
        },
        { quality: Quality["360p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality["others"], links: [], watchOnlineLinks: [], torrentLinks: [] },
    ];
    expect(groupMovieLinks(links, watchOnlineLinks, torrentLinks)).toStrictEqual(expectedResult);
});

test('update movies grouped links', () => {
    const prevGroupLinks: MoviesGroupedLink[] = [
        { quality: Quality["2160p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        {
            quality: Quality["1080p"],
            links: [
                {
                    link: 'link2',
                    info: '1080p.x265',
                    qualitySample: 'qualitySample2',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            watchOnlineLinks: [],
            torrentLinks: [],
        },
        {
            quality: Quality["720p"],
            links: [
                {
                    link: 'link3',
                    info: '720p.WEB-DL',
                    qualitySample: 'qualitySample3',
                    sourceName: 'sourceName3',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            watchOnlineLinks: [
                {
                    link: 'link2',
                    info: '720p.HDTV',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            torrentLinks: [],
        },
        {
            quality: Quality["480p"],
            links: [],
            watchOnlineLinks: [
                {
                    link: 'link1',
                    info: '480p.v1',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            torrentLinks: [],
        },
    ];

    const currentGroupLinks: MoviesGroupedLink[] = [
        { quality: Quality["2160p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality["1080p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        {
            quality: Quality["720p"],
            links: [
                {
                    link: 'link1',
                    info: '720p.WEB-DL',
                    qualitySample: 'qualitySample1',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            watchOnlineLinks: [],
            torrentLinks: [],
        },
        {
            quality: Quality["480p"],
            links: [],
            watchOnlineLinks: [
                {
                    link: 'link1',
                    info: '480p.v2',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            torrentLinks: [],
        },
        { quality: Quality["360p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality["others"], links: [], watchOnlineLinks: [], torrentLinks: [] },
    ];

    const newGroupLinks: MoviesGroupedLink[] = [
        { quality: Quality["2160p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality["1080p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        {
            quality: Quality["720p"],
            links: [
                {
                    link: 'link3',
                    info: '720p.WEB-DL',
                    qualitySample: 'qualitySample3',
                    sourceName: 'sourceName3',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
                {
                    link: 'link1',
                    info: '720p.WEB-DL',
                    qualitySample: 'qualitySample1',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            watchOnlineLinks: [],
            torrentLinks: [],
        },
        {
            quality: Quality["480p"],
            links: [],
            watchOnlineLinks: [
                {
                    link: 'link1',
                    info: '480p.v2',
                    sourceName: 'sourceName1',
                    season: 0,
                    episode: 0,
                    type: CrawlerLinkType.DIRECT,
                },
            ],
            torrentLinks: [],
        },
        { quality: Quality["360p"], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality["others"], links: [], watchOnlineLinks: [], torrentLinks: [] },
    ];

    const result = updateMoviesGroupedLinks(prevGroupLinks, currentGroupLinks, 'sourceName1');
    expect(result).toEqual(true);
    expect(prevGroupLinks).toStrictEqual(newGroupLinks);
});

test('group links of serials titles', () => {
    const links: DownloadLink[] = [
        {
            link: 'link1',
            info: '720p.WEB-DL',
            qualitySample: 'qualitySample1',
            sourceName: 'sourceName1',
            season: 1,
            episode: 1,
            type: CrawlerLinkType.DIRECT,
        },
        {
            link: 'link2',
            info: '1080p.x265',
            qualitySample: 'qualitySample2',
            sourceName: 'sourceName1',
            season: 3,
            episode: 2,
            type: CrawlerLinkType.DIRECT,
        },
    ];

    const watchOnlineLinks: DownloadLink[] = [
        {
            link: 'link1',
            info: '480p',
            sourceName: 'sourceName1',
            season: 2,
            episode: 3,
            type: CrawlerLinkType.DIRECT,
        },
        {
            link: 'link2',
            info: '720p.HDTV',
            sourceName: 'sourceName1',
            season: 1,
            episode: 1,
            type: CrawlerLinkType.DIRECT,
        },
    ];

    const torrentLinks: DownloadLink[] = [];

    const otherEpisodeFields: Episode = {
        title: 'unknown',
        released: 'unknown',
        releaseStamp: '',
        duration: '0 min',
        imdbRating: '0',
        imdbID: '',

        episodeNumber: 0,
        links: [],
        watchOnlineLinks: [],
        torrentLinks: [],
    };

    const expectedResult: Season[] = [
        {
            seasonNumber: 1,
            episodes: [
                {
                    ...otherEpisodeFields,
                    episodeNumber: 1,
                    links: [
                        {
                            link: 'link1',
                            info: '720p.WEB-DL',
                            qualitySample: 'qualitySample1',
                            sourceName: 'sourceName1',
                            season: 1,
                            episode: 1,
                            type: CrawlerLinkType.DIRECT,
                        },
                    ],
                    watchOnlineLinks: [
                        {
                            link: 'link2',
                            info: '720p.HDTV',
                            sourceName: 'sourceName1',
                            season: 1,
                            episode: 1,
                            type: CrawlerLinkType.DIRECT,
                        },
                    ],
                    torrentLinks: [],
                },
            ],
        },
        {
            seasonNumber: 2,
            episodes: [
                {
                    ...otherEpisodeFields,
                    episodeNumber: 3,
                    links: [],
                    watchOnlineLinks: [
                        {
                            link: 'link1',
                            info: '480p',
                            sourceName: 'sourceName1',
                            season: 2,
                            episode: 3,
                            type: CrawlerLinkType.DIRECT,
                        },
                    ],
                    torrentLinks: [],
                },
            ],
        },
        {
            seasonNumber: 3,
            episodes: [
                {
                    ...otherEpisodeFields,
                    episodeNumber: 2,
                    links: [
                        {
                            link: 'link2',
                            info: '1080p.x265',
                            qualitySample: 'qualitySample2',
                            sourceName: 'sourceName1',
                            season: 3,
                            episode: 2,
                            type: CrawlerLinkType.DIRECT,
                        },
                    ],
                    watchOnlineLinks: [],
                    torrentLinks: [],
                },
            ],
        },
    ];
    expect(groupSerialLinks(links, watchOnlineLinks, torrentLinks)).toStrictEqual(expectedResult);
});

test('update serial episode/movie quality links', () => {
    const episodeOrQuality: MoviesGroupedLink = {
        quality: Quality["2160p"],
        // other fields
        links: [
            {
                link: 'link3',
                info: '1080p.x265',
                qualitySample: 'qualitySample2',
                sourceName: 'sourceName2',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
            {
                link: 'link2',
                info: '720p.HDTV',
                qualitySample: 'qualitySample1',
                sourceName: 'sourceName1',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
            {
                link: 'link1',
                info: '720p.WEB-DL',
                qualitySample: 'qualitySample1',
                sourceName: 'sourceName1',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
        ],
        watchOnlineLinks: [
            {
                link: 'link5',
                info: '720p.HDTV',
                sourceName: 'sourceName3',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
            {
                link: 'link4',
                info: '480p',
                sourceName: 'sourceName2',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
        ],
        torrentLinks: [],
    };

    const prevLinks = episodeOrQuality.links.filter((item) => item.sourceName === 'sourceName1');
    const prevOnlineLinks = episodeOrQuality.watchOnlineLinks.filter(
        (item) => item.sourceName === 'sourceName1',
    );

    const currentLinks: DownloadLink[] = [
        {
            link: 'link2.v2',
            info: '720p.HDTV',
            qualitySample: 'qualitySample1',
            sourceName: 'sourceName1',
            season: 2,
            episode: 1,
            type: CrawlerLinkType.DIRECT,
        },
    ];

    const currentOnlineLinks: DownloadLink[] = [
        {
            link: 'link6',
            info: '480p',
            sourceName: 'sourceName1',
            season: 2,
            episode: 1,
            type: CrawlerLinkType.DIRECT,
        },
    ];

    const episodeOrQuality_new: MoviesGroupedLink = {
        quality: Quality["2160p"],
        links: [
            {
                link: 'link3',
                info: '1080p.x265',
                qualitySample: 'qualitySample2',
                sourceName: 'sourceName2',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
            {
                link: 'link2.v2',
                info: '720p.HDTV',
                qualitySample: 'qualitySample1',
                sourceName: 'sourceName1',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
        ],
        watchOnlineLinks: [
            {
                link: 'link5',
                info: '720p.HDTV',
                sourceName: 'sourceName3',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
            {
                link: 'link4',
                info: '480p',
                sourceName: 'sourceName2',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
            {
                link: 'link6',
                info: '480p',
                sourceName: 'sourceName1',
                season: 2,
                episode: 1,
                type: CrawlerLinkType.DIRECT,
            },
        ],
        torrentLinks: [],
    };

    const result = updateSerialLinks(
        episodeOrQuality,
        prevLinks,
        prevOnlineLinks,
        [],
        currentLinks,
        currentOnlineLinks,
        [],
    );
    expect(result).toEqual(true);
    expect(episodeOrQuality).toStrictEqual(episodeOrQuality_new);
});
