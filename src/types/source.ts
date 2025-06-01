import { DownloadLink } from '@/types/downloadLink';
import { MovieRates } from '@/types/movie';
import { Subtitle } from '@/types/subtitle';

export type SourceConfig = {
    movie_url: string;
    serial_url: string;
    anime_url: string;
    lastCrawlDate: Date;
    crawlCycle: number;
    cookies: [];
    disabled: boolean;
    isManualDisable: boolean;
    disabledDate: Date;
    addDate: Date;
    lastDomainChangeDate: Date,
    lastConfigUpdateDate: Date,
    userData: any;
    description: string;
    status: {
        notRespondingFrom: number;
        lastCheck: number;
    };
    config: {
        sourceName: string;
        //------------------
        isGeneric: boolean;
        checkTrailers: boolean;
        headers: string | boolean;
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
        vpnStatus: SourceVpnStatus;
        isTorrent: boolean;
        replaceInfoOnDuplicate: boolean;
        removeScriptAndStyleFromHtml: boolean;
    };
};

export type SourceVpnStatus = {
    poster: VPNStatus;
    trailer: VPNStatus;
    downloadLink: VPNStatus;
}

export type SourceExtractedData = {
    title: string;
    type: MovieType;
    year: string;
    pageNumber: number;
    pageLink: string;
    downloadLinks: DownloadLink[];
    watchOnlineLinks: DownloadLink[];
    torrentLinks: DownloadLink[];
    persianSummary: string;
    poster: string;
    trailers: Trailer[];
    subtitles: Subtitle[];
    rating: MovieRates | null;
    cookies: [];
};

export type Trailer = {
    url: string;
    info: string;
    sourceName: string;
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
