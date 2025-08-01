import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../services/crawler/searchTools.js";
import {
    validateYear,
    checkDubbed,
    replacePersianNumbers,
    removeDuplicateLinks,
    getDecodedLink,
    sortLinks
} from "../../utils/utils.js";
import {getTitleAndYear} from "../../services/crawler/movieTitle.ts";
import {purgeSizeText} from "../../linkInfoUtils.js";
import save from "../../save_changes_db.js";
import {getSubtitleModel} from "../../../models/subtitle.js";
import {subtitleFormatsRegex} from "../../services/crawler/subtitle.ts";
import {saveError} from "../../../error/saveError.js";
// import { logger } from '../../utils/index.js';

const sourceName = "animelist";
const needHeadlessBrowser = true;
const sourceAuthStatus = 'ok';

export default async function animelist({movie_url, serial_url}, pageCount, extraConfigs) {
    await wrapper_module(sourceName, needHeadlessBrowser, sourceAuthStatus, serial_url, pageCount, search_title, extraConfigs);
    await wrapper_module(sourceName, needHeadlessBrowser, sourceAuthStatus, movie_url, pageCount, search_title, extraConfigs);
}

async function search_title(link, i, $, url, extraConfigs) {
    try {
        let title = link.attr('title');
        if (title && title.includes('دانلود انیمه')) {
            let pageLink = link.attr('href');
            let year;
            let type = (url.toLowerCase().includes('movie-anime')) ? 'anime_movie' : 'anime_serial';

            let linksChildNode = $(link).children()[0];
            let infoNodeText = linksChildNode.name === 'article'
                ? $($(linksChildNode).children()[2]).text()
                : $($($(linksChildNode).children()[0]).children()[2]).text();
            let isEmpty = infoNodeText.includes('هنوز آپلود نشده است');

            if (config.nodeEnv === 'dev') {
                logger.info(`animelist/${type}/${i}/${title}/empty:${isEmpty}  ========>  `);
            }
            ({title, year} = getTitleAndYear(title, year, type));

            if (title !== '' && !isEmpty) {
                let pageSearchResult = await search_in_title_page(sourceName, extraConfigs, needHeadlessBrowser, sourceAuthStatus, title, pageLink, type,
                    getFileData, null, extraChecker, false,
                    extraSearchMatch, extraSearch_getFileData);

                if (pageSearchResult) {
                    let {downloadLinks, $2, cookies} = pageSearchResult;
                    if (!year) {
                        year = fixYear($2);
                    }
                    downloadLinks = removeDuplicateLinks(downloadLinks);
                    if (type.includes('serial')) {
                        downloadLinks = sortLinks(downloadLinks);
                        downloadLinks = removeSpecialFlagsIfAllHave(downloadLinks);
                    }
                    let sourceData = {
                        sourceName,
                        pageLink,
                        downloadLinks,
                        watchOnlineLinks: [],
                        torrentLinks: [],
                        persianSummary: getPersianSummary($2),
                        poster: getPoster($2),
                        trailers: [],
                        subtitles: getSubtitles($2, type, pageLink),
                        rating: null,
                        cookies
                    };
                    await save(title, type, year, sourceData, i, extraConfigs);
                }
            }
        }
    } catch (error) {
        saveError(error);
    }
}

function fixYear($) {
    try {
        let postInfo = $('li:contains("پخش از")');
        let text = '';
        if (postInfo.length > 0) {
            text = $(postInfo[0]).text().trim();
        }
        if (postInfo.length === 0) {
            postInfo = $('li:contains("زمان پخش (ژاپن)")');
            text = $(postInfo).text().trim();
        }
        if (postInfo.length === 0) {
            postInfo = $('li:contains("فصل")');
            for (let i = 0; i < postInfo.length; i++) {
                let temp = $(postInfo[i]).text().trim();
                if (
                    temp.includes('بهار') || temp.includes('تابستان') ||
                    temp.includes('پاییز') || temp.includes('زمستان') ||
                    temp.match(/\d\d\d\d/g)
                ) {
                    postInfo = [postInfo[i]];
                    text = temp;
                    break;
                }
            }
        }
        if (postInfo.length !== 0) {
            let yearMatch = text.match(/\d\d\d\d/g);
            if (!yearMatch) {
                return '';
            }
            yearMatch = yearMatch.sort((a, b) => Number(a) - Number(b));
            return validateYear(yearMatch[0]);
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getPersianSummary($) {
    try {
        let $p = $('p');
        for (let i = 0; i < $p.length; i++) {
            if ($($p[i]).hasClass('story')) {
                return $($p[i]).text().replace('خلاصه داستان', '').trim();
            }
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getPoster($, url) {
    try {
        url = url.replace('https://', '').split('/')[0];
        let $img = $('img');
        for (let i = 0; i < $img.length; i++) {
            if ($($img[i]).hasClass('poster')) {
                let href = $img[i].attribs.src;
                if (href.includes('storage')) {
                    return 'https://' + url + href;
                }
            }
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getSubtitles($, type, pageLink) {
    //NOTE: unable to fix due to removed source and anti bot
    try {
        let links = $('a');
        let subtitles = [];
        for (let i = 0; i < links.length; i++) {
            let href = $(links[i]).attr('href');
            if (href && href.includes('/sub/download/')) {
                let dedicated = true;
                let linkInfo = $($(links[i]).prev().prev()).attr('title');
                if (!linkInfo) {
                    let infoNode = $(links[i]).parent().parent().prev();
                    if (infoNode.hasClass('subs-send-links')) {
                        dedicated = false;
                        linkInfo = $(infoNode).attr('title');
                    }
                }
                let translator = $($(links[i]).parent().next().children()[1]).text().replace('توسط', '').trim();
                // let episode = $($(links[i]).children()[1]).text()
                //     .replace('تا', ' ')
                //     .replace(/\s\s+/g, ' ')
                //     .trim()
                //     .replace(' ', '-');

                dedicated = dedicated ? 'dedicated' : '';
                let info = [linkInfo, translator, dedicated].filter(item => item).join('.');
                let isDirect = !!href.match(subtitleFormatsRegex);
                let subtitle = getSubtitleModel(href, info, type, sourceName, isDirect);
                subtitles.push(subtitle);
            }
        }
        return subtitles;
    } catch (error) {
        saveError(error);
        return [];
    }
}

function getFileData($, link, type) {
    // 'S4E18.1080p.x265'  // 'ED.S1E01.1080p.BD.DA - 20.79MB'
    // 'S1E01.1080p.x265.10BIT.DUAL.AUDIO - 233.04MB'  // 'S1E02.1080p.BD.10BIT - 204.64MB'
    //   //
    try {
        return type.includes('serial')
            ? getFileData_serial($, link)
            : getFileData_movie($, link);
    } catch (error) {
        saveError(error);
        return 'ignore';
    }
}

function getFileData_serial($, link) {
    let decodedLink = getDecodedLink($(link).attr('href'));
    let linkHref = replacePersianNumbers(decodedLink).toLowerCase().split('/').pop();
    let linkText = replacePersianNumbers($(link).text()).toLowerCase();
    let dubbed = checkDubbed(linkHref, '') ? 'Dubbed' : '';
    let uncensored = linkHref.includes('uncen') ? 'uncensored' : '';

    let episodeMatch = linkText.replace(/\d\d\d+p|x265|10bit/gi, '').match(/(\(*\d+\s*-\s*\d+\)*|(ep|e)*\d+)/g);
    let episodeNumber = (!episodeMatch) ? [1] : episodeMatch.pop().replace('e', '').split('-');

    let seasonEpisode = (episodeNumber.length === 2)
        ? 'S1E' + episodeNumber[0] + '-' + episodeNumber[1]
        : 'S1E' + episodeNumber[0];

    let quality = getQualityText(linkHref);

    return [seasonEpisode, quality, dubbed, uncensored].filter(value => value).join('.');
}

function getFileData_movie($, link) {
    let decodedLink = getDecodedLink($(link).attr('href'));
    let linkHref = replacePersianNumbers(decodedLink).toLowerCase().split('/').pop();
    let linkText = replacePersianNumbers($(link).text()).toLowerCase().trim();
    let yearMatch = linkHref.match(/[.\s(]\d\d\d\d[.\s)]/gi);
    if (yearMatch) {
        let year = yearMatch[0].replace(/[.()]/g, '');
        if (Number(year) >= 2000 && Number(year) !== 2160) {
            linkHref = linkHref.replace(yearMatch[0], '.');
        }
    }
    let dubbed = checkDubbed(linkHref, '') ? 'Dubbed' : '';
    let uncensored = linkHref.includes('uncen') ? 'uncensored' : '';

    let part = linkText.includes('part') ? linkText : '';
    let episode = '';
    if (linkText.includes('episode')) {
        let episodeMatch = linkText.replace(/\d\d\d+p|x265|10bit/gi, '').match(/(\(*\d+\s*-\s*\d+\)*|(ep|e)*\d+)/g);
        let episodeNumber = (!episodeMatch) ? [1] : episodeMatch.pop().replace('e', '').split('-');
        episode = (episodeNumber.length === 2)
            ? 'S1E' + episodeNumber[0] + '-' + episodeNumber[1]
            : 'S1E' + episodeNumber[0];
    }

    let quality = getQualityText(linkHref);
    return [episode, quality, part, dubbed, uncensored].filter(value => value).join('.');
}

function extraChecker($, link, title) {
    try {
        let decodedLink = getDecodedLink($(link).attr('href'));
        let linkHref = replacePersianNumbers(decodedLink).toLowerCase().split('/').pop();
        let linkText = replacePersianNumbers($(link).text()).toLowerCase().trim();
        return (
            (linkHref.includes('.mkv') || linkHref.includes('.mp4') || linkHref.includes('.avi')) &&
            (linkText.includes(title) || linkText.match(/\d\d\d+p|ova|movie|moive|download|episode|part|case|the|bd|10bit/gi))
        );
    } catch (error) {
        saveError(error);
        return false;
    }
}

function extraSearchMatch($, link) {
    try {
        let linkHref = replacePersianNumbers(getDecodedLink($(link).attr('href'))).toLowerCase();
        if (linkHref.includes('/anime/sub/download/') || linkHref.match(/\/sub$|\.(mkv|zip)$|\?(v-c=|comment=)\d$/gi)) {
            return false;
        }
        if (linkHref.match(/\/\d\d\d+p(\sbd)*$|\/special(s)*$/gi)) {
            return true;
        }
        let linkText = replacePersianNumbers($(link).text());
        if (linkText.match(/\d+\s*&\s*\d+/gi)) {
            return true;
        }
        let episodeMatch = linkText.replace(/\d\d\d+p|x265/gi, '').match(/\d+\s*-\s*\d+|e*\d+/gi);
        if (!episodeMatch) {
            return false;
        }
        let episodeNumber = episodeMatch[0].split('-');

        if (episodeNumber.length === 1 && !linkHref.includes('anime-list') && linkHref.includes('ova') && !linkHref.endsWith('.mkv')) {
            return true;
        }
        return (episodeNumber.length > 1 && Number(episodeNumber[1] - Number(episodeNumber[0]) >= 1));
    } catch (error) {
        saveError(error);
        return false;
    }
}

function extraSearch_getFileData($, link, type, sourceLinkData, title) {
    try {
        let decodedLink = getDecodedLink($(link).attr('href'));
        let linkHref = replacePersianNumbers(decodedLink).toLowerCase().split('/').pop();
        linkHref = extraSearch_fixLinkHref(linkHref, title, $, sourceLinkData);

        let linkHrefRegex1 =
            /\.(episode|ep)\.\d+\.mkv|\.(\d\d+|oad\.dvd|ova\.orphan)\.animdl\.ir|\.\d+(\.bd)*\.animdl\.ir|\.\d\d+(\.uncen)*\.(hd|sd|bd|dvd)(\.dual[.\-]audio)*\.animdl\.ir/gi;
        let linkHrefRegex2 =
            /([.\s\[(])+\s*(.*)\s*\d\d\d+p*\s*(.*)\s*([.\s\])])/gi;

        let tempHref = linkHref.replace('10bit', '');
        if (linkHref.match(/^\.+\/\.*$/g) || (!tempHref.match(linkHrefRegex1) && !tempHref.match(linkHrefRegex2))) {
            return 'ignore';
        }

        let specialMatch = linkHref.match(
            /[.\s](\s*(ed|op|opening|sp|en|ending|pv|mv|ona|oad|nced|nce01d|nce|ncop|nco01p|ncod|bdmenu|ex|extra|special(s)*|ssl|pilot|promo|epilogue|prologue)\d*)+\s*(ep\s*\d+)*\s*([a-e])*\s*(\s+t|\s+ver[.\s]*\d*|\smusic video)*[.\s]|athletic core\s/gi);
        let special = specialMatch ? specialMatch.slice(0, 2).join('').replace(/^\.|\.$/g, '') : '';

        let episodeRegex =
            /\.(episode|ep)\.\d+\.mkv|ep\s*\d+\s*\[\s*animdl\.ir\s*]\.mkv|[.\-\s]s\d+(e|\s+)\d+[.\-\s]|\.\d\d+\s*\.animdl\.ir|\.\d\d+(\.uncen)*\.(hd|sd|bd|dvd)(\.dual[.\-]audio)*\.animdl\.ir|(^|[.\-_\s])\s*\(*(\d+\s*-\s*\d+|(ep|e)*\d+(v\d)*(\.\d)*)\)*\s*(.*)\s*(([.\[])+\s*\d\d\d+p*(bd|x265)*\s*([.\]\s])|[\[(]\s*(.*)\s*\d\d\d+p*\s*(.*)\s*[\])])|\.\d+(\.bd)*\.animdl\.ir/gi;

        let episodeResult = getEpisodeMatch(linkHref, episodeRegex, special);
        let episodeMatch = episodeResult.episodeMatch;
        special = episodeResult.special;

        if (!episodeMatch) {
            return 'ignore';
        }

        let episodeNumber = episodeMatch[0]
            .replace('ova', '.ova')
            .replace(/[.\-\s]s\d+(e|\s+)|[^\d\s.\-]\[|^[.\-_]|\s|episode|ep|e|[()]|\.animdl\.ir/gi, '')
            .replace('-[', '[')
            .split(/\[|_|[^\d]\.[^\d]|\.[^\d]|\.\d\d\d+p/g)[0]
            .replace(/^\.|\.$/g, '')
            .split('-');

        let seasonEpisode = (episodeNumber.length > 1 && Number(episodeNumber[0]) + 1 === Number(episodeNumber[1]))
            ? 'S1E' + episodeNumber[0] + '-' + episodeNumber[1]
            : 'S1E' + episodeNumber[0];

        let quality = getQualityText(linkHref);
        let dubbed = checkDubbed(linkHref, '') ? 'Dubbed' : '';
        let uncensored = linkHref.includes('uncen') ? 'uncensored' : '';
        let size = purgeSizeText($($($(link).children()[0]).children()[3]).text());
        let info = [seasonEpisode, quality, dubbed, uncensored].filter(value => value).join('.');
        if (special) {
            info = special
                .replace('.', '-')
                .replace(/ver\s+/gi, 'ver-')
                .toUpperCase().trim() + '/' + info;
        }
        return [info, size].filter(value => value).join(' - ');
    } catch (error) {
        saveError(error);
        return 'ignore';
    }
}

function extraSearch_fixLinkHref(linkHref, title, $, sourceLinkData) {
    linkHref = linkHref
        .replace(/\[dvd\.animdl/g, '[dvd].animdl')
        .replace(/\[(dvd|dvdrip)]/gi, '[576p]')
        .replace(/_|[^\d]-[^\d]|\.\.+/g, '.')
        .replace(/\[/g, ' [')
        .replace('panim', 'p.anim')
        .replace('.20p.', '.720p.')
        .replace('x365', 'x265')
        .replace(' 720p bd eng sub ', ' [720p bd eng sub] ')
        .replace(' 1080p bd x265]', ' [1080p bd x265]');

    let badQualityMatch = linkHref.match(/\s\d\d\d+p eng sub 10bit x265\s/gi);
    if (badQualityMatch) {
        let temp = ' [' + badQualityMatch[0] + '] ';
        linkHref = linkHref.replace(badQualityMatch[0], temp);
    }

    title = title.toLowerCase().replace(/_/gi, '.');
    let title2 = title.replace('2nd season', 'season 2');
    let splitSourceLink = getDecodedLink($(sourceLinkData.link).attr('href')).replace(/\/\d+\s*-\s*\d+$|\/$|\/(\s*bd|\s*x265)+\s*/gi, '').split('/');
    splitSourceLink.pop();
    let sourceLink = splitSourceLink.pop().toLowerCase().replace(/_|[^\d]-[^\d]|-|\.\.+/g, '.');

    linkHref = linkHref
        .replace(title, '')
        .replace(title.replace(/\s+/gi, '.'), '')
        .replace(title2, '')
        .replace(title2.replace(/\s+/gi, '.'), '')
        .replace(sourceLink, '')
        .replace(sourceLink.replace(' ova', '').replace(/\s+/gi, '.'), '')
        .replace(/\d*(th|nd|rd|second|third|fourth)([.\s])+season|season[.\-\s]*\d+|‌/gi, '')
        .replace(/dvd-|-dvd/gi, '');

    let yearMatch = linkHref.match(/[.\s(]\d\d\d\d[.\s)]/gi);
    if (yearMatch) {
        let year = yearMatch[0].replace(/[.()]/g, '');
        if (Number(year) > 2000 && Number(year) !== 2160) {
            linkHref = linkHref.replace(yearMatch[0], '.');
        }
    }

    let arcMatch = linkHref.match(/^arc\s*\d+/gi);
    if (arcMatch) {
        linkHref = linkHref.replace(arcMatch[0], '').replace('.mkv', '');
        linkHref += ' [' + arcMatch[0] + ']';
    }

    return linkHref;
}

function getEpisodeMatch(linkHref, episodeRegex, special) {
    let episodeMatch = linkHref
        .replace(special, ' ')
        .replace(/-ext|end|\.\d+\.s\d+\.|\s\d+\ss\d+\s/gi, ' ')
        .match(episodeRegex);

    if (!episodeMatch) {
        episodeMatch = linkHref
            .replace(/(\s*\.\s*)*\[(dvd|dvdrip|576p)]\.|\.part\./gi, '.')
            .replace(special, ' ')
            .replace(/-ext|end|\.\d+\.s\d+\./gi, ' ')
            .match(episodeRegex);
    }

    if (!episodeMatch && special) {
        episodeMatch = linkHref
            .replace(special, ' 01 ')
            .replace(/-ext|end|\.\d+\.s\d+\./gi, ' ')
            .match(episodeRegex);
    }

    if (!episodeMatch && linkHref.match(/(^|[.\s])ova[.\s]/gi)) {
        if (special) {
            special += '-OVA';
        } else {
            special = 'OVA';
        }
        episodeMatch = linkHref
            .replace(/\.ova\.(orphan\.)*/gi, '.01.')
            .replace(/\s*ova\s/gi, ' 01 ')
            .replace(/-ext|end|\.\d+\.s\d+\./gi, ' ')
            .match(episodeRegex);
    }
    return {episodeMatch, special};
}

function getQualityText(linkHref) {
    try {
        linkHref = linkHref.replace(/^(\[animdl\.ir])/gi, '').replace('-bd', '.bd').replace('pbd', 'p.bd');
        let qualityRegex = /([.\[])*\s*\d\d\d+p*(\s*bd|\s*x265|\s*EngSub)*\s*([.\]\s])|\s*[\[(]\s*(.*)\s*\d\d\d+p*\s*(.*)\s*[\])](\.bd)*/gi;
        let qualityMatch = linkHref.match(qualityRegex);
        if (!qualityMatch) {
            let temp = linkHref.match(/\s\d\d\d+p\s*\[animdl\.ir]|[.\s](\d\d\d+p|dvdrip)-animdl\.ir/gi);
            if (temp) {
                let resolutionMatch = linkHref.match(/\d\d\d+p|dvdrip/gi);
                linkHref = linkHref.replace(resolutionMatch[0], '[' + resolutionMatch[0] + ']');
                qualityMatch = linkHref.match(qualityRegex);
            }
        }
        if (!qualityMatch) {
            qualityMatch = linkHref.replace(/\[(dvdrip|dvd)]/gi, '[576p]').match(qualityRegex);
        }

        let quality = qualityMatch ? qualityMatch.pop().replace(/[\[\].()]|^\s+|ep\s*\d+/g, '').replace(/_|\s+/g, '.') : '';
        while (qualityMatch && qualityMatch.length > 0 && (!quality.match(/\d\d\d+/g) || quality === '265')) {
            quality = qualityMatch.pop().replace(/[\[\].()]|^\s+|ep\s*\d+/g, '').replace(/_|\s+/g, '.');
        }

        quality = quality.match(/\d\d\d+p*mini/gi) ? quality.replace('mini', '.mini') : quality;
        quality = quality.match(/dvd-\d\d\d+p*|\d\d\d+p*-dvd/gi) ? quality.replace(/dvd-|-dvd/gi, '') : quality;
        let resolutionMatch = quality.replace('x265', '').match(/\d\d\d+/g);
        let resolution = resolutionMatch ? resolutionMatch.pop() : '';
        quality = quality.match(/\d\d\d+p/g) ? quality : (quality !== '' && resolution !== '') ? quality.replace(resolution, `${resolution}p`) : '';

        if (quality) {
            let resolution = quality.match(/\d\d\d+p/g).pop();
            quality = quality
                .toUpperCase()
                .replace(resolution.toUpperCase(), resolution)
                .replace(`BD${resolution}`, `${resolution}.BD`)
                .replace(`BD.${resolution}`, `${resolution}.BD`)
                .replace(`BD-${resolution}`, `${resolution}.BD`)
                .replace(/^\.|\.*ANIMDL\.*(IR|RI)/gi, '');
        } else {
            quality = linkHref.includes('1080p') ? '1080p' : linkHref.includes('720p') ? '720p' : '480p';
        }

        if (!quality.toLowerCase().includes('ext') && linkHref.includes('-ext')) {
            quality += '.ext';
        }
        if (!quality.toLowerCase().includes('x265') && linkHref.match(/x265|\.265\./g)) {
            let splitQuality = quality.split('.');
            quality = [splitQuality[0], splitQuality[1], 'X265', ...splitQuality.slice(2)].filter(value => value).join('.');
        }
        if (!quality.toLowerCase().includes('10bit') && linkHref.includes('10bit')) {
            let splitQuality = quality.split('.');
            quality = [splitQuality[0], splitQuality[1], '10BIT', ...splitQuality.slice(2)].filter(value => value).join('.');
        }
        if (!quality.match(/DUAL(\.)*AUDIO/gi) && linkHref.match(/DUAL\.AUDIO/gi)) {
            quality += '.DUAL.AUDIO';
        }

        resolutionMatch = quality.match(/\d\d\d+p/g);
        if (resolutionMatch) {
            resolution = resolutionMatch.pop();
            quality = quality.replace(`10BIT.${resolution}`, `${resolution}.10BIT`);
        }

        quality = quality
            .replace('DUALAUDIO', 'DUAL.AUDIO')
            .replace('BDDUAL', 'BD.DUAL')
            .replace('X265DUAL', 'X265.DUAL')
            .replace('10BITX265', '.X265.10BIT')
            .replace('10BIT.X265', 'X265.10BIT')
            .replace('BD.X265', 'X265.BD')
            .replace('BD10BIT', 'BD.10BIT')
            .replace('BD.10BIT', '10BIT.BD')
            .replace('p10BIT', 'p.10BIT')
            .replace('BDD-A', 'BD.DA')
            .replace('BDDA', 'BD.DA')
            .replace('BDENG', 'BD.ENG')
            .replace('pX265', 'p.X265')
            .replace('pTV', 'p.TV')
            .replace(/p(-)*BD/gi, 'p.BD')
            .replace('ENG.SUB', 'ENG-SUB')
            .replace('ENG-SUB.X265.10BIT', 'X265.10BIT.ENG-SUB')
            .replace('BD.DA.10BIT', '10BIT.BD.DA')
            .replace('DUAL.AUDIO', 'DA');

        if (!quality.includes('SD') && linkHref.includes('sd')) {
            quality += '.SD';
        }
        return quality.replace('..', '.').replace(/^\.|\.$/g, '');
    } catch (error) {
        saveError(error);
        return '';
    }
}

function removeSpecialFlagsIfAllHave(links) {
    let specialFlagCounter = 0;
    for (let i = 0; i < links.length; i++) {
        if (links[i].info.includes('/')) {
            specialFlagCounter++;
        }
    }
    if (specialFlagCounter === links.length) {
        for (let i = 0; i < links.length; i++) {
            links[i].info = links[i].info.split('/').pop();
        }
    }
    return links;
}
