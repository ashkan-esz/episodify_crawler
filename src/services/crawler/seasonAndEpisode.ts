import { OMDB } from '@/providers';
import type { OMDBFields } from '@/providers/omdb.provider';
import type { TVMazeFields } from '@/providers/tvmaze.provider';
import {
    type DownloadLink,
    type Episode,
    getEpisodeModelPlaceholder,
    MovieType,
    type Season,
    type SeasonWithEpisodesCount,
} from '@/types';
import { type Movie, type MoviesLatestData, MovieStatus } from '@/types/movie';
import { Crawler as CrawlerUtils, LinkUtils } from '@/utils';
import { extractAndParseNumber } from '@services/crawler/movieTitle';
import { saveError } from '@utils/logger';

export async function handleSeasonEpisodeUpdate(
    db_data: Movie,
    sourceName: string,
    site_links: DownloadLink[],
    siteWatchOnlineLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
    totalSeasons: number,
    omdbApiFields: OMDBFields | null,
    tvmazeApiFields: TVMazeFields | null,
    titleExist = true,
): Promise<{
    seasonsUpdateFlag: boolean;
    nextEpisodeUpdateFlag: boolean;
}> {

    const links_seasons = LinkUtils.groupSerialLinks(site_links, siteWatchOnlineLinks, torrentLinks);
    let seasonsUpdateFlag = handleLinksSeasonUpdate(db_data.seasons, links_seasons, sourceName);
    let nextEpisodeUpdateFlag = false;

    //omdb api
    if (omdbApiFields) {
        const omdbEpisodes = await OMDB.getEpisodesData(omdbApiFields.omdbTitle, omdbApiFields.yearIgnored, totalSeasons, db_data.premiered, titleExist);
        if (omdbEpisodes) {
            const result = updateSeasonEpisodeData(db_data.seasons, omdbEpisodes, 'omdb');
            seasonsUpdateFlag = result || seasonsUpdateFlag;
        }
    }

    //tvmaze api
    if (tvmazeApiFields) {
        db_data.nextEpisode = tvmazeApiFields.nextEpisode;
        nextEpisodeUpdateFlag = true;
        const result = updateSeasonEpisodeData(db_data.seasons, tvmazeApiFields.episodes, 'tvmaze');
        seasonsUpdateFlag = result || seasonsUpdateFlag;
    }

    const missedEpisodeResult = handleMissedSeasonEpisode(db_data.seasons);
    seasonsUpdateFlag = missedEpisodeResult || seasonsUpdateFlag;

    if (seasonsUpdateFlag) {
        db_data.seasons = db_data.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
        for (let i = 0; i < db_data.seasons.length; i++) {
            db_data.seasons[i].episodes = db_data.seasons[i].episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        }

        fixEpisodesZeroDuration(db_data.seasons, db_data.duration, db_data.type);
    }

    return {
        seasonsUpdateFlag,
        nextEpisodeUpdateFlag,
    };
}

export function handleSiteSeasonEpisodeUpdate(
    db_data: Movie,
    sourceName: string,
    site_links: DownloadLink[],
    siteWatchOnlineLinks: DownloadLink[],
    siteTorrentLinks: DownloadLink[],
): boolean {
    const links_seasons = LinkUtils.groupSerialLinks(site_links, siteWatchOnlineLinks, siteTorrentLinks);
    const seasonsUpdateFlag = handleLinksSeasonUpdate(db_data.seasons, links_seasons, sourceName);

    const missedEpisodeResult = handleMissedSeasonEpisode(db_data.seasons);

    if (seasonsUpdateFlag || missedEpisodeResult) {
        db_data.seasons = db_data.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
        for (let i = 0; i < db_data.seasons.length; i++) {
            db_data.seasons[i].episodes = db_data.seasons[i].episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        }

        fixEpisodesZeroDuration(db_data.seasons, db_data.duration, db_data.type);
    }

    return (seasonsUpdateFlag || missedEpisodeResult);
}

function updateSeasonEpisodeData(
    db_seasons: Season[],
    currentEpisodes: Episode[],
    apiName: string,
): boolean {
    let updateFlag = false;

    for (let i = 0; i < currentEpisodes.length; i++) {
        const seasonNumber = currentEpisodes[i].season ?? 0;
        const episodeNumber = currentEpisodes[i].episode ?? 0;
        delete currentEpisodes[i].season;
        delete currentEpisodes[i].episode;
        const checkSeason = db_seasons.find(item => item.seasonNumber === seasonNumber);
        if (checkSeason) {
            //season exist
            const checkEpisode = checkSeason.episodes.find(item => item.episodeNumber === episodeNumber);
            if (checkEpisode) {
                //episode exist
                if (handleEpisodeDataUpdate(checkEpisode, currentEpisodes[i], apiName)) {
                    updateFlag = true;
                }
            } else {
                //new episode
                checkSeason.episodes.push({
                    ...currentEpisodes[i],
                    episodeNumber: episodeNumber,
                    links: [],
                    watchOnlineLinks: [],
                    torrentLinks: [],
                });
                updateFlag = true;
            }
        } else {
            //new season
            db_seasons.push({
                seasonNumber: seasonNumber,
                episodes: [{
                    ...currentEpisodes[i],
                    episodeNumber: episodeNumber,
                    links: [],
                    watchOnlineLinks: [],
                    torrentLinks: [],
                }],
            });
            updateFlag = true;
        }
    }

    return updateFlag;
}

function handleEpisodeDataUpdate(
    prevEpisode: Episode,
    currentEpisode: Episode,
    apiName: string,
): boolean {
    try {
        let episodeUpdated = false;

        const checkFields = ['title', 'duration', 'released', 'releaseStamp', 'imdbRating', 'imdbID'];
        const badValues = ['TBA', 'N/A', 'unknown', '0', '0 min'];

        for (let i = 0; i < checkFields.length; i++) {
            const key = checkFields[i];
            // @ts-expect-error ...
            if (!currentEpisode[key] || badValues.includes(currentEpisode[key])) {
                continue;
            }
            if (key === 'title') {
                const currentTitle = currentEpisode[key].toString();
                const prevTitle = prevEpisode[key].toString();
                const t1 = getNormalizedEpisodeTitle(prevTitle);
                const t2 = getNormalizedEpisodeTitle(currentTitle);
                const t3 = prevEpisode[key].replace(/\*/g, '\\*').replace(/\?/g, '\\?');
                const t4 = CrawlerUtils.replaceSpecialCharacters(t3);

                if (!prevTitle || (
                    t1 !== t2 &&
                    !extractAndParseNumber(currentTitle).match(/^(Episode|Part) #?\d+(\.\d+)?$/i) &&
                    !currentTitle.match(new RegExp(`chapter .+ \'?${t3}\'?`, 'i')) &&
                    !currentTitle.match(new RegExp(`chapter .+ \'?${t4}\'?`, 'i')) &&
                    !currentTitle.match(new RegExp(`.*trail: \'?${t3}\'?`, 'i'))
                )) {
                    prevEpisode[key] = currentEpisode[key];
                    episodeUpdated = true;
                }
            } else if (key === 'duration') {
                if ((prevEpisode[key] !== currentEpisode[key]) && (!prevEpisode[key] || badValues.includes(prevEpisode[key]) || apiName !== 'omdb')) {
                    prevEpisode[key] = currentEpisode[key];
                    episodeUpdated = true;
                }
            } else if (key === 'released') {
                if ((prevEpisode[key] !== currentEpisode[key]) && (!prevEpisode[key] || badValues.includes(prevEpisode[key]) || apiName !== 'omdb')) {
                    prevEpisode[key] = currentEpisode[key];
                    episodeUpdated = true;
                }
                // @ts-expect-error ...
            } else if (prevEpisode[key] !== currentEpisode[key]) {
                // @ts-expect-error ...
                prevEpisode[key] = currentEpisode[key];
                episodeUpdated = true;
            }
        }

        return episodeUpdated;
    } catch (error) {
        saveError(error);
        return false;
    }
}

function handleLinksSeasonUpdate(
    db_seasons: Season[],
    currentSeasons: Season[],
    sourceName: string,
): boolean {
    let updateFlag = false;
    for (let i = 0; i < currentSeasons.length; i++) {
        const checkSeason = db_seasons.find(item => item.seasonNumber === currentSeasons[i].seasonNumber);
        if (checkSeason) {
            //season exist
            const prevEpisodes = checkSeason.episodes;
            const currentEpisodes = currentSeasons[i].episodes;
            for (let j = 0; j < currentEpisodes.length; j++) {
                const checkEpisode = prevEpisodes.find(item => item.episodeNumber === currentEpisodes[j].episodeNumber);
                if (checkEpisode) {
                    //episode exist
                    checkEpisode.checked = true;
                    //get source links
                    const prevLinks = checkEpisode.links.filter(item => item.sourceName === sourceName);
                    const prevOnlineLinks = checkEpisode.watchOnlineLinks.filter(item => item.sourceName === sourceName);
                    const prevTorrentLinks = checkEpisode.torrentLinks;
                    const currentLinks = currentEpisodes[j].links;
                    const currentOnlineLinks = currentEpisodes[j].watchOnlineLinks;
                    const currentTorrentLinks = currentEpisodes[j].torrentLinks;
                    const linkUpdateResult = LinkUtils.updateSerialLinks(checkEpisode, prevLinks, prevOnlineLinks, prevTorrentLinks, currentLinks, currentOnlineLinks, currentTorrentLinks);
                    updateFlag = linkUpdateResult || updateFlag;
                } else {
                    //new episode
                    currentEpisodes[j].checked = true;
                    checkSeason.episodes.push(currentEpisodes[j]);
                    updateFlag = true;
                }
            }
        } else {
            //new season
            for (let j = 0; j < currentSeasons[i].episodes.length; j++) {
                currentSeasons[i].episodes[j].checked = true;
            }
            db_seasons.push(currentSeasons[i]);
            updateFlag = true;
        }
    }

    //handle removed episode links
    for (let i = 0; i < db_seasons.length; i++) {
        const episodes = db_seasons[i].episodes;
        for (let j = 0; j < episodes.length; j++) {
            if (!episodes[j].checked) {
                const prevLength = episodes[j].links.length;
                const prevOnlineLength = episodes[j].watchOnlineLinks.length;
                episodes[j].links = episodes[j].links.filter(link => link.sourceName !== sourceName);
                episodes[j].watchOnlineLinks = episodes[j].watchOnlineLinks.filter(link => link.sourceName !== sourceName);
                const newLength = episodes[j].links.length;
                const newOnlineLength = episodes[j].watchOnlineLinks.length;
                if (prevLength !== newLength || prevOnlineLength !== newOnlineLength) {
                    updateFlag = true;
                }
            }
            delete episodes[j].checked;
        }
    }

    return updateFlag;
}

function handleMissedSeasonEpisode(
    db_seasons: Season[],
): boolean {
    let missedSeasonEpisodeFlag = false;
    for (let i = 0; i < db_seasons.length; i++) {
        const seasonNumber = db_seasons[i].seasonNumber;
        const episodes = db_seasons[i].episodes;
        const maxEpisodeNumber = Math.max(...episodes.map(item => item.episodeNumber));
        if (seasonNumber === 0) {
            continue;
        }

        for (let j = 1; j <= maxEpisodeNumber; j++) {
            let episodeExist = false;
            for (let k = 0; k < episodes.length; k++) {
                if (j === episodes[k].episodeNumber) {
                    episodeExist = true;
                    break;
                }
            }
            if (!episodeExist) {
                const episodeModel = getEpisodeModelPlaceholder(seasonNumber, j);
                delete episodeModel.season;
                delete episodeModel.episode;
                episodes.push({
                    ...episodeModel,
                    episodeNumber: j,
                    links: [],
                    watchOnlineLinks: [],
                    torrentLinks: [],
                });
                missedSeasonEpisodeFlag = true;
            }
        }
    }

    const maxSeasonNumber = Math.max(...db_seasons.map(item => item.seasonNumber));
    for (let j = 1; j <= maxSeasonNumber; j++) {
        let seasonExist = false;
        for (let k = 0; k < db_seasons.length; k++) {
            if (j === db_seasons[k].seasonNumber) {
                seasonExist = true;
                break;
            }
        }
        if (!seasonExist) {
            db_seasons.push({
                seasonNumber: j,
                episodes: [],
            });
            missedSeasonEpisodeFlag = true;
        }
    }

    return missedSeasonEpisodeFlag;
}

function fixEpisodesZeroDuration(
    seasons: Season[],
    duration: string,
    type: MovieType,
): void {
    const badCases = [null, 'null min', '', 'N/A', 'N/A min', '0 min'];
    duration = (!duration || badCases.includes(duration)) ? '0 min' : duration;
    if (duration === '0 min' && type === 'anime_serial') {
        duration = '24 min';
    }

    for (let i = 0; i < seasons.length; i++) {
        const episodes = seasons[i].episodes;
        for (let j = 0; j < episodes.length; j++) {
            if (!badCases.includes(episodes[j].duration) && episodes[j].duration && !isNaN(Number(episodes[j].duration))) {
                episodes[j].duration = episodes[j].duration + ' min';
                continue;
            }
            if (badCases.includes(episodes[j].duration)) {
                let fixed = false;
                let prevEpisodesIndex = j;
                while (prevEpisodesIndex >= 0) {
                    if (!badCases.includes(episodes[prevEpisodesIndex].duration)) {
                        episodes[j].duration = episodes[prevEpisodesIndex].duration;
                        fixed = true;
                        break;
                    }
                    prevEpisodesIndex--;
                }
                if (!fixed) {
                    let nextEpisodesIndex = j;
                    while (nextEpisodesIndex < episodes.length) {
                        if (!badCases.includes(episodes[nextEpisodesIndex].duration)) {
                            episodes[j].duration = episodes[nextEpisodesIndex].duration;
                            fixed = true;
                            break;
                        }
                        nextEpisodesIndex++;
                    }
                }
                if (!fixed) {
                    episodes[j].duration = duration;
                }
            }
        }
    }
}

export function getTotalDuration(
    seasons: Season[],
    latestData: MoviesLatestData,
    type: MovieType,
): string {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, s, e] = latestData.torrentLinks.split(/[se]/gi).map((item) => Number(item));
    const torrentSeason = s || 0;
    const torrentEpisode = e || 0;
    let latestSeason = latestData.season;
    let latestEpisode = latestData.episode;
    if (
        latestSeason < torrentSeason ||
        (latestSeason === torrentSeason && latestEpisode < torrentEpisode)
    ) {
        latestSeason = torrentSeason;
        latestEpisode = torrentEpisode;
    }

    let totalDuration: number | string = 0;
    let episodeCounter = 0;
    for (let i = 0; i < seasons.length; i++) {
        if (
            seasons[i].seasonNumber <= latestSeason ||
            seasons[i].episodes.find(
                (item) =>
                    item.links.length > 0 ||
                    item.watchOnlineLinks.length > 0 ||
                    item.torrentLinks.length > 0,
            )
        ) {
            const episodes = seasons[i].episodes;
            for (let j = 0; j < episodes.length; j++) {
                if (
                    seasons[i].seasonNumber < latestSeason ||
                    episodes[j].episodeNumber <= latestEpisode ||
                    episodes[j].links.length > 0 ||
                    episodes[j].watchOnlineLinks.length > 0 ||
                    episodes[j].torrentLinks.length > 0
                ) {
                    episodeCounter++;
                    totalDuration += Number(episodes[j].duration.replace('min', ''));
                }
            }
        }
    }
    if (totalDuration === 0) {
        const temp = type === MovieType.ANIME_SERIAL ? 24 : 45;
        totalDuration = episodeCounter * temp;
    }
    const hours = Math.floor(totalDuration / 60);
    const minutes = totalDuration % 60;
    totalDuration = hours + ':' + minutes;
    return totalDuration;
}

export function getEndYear(seasons: Season[], status: MovieStatus, year: string): string {
    if (status === MovieStatus.ENDED) {
        if (seasons.length > 0) {
            const lastSeason = seasons[seasons.length - 1];
            const lastEpisode = lastSeason.episodes[lastSeason.episodes.length - 1];
            return lastEpisode.released.split('-')[0];
        }

        return year;
    }
    // running
    return '';
}

export function getSeasonEpisode(seasons: Season[]): SeasonWithEpisodesCount[] {
    const res: SeasonWithEpisodesCount[] = [];
    for (let i = 0; i < seasons.length; i++) {
        const season = seasons[i].seasonNumber;
        const episodes = seasons[i].episodes.length;
        if (episodes > 0) {
            res.push({
                seasonNumber: season,
                episodes: episodes,
            });
        }
    }
    return res;
}

function getNormalizedEpisodeTitle(title: string): string {
    title = title
        .toLowerCase()
        .replace(/ \(\d+\)$/, (r: string) => ' part ' + (r.match(/\d+/)?.[0] ?? ''))
        .replace(/&quot;/g, '');
    return CrawlerUtils.replaceSpecialCharacters(title)
        .replace(' n ', ' and ')
        .replace('the ', '')
        .replace(' one', ' 1')
        .replace(' two', ' 2')
        .replace(' three', ' 3')
        .replace(' four', ' 4')
        .replace(/pt (?=\d)/, 'part ')
        .replace(/part i+/, (r) => r.replace('iii', '3').replace('ii', '2').replace('i', '1'))
        .replace('part 1', '')
        .replace(/s..t/gi, 'shit')
        .replace(/f..k/gi, 'fuck')
        .replace(/f..ing/gi, 'fucking')
        .replace(/[eaos]/g, '')
        .replace(/the\s/g, '')
        .replace(/\s|́|́/g, '');
}
