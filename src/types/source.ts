export type SourceConfig = {
    movie_url: string;
    serial_url: string;
    anime_url: string;
    lastCrawlDate: Date;
    crawlCycle: number;
    cookies: [];
    disabled: boolean;
    disabledDate: Date;
    config: {
        sourceName: string;
        //------------------
        isGeneric: boolean;
        checkTrailers: boolean;
        header: string | boolean;
        is_censored: boolean;
        is_half_network: boolean;
        dontRemoveDimensions: boolean;
        //------------------
        has_watch_online: boolean;
        has_summary: boolean;
        has_poster: boolean;
        has_wide_poster: boolean;
        has_trailer: boolean;
        has_subtitle: boolean;
        use_google_cache: boolean;
        //------------------
        needHeadlessBrowser: boolean;
        sourceAuthStatus: SourceAuthStatus;
        vpnStatus: {
            poster: VPNStatus;
            trailer: VPNStatus;
            downloadLink: VPNStatus;
        };
        isTorrent: boolean;
        replaceInfoOnDuplicate: boolean;
        removeScriptAndStyleFromHtml: boolean;
    };
};

export type SourceExtractedData = {
    title: string;
    type: MovieType;
    year: string;
    pageNumber: number;
    pageLink: string;
    downloadLinks: CrawlerLink[];
    watchOnlineLinks: CrawlerLink[];
    torrentLinks: CrawlerLink[];
    persianSummary: string;
    poster: string;
    trailers: Trailer[];
    subtitles: Subtitle[];
    rating: Rating | null;
    cookies: [];
};

export type Rating = {
    imdb: number;
    tvmaze: number;
    mal: number;
    omdb: number;
};

export type Trailer = {
    url: string;
    info: string;
    sourceName: string;
};

export type Subtitle = {
    url: string;
};

export type CrawlerLink = {
    link: string;
    info: string;
    season: number;
    episode: number;
    sourceName: string;
    type: CrawlerLinkType;
    size: number;
    localLink: string;
    localLinkExpire: number | Date;
    okCount: number;
    badCount: number;
};

export enum MovieType {
    MOVIE = 'movie',
    SERIAL = 'serial',
    ANIME_MOVIE = 'anime_movie',
    ANIME_SERIAL = 'anime_serial',
}

export enum CrawlerLinkType {
    TORRENT = 'torrent',
    MAGNET = 'magnet',
    DIRECT = 'direct',
}

export enum SourceAuthStatus {
    OK = 'ok',
    NO_VPN = 'noVpn',
}

export enum VPNStatus {
    ALL_OK = 'allOk',
    NO_VPN = 'noVpn',
    VPN_ONLY = 'vpnOnly',
}
