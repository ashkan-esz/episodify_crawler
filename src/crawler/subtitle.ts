import { GroupedSubtitle, Subtitle } from '@/types/subtitle';
import { checkBetterQuality } from '@utils/crawler';
import { saveError } from '@utils/logger';

export const subtitleFormatsRegex = /\.(srt|ssa|ttml|sbv|dfxp|vtt|txt|zip|rar)$/i;

export function handleSubtitlesUpdate(
    db_subtitles: GroupedSubtitle[],
    currentGroupedSubtitles: GroupedSubtitle[],
    sourceName: string,
): boolean {
    try {
        let updateFlag = false;
        for (let i = 0; i < currentGroupedSubtitles.length; i++) {
            const checkSeason = db_subtitles.find(
                (item) => item.seasonNumber === currentGroupedSubtitles[i].seasonNumber,
            );
            if (checkSeason) {
                //season exist
                checkSeason.checked = true;
                const prevLinks = checkSeason.links.filter(
                    (item) => item.sourceName === sourceName,
                );
                const currentLinks = currentGroupedSubtitles[i].links;
                const linkUpdateResult = updateSubtitleLinks(checkSeason, prevLinks, currentLinks);
                updateFlag = linkUpdateResult || updateFlag;
            } else {
                //new season
                currentGroupedSubtitles[i].checked = true;
                db_subtitles.push(currentGroupedSubtitles[i]);
                updateFlag = true;
            }
        }

        //handle removed subtitles
        for (let i = 0; i < db_subtitles.length; i++) {
            if (!db_subtitles[i].checked) {
                const prevLength = db_subtitles[i].links.length;
                db_subtitles[i].links = db_subtitles[i].links.filter(
                    (link) => link.sourceName !== sourceName,
                );
                const newLength = db_subtitles[i].links.length;
                if (prevLength !== newLength) {
                    updateFlag = true;
                }
            }
            delete db_subtitles[i].checked;
        }

        if (updateFlag) {
            db_subtitles = db_subtitles.sort((a, b) => a.seasonNumber - b.seasonNumber);
            for (let i = 0; i < db_subtitles.length; i++) {
                db_subtitles[i].links = db_subtitles[i].links.sort((a, b) => a.episode - b.episode);
            }
        }

        return updateFlag;
    } catch (error) {
        saveError(error);
        return false;
    }
}

export function groupSubtitles(subtitles: Subtitle[]): GroupedSubtitle[] {
    let result: GroupedSubtitle[] = [];

    for (let i = 0; i < subtitles.length; i++) {
        let seasonExist = false;
        for (let j = 0; j < result.length; j++) {
            if (result[j].seasonNumber === subtitles[i].season) {
                seasonExist = true;
                result[j].links.push(subtitles[i]);
                break;
            }
        }
        if (!seasonExist) {
            result.push({
                seasonNumber: subtitles[i].season,
                links: [subtitles[i]],
            });
        }
    }

    result = result.sort((a, b) => a.seasonNumber - b.seasonNumber);
    for (let i = 0; i < result.length; i++) {
        result[i].links = result[i].links.sort((a, b) => a.episode - b.episode);
    }
    return result;
}

function updateSubtitleLinks(
    checkEpisode: GroupedSubtitle,
    prevLinks: Subtitle[],
    currentLinks: Subtitle[],
): boolean {
    let updateFlag = false;

    let linksUpdateNeed = prevLinks.length !== currentLinks.length;
    if (!linksUpdateNeed) {
        for (let k = 0; k < prevLinks.length; k++) {
            //check changed links
            if (!checkEqualSubtitle(prevLinks[k], currentLinks[k])) {
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
        checkEpisode.links = checkEpisode.links.sort((a, b) =>
            checkBetterQuality(a.info, b.info, false, false) ? -1 : 1,
        );
        updateFlag = true;
    }

    return updateFlag;
}

export function checkEqualSubtitle(link1: Subtitle, link2: Subtitle) {
    return (
        link1.link === link2.link &&
        link1.info === link2.info &&
        link1.season === link2.season &&
        link1.episode === link2.episode
    );
}
