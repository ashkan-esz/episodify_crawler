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
        lastCrawlDate: new Date(0),
        lastDomainChangeDate: new Date(0),
        lastConfigUpdateDate: new Date(0),
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

    return obj;
}

export async function insertSources(): Promise<string> {
    const sources = await SourcesRepo.getSourcesObjDB();
    if (sources) {
        return 'ok';
    }

    const insertResult = await SourcesRepo.insertSourcesObjDB(sourcesOb());
    if (insertResult) {
        return 'ok';
    }

    return 'error';
}
