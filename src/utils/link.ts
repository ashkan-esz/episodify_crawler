import {
    DownloadLink,
    getEpisodeModelPlaceholder,
    MoviesGroupedLink,
    Quality,
    Season,
} from '@/types';
import { checkBetterQuality, removeDuplicateLinks } from '@/utils/crawler';

export function checkFormat(link: string, title: string): boolean {
    link = link.toLowerCase().trim();
    const videoExtensionsRegex =
        /\.(avi|flv|m4v|mkv|mka|mov|mp4|mpg|mpeg|rm|swf|wmv|3gp|3g2)(\?((md\d)|(par))=.+)?$/i;
    return (
        videoExtensionsRegex.test(link.replace(/\?\d+/g, '')) &&
        !link.includes('teaser') &&
        !link.includes('trailer') &&
        !link.includes('trialer') &&
        !link.includes('/sound/') &&
        !link.includes('opening.mp4') &&
        !link.includes('intro.mp4') &&
        !link.match(/dubbed\.audio\.\(irib\)\.mkv/) &&
        !link.match(/s\d+\.mp4/) &&
        !link.replace(/the|\s|\./g, '').includes(title.replace(/the|\s|\./g, '') + 'mp4')
    );
}

//----------------------------------------
//----------------------------------------

export function groupSerialLinks(
    links: DownloadLink[],
    watchOnlineLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
): Season[] {
    let result: Season[] = [];

    for (let i = 0; i < links.length; i++) {
        let seasonExist = false;
        for (let j = 0; j < result.length; j++) {
            if (result[j].seasonNumber === links[i].season) {
                seasonExist = true;
                let episodeExist = false;
                for (let k = 0; k < result[j].episodes.length; k++) {
                    if (result[j].episodes[k].episodeNumber === links[i].episode) {
                        episodeExist = true;
                        result[j].episodes[k].links.push(links[i]);
                        break;
                    }
                }
                if (!episodeExist) {
                    const episodeModel = getEpisodeModelPlaceholder(
                        links[i].season,
                        links[i].episode,
                    );
                    delete episodeModel.season;
                    delete episodeModel.episode;
                    result[j].episodes.push({
                        ...episodeModel,
                        episodeNumber: links[i].episode,
                        links: [links[i]],
                        watchOnlineLinks: [],
                        torrentLinks: [],
                    });
                }
                break;
            }
        }
        if (!seasonExist) {
            const episodeModel = getEpisodeModelPlaceholder(links[i].season, links[i].episode);
            delete episodeModel.season;
            delete episodeModel.episode;
            result.push({
                seasonNumber: links[i].season,
                episodes: [
                    {
                        ...episodeModel,
                        episodeNumber: links[i].episode,
                        links: [links[i]],
                        watchOnlineLinks: [],
                        torrentLinks: [],
                    },
                ],
            });
        }
    }

    //-------------------------------------------
    for (let i = 0; i < watchOnlineLinks.length; i++) {
        let seasonExist = false;
        for (let j = 0; j < result.length; j++) {
            if (result[j].seasonNumber === watchOnlineLinks[i].season) {
                seasonExist = true;
                let episodeExist = false;
                for (let k = 0; k < result[j].episodes.length; k++) {
                    if (result[j].episodes[k].episodeNumber === watchOnlineLinks[i].episode) {
                        episodeExist = true;
                        result[j].episodes[k].watchOnlineLinks.push(watchOnlineLinks[i]);
                        break;
                    }
                }
                if (!episodeExist) {
                    const episodeModel = getEpisodeModelPlaceholder(
                        watchOnlineLinks[i].season,
                        watchOnlineLinks[i].episode,
                    );
                    delete episodeModel.season;
                    delete episodeModel.episode;
                    result[j].episodes.push({
                        ...episodeModel,
                        episodeNumber: watchOnlineLinks[i].episode,
                        links: [],
                        watchOnlineLinks: [watchOnlineLinks[i]],
                        torrentLinks: [],
                    });
                }
                break;
            }
        }
        if (!seasonExist) {
            const episodeModel = getEpisodeModelPlaceholder(
                watchOnlineLinks[i].season,
                watchOnlineLinks[i].episode,
            );
            delete episodeModel.season;
            delete episodeModel.episode;
            result.push({
                seasonNumber: watchOnlineLinks[i].season,
                episodes: [
                    {
                        ...episodeModel,
                        episodeNumber: watchOnlineLinks[i].episode,
                        links: [],
                        watchOnlineLinks: [watchOnlineLinks[i]],
                        torrentLinks: [],
                    },
                ],
            });
        }
    }

    //-------------------------------------------

    for (let i = 0; i < torrentLinks.length; i++) {
        let seasonExist = false;
        for (let j = 0; j < result.length; j++) {
            if (result[j].seasonNumber === torrentLinks[i].season) {
                seasonExist = true;
                let episodeExist = false;
                for (let k = 0; k < result[j].episodes.length; k++) {
                    if (result[j].episodes[k].episodeNumber === torrentLinks[i].episode) {
                        episodeExist = true;
                        result[j].episodes[k].torrentLinks.push(torrentLinks[i]);
                        break;
                    }
                }
                if (!episodeExist) {
                    const episodeModel = getEpisodeModelPlaceholder(
                        torrentLinks[i].season,
                        torrentLinks[i].episode,
                    );
                    delete episodeModel.season;
                    delete episodeModel.episode;
                    result[j].episodes.push({
                        ...episodeModel,
                        episodeNumber: torrentLinks[i].episode,
                        links: [],
                        watchOnlineLinks: [],
                        torrentLinks: [torrentLinks[i]],
                    });
                }
                break;
            }
        }
        if (!seasonExist) {
            const episodeModel = getEpisodeModelPlaceholder(
                torrentLinks[i].season,
                torrentLinks[i].episode,
            );
            delete episodeModel.season;
            delete episodeModel.episode;
            result.push({
                seasonNumber: torrentLinks[i].season,
                episodes: [
                    {
                        ...episodeModel,
                        episodeNumber: torrentLinks[i].episode,
                        links: [],
                        watchOnlineLinks: [],
                        torrentLinks: [torrentLinks[i]],
                    },
                ],
            });
        }
    }
    //-------------------------------------------

    result = result.sort((a, b) => a.seasonNumber - b.seasonNumber);
    for (let i = 0; i < result.length; i++) {
        result[i].episodes = result[i].episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

        //sort links
        for (let j = 0; j < result[i].episodes.length; j++) {
            result[i].episodes[j].links = sortLinksByQuality(result[i].episodes[j].links);
            result[i].episodes[j].watchOnlineLinks = sortLinksByQuality(
                result[i].episodes[j].watchOnlineLinks,
            );
            result[i].episodes[j].torrentLinks = sortLinksByQuality(
                result[i].episodes[j].torrentLinks,
                true,
            );
        }
    }

    return result;
}

export function groupMovieLinks(
    links: DownloadLink[],
    watchOnlineLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
): MoviesGroupedLink[] {
    const qualities: MoviesGroupedLink[] = [
        { quality: Quality['2160p'], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality['1080p'], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality['720p'], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality['480p'], links: [], watchOnlineLinks: [], torrentLinks: [] },
        { quality: Quality['360p'], links: [], watchOnlineLinks: [], torrentLinks: [] },
        {
            quality: Quality['others'],
            links: [],
            watchOnlineLinks: [],
            torrentLinks: [],
        },
    ];

    for (let i = 0; i < links.length; i++) {
        let matchQuality = false;
        for (let j = 0; j < qualities.length; j++) {
            if (links[i].info.includes(qualities[j].quality)) {
                qualities[j].links.push(links[i]);
                matchQuality = true;
                break;
            }
        }
        if (!matchQuality) {
            const q = qualities.find((item) => item.quality === 'others');
            if (q) {
                q.links.push(links[i]);
            }
        }
    }

    for (let i = 0; i < watchOnlineLinks.length; i++) {
        let matchQuality = false;
        for (let j = 0; j < qualities.length; j++) {
            if (watchOnlineLinks[i].info.includes(qualities[j].quality)) {
                qualities[j].watchOnlineLinks.push(watchOnlineLinks[i]);
                matchQuality = true;
                break;
            }
        }
        if (!matchQuality) {
            const q = qualities.find((item) => item.quality === 'others');
            if (q) {
                q.watchOnlineLinks.push(watchOnlineLinks[i]);
            }
        }
    }

    for (let i = 0; i < torrentLinks.length; i++) {
        let matchQuality = false;
        for (let j = 0; j < qualities.length; j++) {
            if (torrentLinks[i].info.includes(qualities[j].quality)) {
                qualities[j].torrentLinks.push(torrentLinks[i]);
                matchQuality = true;
                break;
            }
        }
        if (!matchQuality) {
            const q = qualities.find((item) => item.quality === 'others');
            if (q) {
                q.torrentLinks.push(torrentLinks[i]);
            }
        }
    }

    //sort links
    for (let i = 0; i < qualities.length; i++) {
        qualities[i].links = sortLinksByQuality(qualities[i].links);
        qualities[i].watchOnlineLinks = sortLinksByQuality(qualities[i].watchOnlineLinks);
        qualities[i].torrentLinks = sortLinksByQuality(qualities[i].torrentLinks, true);
    }

    return qualities;
}

export function updateMoviesGroupedLinks(
    prevGroupedLinks: MoviesGroupedLink[],
    currentGroupedLinks: MoviesGroupedLink[],
    sourceName: string,
    ): boolean {
    let updateFlag = false;
    for (let i = 0; i < currentGroupedLinks.length; i++) {
        const checkQuality = prevGroupedLinks.find(
            (item) => item.quality === currentGroupedLinks[i].quality,
        );

        if (checkQuality) {
            //quality exist
            checkQuality.checked = true;
            //get source links
            const prevLinks = checkQuality.links.filter((item) => item.sourceName === sourceName);
            const prevOnlineLinks = checkQuality.watchOnlineLinks.filter(
                (item) => item.sourceName === sourceName,
            );
            const prevTorrentLinks = checkQuality.torrentLinks;
            const currentLinks = currentGroupedLinks[i].links;
            const currentOnlineLinks = currentGroupedLinks[i].watchOnlineLinks;
            const currentTorrentLinks = currentGroupedLinks[i].torrentLinks;
            const linkUpdateResult = updateSerialLinks(
                checkQuality,
                prevLinks,
                prevOnlineLinks,
                prevTorrentLinks,
                currentLinks,
                currentOnlineLinks,
                currentTorrentLinks,
            );
            updateFlag = linkUpdateResult || updateFlag;
        } else {
            //new quality
            currentGroupedLinks[i].checked = true;
            prevGroupedLinks.push(currentGroupedLinks[i]);
            updateFlag = true;
        }
    }

    //handle removed quality links
    for (let i = 0; i < prevGroupedLinks.length; i++) {
        if (!prevGroupedLinks[i].checked) {
            const prevLength = prevGroupedLinks[i].links.length;
            const prevOnlineLength = prevGroupedLinks[i].watchOnlineLinks.length;
            prevGroupedLinks[i].links = prevGroupedLinks[i].links.filter(
                (link) => link.sourceName !== sourceName,
            );
            prevGroupedLinks[i].watchOnlineLinks = prevGroupedLinks[i].watchOnlineLinks.filter(
                (link) => link.sourceName !== sourceName,
            );
            const newLength = prevGroupedLinks[i].links.length;
            const newOnlineLength = prevGroupedLinks[i].watchOnlineLinks.length;
            if (prevLength !== newLength || prevOnlineLength !== newOnlineLength) {
                updateFlag = true;
            }
        }
        delete prevGroupedLinks[i].checked;
    }

    return updateFlag;
}

export function updateSerialLinks(
    checkEpisode: MoviesGroupedLink,
    prevLinks: DownloadLink[],
    prevOnlineLinks: DownloadLink[],
    prevTorrentLinks: DownloadLink[],
    currentLinks: DownloadLink[],
    currentOnlineLinks: DownloadLink[],
    currentTorrentLinks: DownloadLink[],
): boolean {
    let updateFlag = false;

    let linksUpdateNeed = prevLinks.length !== currentLinks.length;
    if (!linksUpdateNeed) {
        for (let k = 0; k < prevLinks.length; k++) {
            //check changed links
            if (!checkEqualLinks(prevLinks[k], currentLinks[k])) {
                linksUpdateNeed = true;
                break;
            }
        }
    }
    if (linksUpdateNeed) {
        //remove prev link
        const removeLinks = prevLinks.map((item) => item.link);
        checkEpisode.links = checkEpisode.links.filter((item) => !removeLinks.includes(item.link));
        //add current links
        checkEpisode.links = [...checkEpisode.links, ...currentLinks];
        checkEpisode.links = sortLinksByQuality(checkEpisode.links);
        updateFlag = true;
    }

    //-----------------------------------------

    let onlineLinksUpdateNeed = prevOnlineLinks.length !== currentOnlineLinks.length;
    if (!onlineLinksUpdateNeed) {
        for (let k = 0; k < prevOnlineLinks.length; k++) {
            //check changed links
            if (!checkEqualLinks(prevOnlineLinks[k], currentOnlineLinks[k])) {
                onlineLinksUpdateNeed = true;
                break;
            }
        }
    }
    if (onlineLinksUpdateNeed) {
        //remove prev link
        const removeLinks = prevOnlineLinks.map((item) => item.link);
        checkEpisode.watchOnlineLinks = checkEpisode.watchOnlineLinks.filter(
            (item) => !removeLinks.includes(item.link),
        );
        //add current links
        checkEpisode.watchOnlineLinks = [...checkEpisode.watchOnlineLinks, ...currentOnlineLinks];
        checkEpisode.watchOnlineLinks = sortLinksByQuality(checkEpisode.watchOnlineLinks);
        updateFlag = true;
    }

    //-----------------------------------------

    const prevTorrentLength = prevTorrentLinks.length;
    const newTorrentLinksArray = removeDuplicateLinks([
        ...prevTorrentLinks,
        ...currentTorrentLinks,
    ]);
    const newTorrentLength = newTorrentLinksArray.length;
    if (prevTorrentLength !== newTorrentLength) {
        checkEpisode.torrentLinks = sortLinksByQuality(newTorrentLinksArray, true);
        updateFlag = true;
    }

    return updateFlag;
}

export function checkEqualLinks(link1: DownloadLink, link2: DownloadLink) {
    return (
        link1.link === link2.link &&
        link1.info === link2.info &&
        link1.qualitySample === link2.qualitySample &&
        link1.season === link2.season &&
        link1.episode === link2.episode
    );
}

export function sortLinksByQuality(links: DownloadLink[], handleMalformedInfo: boolean = false) {
    return links.sort((a, b) =>
        checkBetterQuality(a.info, b.info, false, handleMalformedInfo) ? -1 : 1,
    );
}
