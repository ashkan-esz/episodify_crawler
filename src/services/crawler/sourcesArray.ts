import {
    type CrawlerExtraConfigs,
    SourceAuthStatus,
    type SourceConfig,
    type SourceConfigC,
    VPNStatus,
} from '@/types';
import * as film2movie from '@/sources/film2movie';
import * as tokyotosho from '@/torrent/sources/tokyotosho';
import * as shanaproject from '@/torrent/sources/shanaproject';
import * as nyaa from '@/torrent/sources/nyaa';
import * as eztv from '@/torrent/sources/eztv';
import { SourcesRepo } from '@/repo';

export const sourcesNames = Object.freeze([
    'film2movie',
    'tokyotosho',
    'shanaproject',
    'nyaa',
    'eztv', // torrent
]);
export const torrentSourcesNames = Object.freeze(['tokyotosho', 'shanaproject', 'nyaa', 'eztv']);
export const sortPostersOrder = Object.freeze(['film2movie', 's3Poster']);
export const sortTrailersOrder = Object.freeze(['film2movie', 's3Trailer']);

export function getSourcesMethods(): {
    film2movie: any;
    tokyotosho: any;
    shanaproject: any;
    nyaa: any;
    eztv: any;
} {
    return {
        film2movie: film2movie,
        tokyotosho: tokyotosho,
        shanaproject: shanaproject,
        nyaa: nyaa,
        eztv: eztv,
    };
}

export function getSourcesArray(
    sourcesObj: {
        film2movie: SourceConfig;
        tokyotosho: SourceConfig;
        shanaproject: SourceConfig;
        nyaa: SourceConfig;
        eztv: SourceConfig;
    },
    crawlMode: number,
    extraConfigs: CrawlerExtraConfigs,
): {
    name: string;
    configs: SourceConfigC;
    starter: () => Promise<number[]>;
}[] {
    const pageCount = crawlMode === 0 ? 1 : crawlMode === 1 ? 20 : null;

    return [
        {
            name: 'film2movie',
            configs: sourcesObj.film2movie.config,
            starter: () => {
                return film2movie.default(sourcesObj.film2movie, pageCount, extraConfigs);
            },
        },
        {
            name: 'tokyotosho',
            configs: sourcesObj.tokyotosho.config,
            starter: () => {
                return tokyotosho.default(sourcesObj.tokyotosho, pageCount, extraConfigs);
            },
        },
        {
            name: 'shanaproject',
            configs: sourcesObj.shanaproject.config,
            starter: () => {
                return shanaproject.default(sourcesObj.shanaproject, pageCount, extraConfigs);
            },
        },
        {
            name: 'nyaa',
            configs: sourcesObj.nyaa.config,
            starter: () => {
                return nyaa.default(sourcesObj.nyaa, pageCount, extraConfigs);
            },
        },
        {
            name: 'eztv',
            configs: sourcesObj.eztv.config,
            starter: () => {
                return eztv.default(sourcesObj.eztv, pageCount, extraConfigs);
            },
        },
    ];
}

export function sourcesOb(): any {
    const now = new Date();
    const obj = {
        title: 'sources',
    };

    const sampleSourceConfig: SourceConfig = {
        movie_url: '',
        serial_url: '',
        anime_url: '',
        crawlCycle: 0,
        disabled: true,
        isManualDisable: false,
        cookies: [],
        addDate: now,
        disabledDate: now,
        lastCrawlDate: null,
        lastDomainChangeDate: null,
        lastConfigUpdateDate: null,
        description: '',
        status: {
            notRespondingFrom: 0,
            lastCheck: 0,
        },
        config: {
            sourceName: '',
            //------------------
            isGeneric: false,
            checkTrailers: false,
            headers: '',
            //------------------
            is_censored: false,
            is_half_network: false,
            dontRemoveDimensions: false,
            //------------------
            has_watch_online: false,
            has_summary: true,
            has_poster: true,
            has_wide_poster: true,
            has_trailer: true,
            has_subtitle: false,
            use_google_cache: false,
            //------------------
            needHeadlessBrowser: false,
            sourceAuthStatus: SourceAuthStatus.OK,
            vpnStatus: {
                poster: VPNStatus.VPN_ONLY,
                trailer: VPNStatus.VPN_ONLY,
                downloadLink: VPNStatus.VPN_ONLY,
            },
            isTorrent: false,
            replaceInfoOnDuplicate: true,
            removeScriptAndStyleFromHtml: false,
        },
    };

    for (let i = 0; i < sourcesNames.length; i++) {
        const newSource = JSON.parse(JSON.stringify(sampleSourceConfig));
        newSource.config.sourceName = sourcesNames[i];
        newSource.config.isTorrent = false;
        newSource.config.removeScriptAndStyleFromHtml = true;
        // @ts-expect-error ...
        obj[sourcesNames[i]] = newSource;
    }

    for (let i = 0; i < torrentSourcesNames.length; i++) {
        const newSource = JSON.parse(JSON.stringify(sampleSourceConfig));
        newSource.config.sourceName = torrentSourcesNames[i];
        newSource.config.isTorrent = true;
        newSource.config.removeScriptAndStyleFromHtml = false;
        // @ts-expect-error ...
        obj[torrentSourcesNames[i]] = newSource;
    }

    for (let i = 0; i < defaultGenericSources.length; i++) {
        const newSource = JSON.parse(JSON.stringify(defaultGenericSources[i]));
        const name = newSource.config.sourceName;
        // @ts-expect-error ...
        obj[name] = newSource;
    }

    return obj;
}

export async function insertSources(): Promise<string> {
    const sources = sourcesOb();

    const existingSources = await SourcesRepo.getSourcesObjDB();
    if (existingSources === "error") {
        return "error";
    }

    if (!existingSources) {
        // Sources doesn't exist at all, insert them
        const insertResult = await SourcesRepo.insertSourcesObjDB(sources);
        if (insertResult) {
            return 'ok';
        }

        return 'error';
    }

    let updateNeeded = false;
    const keys = Object.keys(sources);
    for (let i = 0; i < keys.length; i++) {
        if (existingSources[keys[i]] === undefined) {
            updateNeeded = true;
            existingSources[keys[i]] = sources[keys[i]];
        }
    }

    if (updateNeeded) {
        await SourcesRepo.updateSourcesObjDB(existingSources);
    }

    return 'ok';
}

export const defaultGenericSources: SourceConfig[] = [
    {
        movie_url: 'https://vipofilm.com/category/film1/page/',
        serial_url: '',
        anime_url: '',
        lastCrawlDate: null,
        lastDomainChangeDate: null,
        lastConfigUpdateDate: null,
        description: '',
        status: {
            notRespondingFrom: 0,
            lastCheck: 0,
        },
        crawlCycle: 0,
        cookies: [],
        disabled: true,
        isManualDisable: true,
        addDate: new Date(),
        disabledDate: new Date(),
        config: {
            sourceName: 'vipofilm',
            isGeneric: true,
            checkTrailers: false,
            headers: '{\n' +
                '    "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",\n' +
                '    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp",\n' +
                '    "Connection": "keep-alive",\n' +
                '    "Cookie": "analytics_token=c09c6121-cd28-676a-4afa-542f3afa1f51; _yngt=01JJQEES36PQYJ5NHVY1CD27SZ; _yngt_iframe=1; _lscache_vary=8bb6e3a92bc06f19362bac3601fa2972; analytics_session_token=800bc097-c9f2-b0b3-cf5d-53d019230679; yektanet_session_last_activity=2/1/2025; content-view-yn-notification-17161=12"\n' +
                '}\n',
            //------------------
            is_censored: false,
            is_half_network: false,
            dontRemoveDimensions: false,
            //------------------
            has_watch_online: false,
            has_summary: true,
            has_poster: true,
            has_wide_poster: true,
            has_trailer: true,
            has_subtitle: false,
            use_google_cache: false,
            //------------------
            needHeadlessBrowser: false,
            sourceAuthStatus: SourceAuthStatus.OK,
            vpnStatus: Object.freeze({
                poster: VPNStatus.ALL_OK,
                trailer: VPNStatus.ALL_OK,
                downloadLink: VPNStatus.NO_VPN,
            }),
            isTorrent: false,
            replaceInfoOnDuplicate: true,
            removeScriptAndStyleFromHtml: true,
        },
    },
    {
        movie_url: 'https://www.myf2m.com/movies/page/',
        serial_url: 'https://www.myf2m.com/series/page/',
        anime_url: '',
        lastCrawlDate: null,
        lastDomainChangeDate: null,
        lastConfigUpdateDate: null,
        description: '',
        status: {
            notRespondingFrom: 0,
            lastCheck: 0,
        },
        crawlCycle: 0,
        cookies: [],
        disabled: true,
        isManualDisable: true,
        addDate: new Date(),
        disabledDate: new Date(),
        config: {
            sourceName: 'f2m',
            isGeneric: true,
            checkTrailers: false,
            headers: '',
            //------------------
            is_censored: false,
            is_half_network: false,
            dontRemoveDimensions: false,
            //------------------
            has_watch_online: false,
            has_summary: true,
            has_poster: true,
            has_wide_poster: true,
            has_trailer: true,
            has_subtitle: false,
            use_google_cache: false,
            //------------------
            needHeadlessBrowser: false,
            sourceAuthStatus: SourceAuthStatus.OK,
            vpnStatus: Object.freeze({
                poster: VPNStatus.ALL_OK,
                trailer: VPNStatus.ALL_OK,
                downloadLink: VPNStatus.NO_VPN,
            }),
            isTorrent: false,
            replaceInfoOnDuplicate: true,
            removeScriptAndStyleFromHtml: true,
        },
    },
    {
        movie_url: 'https://bartarmoviz.com/category/movie/page/',
        serial_url: 'https://bartarmoviz.com/category/seris/page/',
        anime_url: '',
        lastCrawlDate: null,
        lastDomainChangeDate: null,
        lastConfigUpdateDate: null,
        description: '',
        status: {
            notRespondingFrom: 0,
            lastCheck: 0,
        },
        crawlCycle: 0,
        cookies: [],
        disabled: true,
        isManualDisable: true,
        addDate: new Date(),
        disabledDate: new Date(),
        config: {
            sourceName: 'bartarMoviez',
            isGeneric: true,
            checkTrailers: false,
            headers: '',
            //------------------
            is_censored: false,
            is_half_network: false,
            dontRemoveDimensions: false,
            //------------------
            has_watch_online: false,
            has_summary: true,
            has_poster: true,
            has_wide_poster: true,
            has_trailer: true,
            has_subtitle: false,
            use_google_cache: false,
            //------------------
            needHeadlessBrowser: false,
            sourceAuthStatus: SourceAuthStatus.OK,
            vpnStatus: {
                poster: VPNStatus.ALL_OK,
                trailer: VPNStatus.ALL_OK,
                downloadLink: VPNStatus.NO_VPN,
            },
            isTorrent: false,
            replaceInfoOnDuplicate: true,
            removeScriptAndStyleFromHtml: true,
        },
    },
    {
        movie_url: 'https://danofilm.com/?ad-s=1&type=movies&genr=all&countr=all&cat=all&hasdub=off&hassub=off&hasplay=off&order=news/page/',
        serial_url: '',
        anime_url: '',
        lastCrawlDate: null,
        lastDomainChangeDate: null,
        lastConfigUpdateDate: null,
        description: '',
        status: {
            notRespondingFrom: 0,
            lastCheck: 0,
        },
        crawlCycle: 0,
        cookies: [],
        disabled: true,
        isManualDisable: true,
        addDate: new Date(),
        disabledDate: new Date(),
        config: {
            sourceName: 'danofilm',
            isGeneric: true,
            checkTrailers: false,
            headers: '',
            //------------------
            is_censored: false,
            is_half_network: false,
            dontRemoveDimensions: false,
            //------------------
            has_watch_online: false,
            has_summary: true,
            has_poster: true,
            has_wide_poster: true,
            has_trailer: true,
            has_subtitle: false,
            use_google_cache: false,
            //------------------
            needHeadlessBrowser: false,
            sourceAuthStatus: SourceAuthStatus.OK,
            vpnStatus: {
                poster: VPNStatus.ALL_OK,
                trailer: VPNStatus.ALL_OK,
                downloadLink: VPNStatus.NO_VPN,
            },
            isTorrent: false,
            replaceInfoOnDuplicate: true,
            removeScriptAndStyleFromHtml: true,
        },
    },
];
