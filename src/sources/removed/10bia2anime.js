import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../searchTools.js";
import {
    getDecodedLink,
    persianWordToNumber,
    removeDuplicateLinks,
    replacePersianNumbers,
    sortLinks,
    validateYear,
} from "../../utils/utils.js";
import {getTitleAndYear} from "../../movieTitle.js";
import {fixLinkInfo, fixLinkInfoOrder, purgeQualityText, purgeSizeText} from "../../linkInfoUtils.js";
import {summaryExtractor, posterExtractor, trailerExtractor} from "../../extractors/index.js";
import save from "../../save_changes_db.js";
import {getSubtitleModel} from "../../../models/subtitle.js";
import {subtitleFormatsRegex} from "../../subtitle.js";
import {saveError} from "../../../error/saveError.js";

export const sourceConfig = Object.freeze({
    sourceName: "bia2anime",
    needHeadlessBrowser: false,
    sourceAuthStatus: 'ok',
    vpnStatus: Object.freeze({
        poster: 'allOk',
        trailer: 'allOk',
        downloadLink: 'allOk',
    }),
    isTorrent: false,
    replaceInfoOnDuplicate: true,
    removeScriptAndStyleFromHtml: false,
});

export default async function bia2anime({movie_url}, pageCount, extraConfigs) {
    let p1 = await wrapper_module(sourceConfig, movie_url, pageCount, search_title, extraConfigs);
    return [p1];
}

async function search_title(link, pageNumber, $, url, extraConfigs) {
    try {
        let text = link.text();
        if (text && text.includes('دانلود') && link.parent().hasClass('postsFooter')) {
            let title = link.attr('title').toLowerCase().split('|')[0];
            let year;
            let pageLink = link.attr('href');
            let type = title.includes('movie') ? 'anime_movie' : 'anime_serial';
            if (config.nodeEnv === 'dev') {
                console.log(`bia2anime/${type}/${pageNumber}/${title}  ========>  `);
            }
            ({title, year} = getTitleAndYear(title, year, type));
            if (title === 'dota dragons blood' && type === 'anime_serial') {
                type = 'serial';
            }
            if (
                title.includes('kuroshitsuji')
                || title.includes('mushishi')
                || title.includes('nanatsu no taizai')
                || title.includes('kimetsu no yaiba')
                || title.includes('minami ke all seasons')
            ) {
                return;
            }

            if (title !== '') {
                let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (pageSearchResult) {
                    let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
                    if (!year) {
                        year = fixYear($2);
                    }
                    if (type.includes('serial') && downloadLinks.length === 0) {
                        type = type.replace('serial', 'movie');
                        pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                        if (!pageSearchResult) {
                            return;
                        }
                        ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                        if (downloadLinks.length === 0) {
                            type = type.replace('movie', 'serial');
                        }
                    }
                    title = replaceShortTitleWithFull(title);
                    downloadLinks = handleLinksExtraStuff(downloadLinks);

                    let sourceData = {
                        sourceConfig,
                        pageLink,
                        downloadLinks,
                        watchOnlineLinks: [],
                        torrentLinks: [],
                        persianSummary: summaryExtractor.getPersianSummary($2, title, year),
                        poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName),
                        trailers: trailerExtractor.getTrailers($2, pageLink, sourceConfig.sourceName, sourceConfig.vpnStatus.trailer),
                        subtitles: getSubtitles($2, type, pageLink, downloadLinks),
                        rating: null,
                        cookies
                    };
                    await save(title, type, year, sourceData, pageNumber, extraConfigs);
                }
            }
        }
    } catch (error) {
        saveError(error);
    }
}

export async function handlePageCrawler(pageLink, title, type, pageNumber = 0, extraConfigs) {
    try {
        title = title.toLowerCase();
        let year;
        ({title, year} = getTitleAndYear(title, year, type));

        let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
        if (pageSearchResult) {
            let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
            if (!year) {
                year = fixYear($2);
            }
            if (type.includes('serial') && downloadLinks.length === 0) {
                type = type.replace('serial', 'movie');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                if (downloadLinks.length === 0) {
                    type = type.replace('movie', 'serial');
                }
            }
            title = replaceShortTitleWithFull(title);
            downloadLinks = handleLinksExtraStuff(downloadLinks);

            let sourceData = {
                sourceConfig,
                pageLink,
                downloadLinks,
                watchOnlineLinks: [],
                torrentLinks: [],
                persianSummary: summaryExtractor.getPersianSummary($2, title, year),
                poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName),
                trailers: trailerExtractor.getTrailers($2, pageLink, sourceConfig.sourceName, sourceConfig.vpnStatus.trailer),
                subtitles: getSubtitles($2, type, pageLink, downloadLinks),
                rating: null,
                cookies
            };
            await save(title, type, year, sourceData, pageNumber, extraConfigs);
            return downloadLinks.length;
        }
        return 0;
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

function fixYear($) {
    try {
        let state = 1;
        let postInfo = $('li:contains("سال های پخش")');
        if (postInfo.length === 0) {
            state = 0;
            postInfo = $('li:contains("سال انتشار")');
        }
        if (postInfo.length === 1) {
            let temp = $(postInfo).text().replace('سال های پخش', '').replace('سال انتشار', '').toLowerCase().trim();
            if (!temp && state === 0) {
                postInfo = $('li:contains("سال های پخش")');
                if (postInfo.length === 1) {
                    temp = $(postInfo).text().replace('سال های پخش', '').replace('سال انتشار', '').toLowerCase().trim();
                }
            }
            const yearArray = temp.split(/\s+|-|–/g)
                .filter(item => item && !isNaN(item.trim()))
                .sort((a, b) => Number(a) - Number(b));
            if (yearArray.length === 0) {
                return '';
            }
            return validateYear(yearArray[0]);
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getSubtitles($, type, pageLink, downloadLinks) {
    try {
        let result = [];
        const $a = $('a');
        for (let i = 0, _length = $a.length; i < _length; i++) {
            let linkHref = $($a[i]).attr('href');
            if (!linkHref || linkHref.match(/^https:\/\/(\d\d\d?)\.(\d\d\d?)\.(\d\d\d?)\.(\d\d\d?)\/Sub/i)) {
                continue;
            }
            linkHref = linkHref.split(/(?<=zip)http/i)[0];
            if (linkHref.match(subtitleFormatsRegex) || linkHref.match(/\/sub(titles)?\//i)) {
                const isDirect = !!linkHref.match(subtitleFormatsRegex);
                const subtitle = getSubtitleModel(linkHref, '', type, sourceConfig.sourceName, isDirect);
                const subtitleSiblings = $($a[i]).parent().children().toArray().filter(item => item.name !== 'br');
                if (subtitleSiblings.length > 1) {
                    let episodeLink = $($a[i]).prev();
                    if (episodeLink[0] && episodeLink[0].name === 'strong' && $(episodeLink[0]).text() === '|') {
                        episodeLink = $(episodeLink).prev();
                    }
                    if (episodeLink[0] && episodeLink[0].name === 'strong') {
                        episodeLink = $(episodeLink).children()[0];
                    }
                    if (!episodeLink || !$(episodeLink).attr('href') || !$(episodeLink).attr('href').includes('.mkv')) {
                        episodeLink = $($a[i]).next();
                    }
                    if (episodeLink && $(episodeLink).attr('href') && $(episodeLink).attr('href').includes('.mkv')) {
                        const temp = $(episodeLink).attr('href').trim();
                        const link = downloadLinks.find(item => item.link === temp);
                        if (link) {
                            subtitle.season = link.season;
                            subtitle.episode = link.episode;
                            subtitle.info = '';
                            if (link.info.includes('OVA')) {
                                subtitle.info = link.info.match(/OVA(_\d)?/g).pop();
                            }
                            const matchMovieName = link.info.match(/\(.+\)/g);
                            if (matchMovieName) {
                                subtitle.info = subtitle.info ? (subtitle.info + '.' + matchMovieName.pop()) : matchMovieName.pop();
                            }
                        } else {
                            const info = getFileData($, episodeLink, type);
                            const seasonEpisodeMatch = info.match(/^s\d{1,4}e\d{1,4}/i);
                            if (seasonEpisodeMatch) {
                                const temp = seasonEpisodeMatch[0].toLowerCase().replace('s', '').split('e');
                                subtitle.season = Number(temp[0]);
                                subtitle.episode = Number(temp[1]);
                                subtitle.info = '';
                            } else if (info === 'ignore') {
                                subtitle.info = 'OVA';
                            }
                        }
                    }
                } else if (subtitleSiblings.length === 1) {
                    const nextNode = $($a[i]).parent().parent().next();
                    const nextNodeLinks = $('a', nextNode[0]);
                    const episodeLink = $(nextNodeLinks[0]).attr('href');
                    let link = downloadLinks.find(item => item.link === episodeLink);
                    if (!link) {
                        const prevNode = $($a[i]).parent().parent().prev();
                        const prevNodeLinks = $('a', prevNode[0]);
                        const episodeLink = $(prevNodeLinks[0]).attr('href');
                        link = downloadLinks.find(item => item.link === episodeLink);
                    }
                    if (!link) {
                        let temp = linkHref.split('/');
                        temp.pop();
                        temp = temp.join('/');
                        link = downloadLinks.find(item => item.link.includes(temp));
                    }
                    if (link) {
                        subtitle.season = link.season;
                        if (!subtitle.info.match(/Episode\(\d{1,4}-\d{1,4}\)/)) {
                            subtitle.episode = 0;
                            subtitle.info = 'AllEpisodesOf(Season ' + link.season + ')';
                        }
                    }
                }
                result.push(subtitle);
            }
        }

        result = removeDuplicateLinks(result);
        return result;
    } catch (error) {
        saveError(error);
        return [];
    }
}

export function getFileData($, link, type) {
    try {
        return type.includes('serial')
            ? getFileData_serial($, link, type)
            : getFileData_movie($, link, type);
    } catch (error) {
        saveError(error);
        return 'ignore';
    }
}

function getFileData_serial($, link, type) {
    let parentNode = link;
    let counter = 0;
    while (counter < 14) {
        if ($(parentNode).hasClass('dl-body')) {
            break;
        } else {
            parentNode = $(parentNode).parent();
            counter++;
        }
        if (counter === 14) {
            return 'ignore';
        }
    }
    const infoNodeChildren = $(parentNode.prev().children()[0]).children();

    const href = $(link).attr('href');
    const linkHref = getDecodedLink(href).toLowerCase().replace(/\.\.+/g, '.');
    const temp = linkHref.match(/\.mkv/g);
    if (temp && temp.length > 1) {
        return 'ignore';
    }

    let seasonNumber = getSeasonNumber($, infoNodeChildren, linkHref);
    let result = fixWrongSeasonNumber(seasonNumber, linkHref);
    seasonNumber = result.seasonNumber;
    const seasonName = result.seasonName;

    let episodeMatch = linkHref
        .replace('.br.', '.')
        .match(/([.\-])\s*\d+(\.v\d+)*\s*(\.bd|\.10bit|\.special)*\s*([.\[]+)\d\d\d+p*([.\]])|\.\d+(\.web\.dual\.audio|\.\d\d\d+p|\.br|\.uncen)*\.(bia2anime|bitdownload\.ir)\.mkv|s\d+e\d+|e\d+/g);
    if (!episodeMatch) {
        if (linkHref.match(/\.ova(\.bd)?\.\d\d\d\d?p\.bia2anime\.mkv/i)) {
            let quality = linkHref.match(/\d\d\d\d?p/g).pop();
            return 'S1E0.' + quality + '.OVA';
        }
        return 'ignore';
    }
    if (episodeMatch && episodeMatch[0].match(/\.\d+\.(bitdownload\.ir|bia2anime)\.mkv/g)) {
        episodeMatch[0] = episodeMatch[0]
            .replace('.bitdownload', '.480p.bitdownload')
            .replace('.bia2anime', '.480p.bia2anime');
    }
    let episodeNumber = episodeMatch[0]
        .replace(/\s*(\.bd|\.10bit\.special)*\s*([.\[]+)[1-9]\d\d+p*([.\]])(?!(\d\d\d+p))|(\.web\.dual\.audio)*(bia2anime|bitdownload\.ir|\.\d\d\d+p|\.br|\.uncen)\.mkv|\s|^[.\-]|s\d+e|e/g, '')
        .split(/([.\-])/g)[0];

    let seasonPart = linkHref.match(/part[\s.]*\d/g)?.pop()
            .replace(/[\s.]/g, '')
            .replace('part', 'Part_')
        || '';

    if (seasonNumber === 1 && Number(episodeNumber) === 0 && !seasonPart) {
        seasonNumber = 0;
        episodeNumber = 1;
    }
    let specialEpisodeName = '';
    if (seasonNumber === 0 && !seasonName) {
        const temp = linkHref.split('/').pop().replace(/\d\d\d\d?p?\.bia2anime\.mkv/gi, '').replace(/\./g, ' ');
        specialEpisodeName = ' (' + temp.trim() + ')';
    }

    ({seasonNumber, episodeNumber} = fixWrongSeasonEpisodeNumber(seasonPart, seasonNumber, episodeNumber, linkHref));

    let halfEpisode = '';
    if (Number(episodeNumber) === 5) {
        let halfEpisodeMatch = linkHref.match(/\.\d\d\.5\.\d\d\d\d?p/i);
        if (halfEpisodeMatch) {
            episodeNumber = halfEpisodeMatch.pop().match(/(?<=\.)\d\d(?=\.)/).pop();
            episodeNumber = Number(episodeNumber);
            halfEpisode = 'Episode(' + episodeNumber + '.5)';
        }
    }

    if (seasonNumber === 1 && linkHref.includes('special')) {
        seasonNumber = 0;
    }

    const seasonEpisode = 'S' + seasonNumber + 'E' + episodeNumber;
    let quality = getQuality($, infoNodeChildren, linkHref, $(link).text());
    quality = fixLinkInfo(quality, href, type);
    quality = fixLinkInfoOrder(quality);
    if (linkHref.includes('dual.audio')) {
        quality = quality.replace('.dubbed', '.Dubbed(english)');
    }
    return [seasonEpisode, quality, halfEpisode, seasonPart, specialEpisodeName, seasonName].filter(Boolean).join('.');
}

function getFileData_movie($, link, type) {
    const href = $(link).attr('href');
    const linkHref = getDecodedLink(href).toLowerCase().replace(/\.\.+/g, '.');
    let temp = linkHref.match(/\.mkv/g);
    if (temp && temp.length > 1) {
        return 'ignore';
    }
    const infoNodeChildren = $($(link).parent().prev().children()[0]).children();
    const size = infoNodeChildren[2] ? purgeSizeText($(infoNodeChildren[2]).text()) : '';
    const qualitySplit = $(infoNodeChildren[1]).text().trim().split(' - ');
    qualitySplit[0] = purgeQualityText(qualitySplit[0]).replace(/\s+/g, '.');
    if (qualitySplit[1]) {
        qualitySplit[1] = purgeQualityText(qualitySplit[1]);
    }

    let movieName = qualitySplit[1]?.split(/the movie/gi)?.pop().trim() || '';
    if (movieName.match(/^\d+\s+/)) {
        movieName = 'Movie ' + movieName;
    }
    if (movieName && !movieName.match(/\d\d\d\d$/)) {
        const year = linkHref.match(/\.\d\d\d\d\./g)?.pop().replace(/\./g, '') || '';
        if (year) {
            movieName += ' ' + year;
        }
    }
    if (movieName) {
        movieName = ' (' + movieName + ')';
    }

    let info = [qualitySplit[0], movieName].filter(Boolean).join('.');
    info = fixLinkInfo(info, href, type);
    info = fixLinkInfoOrder(info);
    return [info, size].filter(Boolean).join(' - ');
}

function getSeasonNumber($, infoNodeChildren, linkHref) {
    let seasonText = replacePersianNumbers($(infoNodeChildren[0]).text().toLowerCase());
    if (!seasonText && infoNodeChildren.length > 1) {
        seasonText = replacePersianNumbers($(infoNodeChildren[1]).text().toLowerCase());
    }
    const quickMatch = seasonText.match(/\(s\d\)/gi);
    if (quickMatch) {
        return Number(quickMatch.pop().replace(/[()s]/g, ''));
    }

    seasonText = seasonText.replace(/[()]/g, '').replace(/^قسمت ها \d+$/g, '').replace('بخش اول', '').replace('بخش دوم', '');
    let seasonNumber = persianWordToNumber(seasonText);
    if (seasonNumber === 0) {
        if (seasonText.includes('فصل')) {
            const temp = seasonText.match(/^فصل \d$/);
            if (temp) {
                return Number(temp.pop().replace('فصل', '').trim());
            }
            const seasonMatch = seasonText.match(/\d+/g);
            if (seasonMatch && seasonText.length < 8) {
                seasonNumber = Number(seasonMatch.pop());
            }
        }
        if (seasonNumber === 0) {
            const seasonMatch = linkHref.match(/[^\/]([.\/])s\d+([.\/])/g);
            if (seasonMatch) {
                seasonNumber = Number(seasonMatch.pop().split('s').pop().replace(/[.\/]/g, ''));
            } else {
                const seasonMatch = seasonText.match(/season \d+|\(\s*s\d+\s*\)/g);
                if (seasonMatch) {
                    seasonNumber = Number(seasonMatch.pop().replace(/season|[\s()s]/g, ''));
                } else {
                    seasonNumber = 1;
                }
            }
        }
        if (seasonNumber === 0) {
            seasonNumber = 1;
        }
    }

    return seasonNumber;
}

function getQuality($, infoNodeChildren, linkHref, linkText) {
    let quality;
    if (linkText.match(/\d\d\d+p/gi)) {
        quality = purgeQualityText(linkText.match(/\d\d\d+p/gi).pop());
    } else {
        let qualityText = $(infoNodeChildren[1]).text();
        if (infoNodeChildren[2]) {
            let temp = $(infoNodeChildren[2]).text();
            if (!qualityText.match(/(480|576|720|1080|2160)p*/gi) || temp.includes('کیفیت')) {
                qualityText = purgeQualityText(temp);
            }
        }
        qualityText = qualityText.match(/(480|576|720|1080|2160)p*/gi) ? qualityText : '';
        if (qualityText.match(/^قسمت ها \d\d* تا \d\d*$/g)) {
            qualityText = '';
        }
        if (!qualityText) {
            const qualityMatch = linkHref.match(/\d\d\d+p/g);
            if (qualityMatch) {
                qualityText = qualityMatch.pop();
            }
        }
        quality = purgeQualityText(qualityText);
    }
    quality = replacePersianNumbers(quality.replace('x 265', 'x265')).replace(/\s+/g, '.');
    if (quality === '') {
        quality = '720p';
    }
    return quality;
}

export function handleLinksExtraStuff(downloadLinks) {
    //use in extractor functions
    downloadLinks = removeDuplicateLinks(downloadLinks);
    downloadLinks = fixWrongSeasonNumberIncrement(downloadLinks);
    downloadLinks = fixSeasonSeparation(downloadLinks);
    downloadLinks = sortLinks(downloadLinks);
    downloadLinks = fixSpecialEpisodeSeason(downloadLinks);
    return downloadLinks;
}

function fixWrongSeasonNumber(seasonNumber, linkHref) {
    let seasonName = '';
    if (linkHref.includes('kenpuu.denki.berserk')) {
        seasonNumber = 0;
    } else if (linkHref.includes('berserk.2016')) {
        seasonNumber = 1;
    } else if (linkHref.includes('berserk.2017')) {
        seasonNumber = 2;
    } else if (linkHref.includes('tensura.nikki.tensei.shitara.slime.datta.ken')) {
        seasonNumber = 0;
    } else if (linkHref.includes('sword.art.online-alicization.war.of.underworld')) {
        seasonNumber = 2;
    } else if (linkHref.includes('kuroshitsuji.book.of.murder')) {
        seasonNumber = 0;
    } else if (linkHref.includes('minami-ke.okaeri')) {
        seasonNumber = 3;
    } else if (linkHref.includes('minami-ke.tadaima')) {
        seasonNumber = 4;
    } else if (linkHref.includes('grappler.baki')) {
        seasonName = ' (Grappler Baki)';
        seasonNumber = 0;
    } else if (linkHref.includes('fate.stay.night.ubw.s1')) {
        seasonName = ' (Unlimited Blade Works S1)';
        seasonNumber = 2;
    } else if (linkHref.includes('fate.stay.night.ubw.s2')) {
        seasonName = ' (Unlimited Blade Works S2)';
        seasonNumber = 3;
    } else if (linkHref.includes('code.geass.hangyaku.no.lelouch.r2')) {
        seasonNumber = 2;
    } else if (linkHref.includes('hachimitsu.to.clover.ii')) {
        seasonNumber = 2;
    } else if (seasonNumber === 1) {
        if (linkHref.includes('fairy.tail.zero')) {
            seasonNumber = 3;
        } else if (linkHref.includes('fairy.tail.final')) {
            seasonNumber = 4;
        }
    }
    return {seasonNumber, seasonName};
}

function fixWrongSeasonEpisodeNumber(seasonPart, seasonNumber, episodeNumber, linkHref) {
    if (linkHref.includes('jojo.no.kimyou.na.bouken')) {
        if (seasonPart === 'Part_3') {
            if (seasonNumber === 1) {
                seasonNumber = 3;
            } else if (seasonNumber === 2) {
                seasonNumber = 3;
                episodeNumber = Number(episodeNumber) + 24;
            }
        }
        if (seasonPart) {
            seasonNumber = Number(seasonPart.replace('Part_', ''));
        }
    }
    return {seasonNumber, episodeNumber};
}

function replaceShortTitleWithFull(title, type) {
    if (title === 'slime taoshite 300 nen' && type === 'anime_serial') {
        title = 'slime taoshite 300 nen shiranai uchi ni level max ni nattemashita';
    } else if (title === 'otome game no hametsu flag' && type === 'anime_serial') {
        title = 'otome game no hametsu flag shika nai akuyaku reijou ni tensei shiteshimatta all seasons';
    } else if (title === 'mushoku tensei' && type === 'anime_serial') {
        title = 'mushoku tensei isekai ittara honki dasu';
    } else if (title === 'kings raid ishi o tsugu mono tachi' && type === 'anime_serial') {
        title = 'kings raid ishi wo tsugumono tachi';
    } else if (title === 'tatoeba last dungeon mae no mura' && type === 'anime_serial') {
        title = 'tatoeba last dungeon mae no mura no shounen ga joban no machi de kurasu youna monogatari';
    } else if (title === 'shinchou yuusha' && type === 'anime_serial') {
        title = 'shinchou yuusha kono yuusha ga ore tueee kuse ni shinchou sugiru';
    } else if (title === 'maou gakuin no futekigousha' && type === 'anime_serial') {
        title = 'maou gakuin no futekigousha shijou saikyou no maou no shiso tensei shite shison tachi no gakkou e';
    } else if (title === 'kaguya sama wa kokurasetai' && type === 'anime_serial') {
        title = 'kaguya sama wa kokurasetai tensai tachi no renai zunousen all seasons';
    } else if (title === 'honzuki no gekokujou' && type === 'anime_serial') {
        title = 'honzuki no gekokujou shisho ni naru tame ni wa shudan wo erandeiraremasen all seasons';
    } else if (title === 'itai no wa iya nano de bougyoryoku' && type === 'anime_serial') {
        title = 'itai no wa iya nano de bougyoryoku ni kyokufuri shitai to omoimasu all seasons';
    }
    return title;
}

function fixWrongSeasonNumberIncrement(downloadLinks) {
    let lastEpisodeFromPrevSeason = 0;
    for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
        if (downloadLinks[i].season === 1) {
            if (downloadLinks[i].episode > lastEpisodeFromPrevSeason) {
                lastEpisodeFromPrevSeason = downloadLinks[i].episode;
            }
        }
    }
    if (lastEpisodeFromPrevSeason > 0) {
        let firstEpisodeOfSeason = -1;
        for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
            if (downloadLinks[i].season === 2) {
                if (firstEpisodeOfSeason === -1) {
                    firstEpisodeOfSeason = downloadLinks[i].episode;
                }
                if (downloadLinks[i].episode < firstEpisodeOfSeason) {
                    firstEpisodeOfSeason = downloadLinks[i].episode;
                }
            }
        }

        for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
            if (!downloadLinks[i].info.toLowerCase().includes('.part') && downloadLinks[i].season === 2) {
                if (firstEpisodeOfSeason === lastEpisodeFromPrevSeason + 1) {
                    downloadLinks[i].season = downloadLinks[i].season - 1;
                }
            }
        }
    }

    return downloadLinks;
}

function fixSeasonSeparation(downloadLinks) {
    const saveResult = [];
    for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
        const partMatch = downloadLinks[i].info.match(/\.Part_\d/gi);
        if (partMatch) {
            const partNumber = Number(partMatch[0].replace(/Part|\.|_/gi, ''));
            if (partNumber === 1) {
                continue;
            }
            const seasonNumber = downloadLinks[i].season;

            const cache = saveResult.find(item => item.seasonNumber === downloadLinks[i].season && item.partNumber === partNumber);
            if (cache) {
                downloadLinks[i].episode += cache.plusEpisode;
                continue;
            }

            let lastEpisodeFromPrevPart = 0;

            for (let j = 0, _length2 = downloadLinks.length; j < _length2; j++) {
                if (
                    (partNumber === 2 &&
                        (downloadLinks[j].info.toLowerCase().includes('.part_1') || !downloadLinks[j].info.toLowerCase().includes('.part'))) ||
                    (partNumber > 2 && downloadLinks[j].info.toLowerCase().includes('.part_' + (partNumber - 1)))
                ) {
                    if (downloadLinks[j].season === seasonNumber && downloadLinks[j].episode > lastEpisodeFromPrevPart) {
                        lastEpisodeFromPrevPart = downloadLinks[j].episode;
                    }
                }
            }

            if (lastEpisodeFromPrevPart > 0) {
                saveResult.push({
                    seasonNumber: seasonNumber,
                    partNumber: partNumber,
                    plusEpisode: lastEpisodeFromPrevPart,
                });
                downloadLinks[i].episode += lastEpisodeFromPrevPart;
            }
        }
    }
    return downloadLinks;
}

function fixSpecialEpisodeSeason(downloadLinks) {
    for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
        if (downloadLinks[i].info.toLowerCase().includes('special') && downloadLinks[i].season === 0) {
            downloadLinks[i].season = 1;
            if (downloadLinks[i].episode <= 1) {
                let season1LastEpisode = downloadLinks.reduce((episodeNumber, item) => {
                    if (item.season === 1) {
                        episodeNumber = Math.max(episodeNumber, item.episode);
                    }
                    return episodeNumber;
                }, 0);
                downloadLinks[i].episode += season1LastEpisode;
            }
        }
    }
    return downloadLinks;
}
