import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../services/crawler/searchTools.js";
import {
    getType,
    removeDuplicateLinks,
    getYear,
    getSeasonEpisode
} from "../../utils/utils.js";
import {getTitleAndYear, purgeTitle} from "../../services/crawler/movieTitle.ts";
import {
    purgeEncoderText,
    purgeSizeText,
    purgeQualityText,
    fixLinkInfo,
    fixLinkInfoOrder,
    releaseRegex, specialRegex,
} from "../../linkInfoUtils.js";
import {posterExtractor, summaryExtractor, trailerExtractor} from "../../extractors/index.js";
import save from "../../save_changes_db.js";
import {getWatchOnlineLinksModel} from "../../../models/watchOnlineLinks.js";
import {saveError} from "../../../error/saveError.js";
// import { logger } from '../../utils/index.js';

export const sourceConfig = Object.freeze({
    sourceName: "digimoviez",
    needHeadlessBrowser: true,
    sourceAuthStatus: 'login-cookie',
    vpnStatus: {
        poster: 'allOk',
        trailer: 'noVpn',
        downloadLink: 'noVpn',
    },
    isTorrent: false,
    replaceInfoOnDuplicate: false,
    removeScriptAndStyleFromHtml: true,
});

export default async function digimoviez({movie_url, serial_url}, pageCount, extraConfigs) {
    let {
        lastPage: p1,
        linksCount: count1
    } = await wrapper_module(sourceConfig, serial_url, pageCount, search_title, extraConfigs);
    let {
        lastPage: p2,
        linksCount: count2
    } = await wrapper_module(sourceConfig, movie_url, pageCount, search_title, extraConfigs);
    let count = (count1 || 0) + (count2 || 0);
    return [p1, p2, count];
}

export function digimovie_checkTitle(text, title, url) {
    return (
        (text && text.includes('دانلود') && text.includes('ادامه')) ||
        (url.includes('/serie') && title && title.includes('دانلود') && title !== 'دانلود فیلم' && title !== 'دانلود سریال')
    );
}

async function search_title(link, pageNumber, $, url, extraConfigs) {
    try {
        let text = link.text();
        let title = link.attr('title');
        if (digimovie_checkTitle(text, title, url)) {
            title = title.toLowerCase();
            let year;
            let type = getType(title);
            if (url.includes('serie')) {
                type = type.replace('movie', 'serial');
            }
            let pageLink = link.attr('href');
            if (config.nodeEnv === 'dev') {
                logger.info(`digimoviez/${type}/${pageNumber}/${title}  ========>  `);
            }
            if (title.includes('ایران')) {
                return 0;
            }
            ({title, year} = getTitleAndYear(title, year, type));

            if (title !== '') {
                let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                    getQualitySample, linkCheck, true);

                if (pageSearchResult) {
                    let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
                    if (!year) {
                        ({title, year} = fixTitleAndYear(title, year, type, pageLink, downloadLinks, $2));
                    }
                    if (type.includes('movie') && downloadLinks.length > 0 && (downloadLinks[0].season > 0 || downloadLinks[0].episode > 0)) {
                        type = type.replace('movie', 'serial');
                        pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                            getQualitySample, linkCheck, true);

                        if (!pageSearchResult) {
                            return 0;
                        }
                        ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                    }
                    downloadLinks = removeDuplicateLinks(downloadLinks, sourceConfig.replaceInfoOnDuplicate);
                    const qualitySampleLinks = downloadLinks.map(item => item.qualitySample).filter(item => item);
                    downloadLinks = downloadLinks.filter(item => !qualitySampleLinks.includes(item.link));

                    let sourceData = {
                        sourceConfig,
                        pageLink,
                        downloadLinks,
                        watchOnlineLinks: [],
                        torrentLinks: [],
                        persianSummary: summaryExtractor.getPersianSummary($2, title, year),
                        poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName),
                        trailers: trailerExtractor.getTrailers($2, pageLink, sourceConfig.sourceName, sourceConfig.vpnStatus.trailer),
                        subtitles: [],
                        rating: getRatings($2),
                        cookies
                    };

                    if (extraConfigs.returnAfterExtraction) {
                        return downloadLinks.length;
                    }

                    await save(title, type, year, sourceData, pageNumber, extraConfigs);
                    return downloadLinks.length;
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

        let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
            getQualitySample, linkCheck, true);

        if (pageSearchResult) {
            let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
            if (!year) {
                ({title, year} = fixTitleAndYear(title, year, type, pageLink, downloadLinks, $2));
            }
            if (type.includes('movie') && downloadLinks.length > 0 && (downloadLinks[0].season > 0 || downloadLinks[0].episode > 0)) {
                type = type.replace('movie', 'serial');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                    getQualitySample, linkCheck, true);

                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
            }
            downloadLinks = removeDuplicateLinks(downloadLinks, sourceConfig.replaceInfoOnDuplicate);
            const qualitySampleLinks = downloadLinks.map(item => item.qualitySample).filter(item => item);
            downloadLinks = downloadLinks.filter(item => !qualitySampleLinks.includes(item.link));

            let sourceData = {
                sourceConfig,
                pageLink,
                downloadLinks,
                watchOnlineLinks: [],
                torrentLinks: [],
                persianSummary: summaryExtractor.getPersianSummary($2, title, year),
                poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName),
                trailers: trailerExtractor.getTrailers($2, pageLink, sourceConfig.sourceName, sourceConfig.vpnStatus.trailer),
                subtitles: [],
                rating: getRatings($2),
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

function fixTitleAndYear(title, year, type, page_link, downloadLinks, $2) {
    try {
        const titleHeader = $2('.head_meta');
        if (titleHeader) {
            const temp = $2($2($2(titleHeader).children()[1]).children()[0]).text().toLowerCase();
            const splitTitle = purgeTitle(temp, type, true);
            year = splitTitle[splitTitle.length - 1];
            if (!isNaN(year) && Number(year) > 1900) {
                splitTitle.pop();
                title = splitTitle.join(" ");
                if (year.length === 8) {
                    const y1 = year.slice(0, 4);
                    const y2 = year.slice(4);
                    if (y1 > 2000 && y2 > 2000) {
                        year = Math.min(y1, y2);
                    } else {
                        year = y1;
                    }
                } else if (year.length > 4) {
                    year = year.slice(0, 4);
                }
            } else {
                title = splitTitle.join(" ");
                year = getYear(title, page_link, downloadLinks);
            }
            return {title, year};
        }
        return {title, year: year || ''};
    } catch (error) {
        saveError(error);
        return {title, year: year || ''};
    }
}

function getRatings($) {
    let ratings = {
        imdb: 0,
        rottenTomatoes: 0,
        metacritic: 0,
        myAnimeList: 0
    }

    try {
        let divs = $('div');
        for (let i = 0; i < divs.length; i++) {
            if ($(divs[i]).hasClass('imdb_holder_single')) {
                let imdb = $($($(divs[i]).children()[0]).children()[0]).text();
                if (imdb) {
                    imdb = imdb.split("/")[0];
                    if (!isNaN(imdb)) {
                        ratings.imdb = Number(imdb);
                    }
                }
                break;
            }
        }

        return ratings;
    } catch (error) {
        saveError(error);
        return ratings;
    }
}

function getWatchOnlineLinks($, type, pageLink) {
    //NOTE: need vip account to access
    try {
        let result = [];
        const $a = $('a');
        for (let i = 0; i < $a.length; i++) {
            const infoNode = $($a[i]).parent().parent().parent().prev().children()[1];
            const infoText = $(infoNode).text();
            if (infoText && infoText.includes('پخش آنلاین')) {
                const linkHref = $($a[i]).attr('href');
                if (!linkHref.includes('/play/')) {
                    continue;
                }
                let info = purgeQualityText($($(infoNode).children()[0]).text()).replace(/\s+/g, '.');
                info = fixLinkInfo(info, linkHref, type);
                info = fixLinkInfoOrder(info);
                const sizeMatch = infoText.match(/(\d\d\d?\s*MB)|(\d\d?(\.\d\d?)?\s*GB)/gi);
                const size = sizeMatch ? purgeSizeText(sizeMatch.pop()) : '';
                info = size ? (info + ' - ' + size.replace(/\s+/, '')) : info;
                const watchOnlineLink = getWatchOnlineLinksModel($($a[i]).prev().attr('href'), info, type, sourceConfig.sourceName);
                watchOnlineLink.link = linkHref;
                result.push(watchOnlineLink);
            }
        }

        result = removeDuplicateLinks(result);
        return result;
    } catch (error) {
        saveError(error);
        return [];
    }
}

function linkCheck($, link) {
    const linkHref = $(link).attr('href');
    return (linkHref.includes('digimovie') && linkHref.endsWith('lm_action=download'));
}

export function getFileData($, link, type) {
    try {
        const linkHref = $(link).attr('href');
        const se = getSeasonEpisode(linkHref);
        const seasonEpisodeFromLink = 'S' + se.season + 'E' + se.episode;
        let seasonData = getSeasonEpisode_extra($, link, type);
        if (seasonData === 'ignore') {
            seasonData = {
                seasonName: '',
                seasonEpisode: '',
            };
        }
        if (type.includes('serial') && seasonEpisodeFromLink !== seasonData.seasonEpisode) {
            if (se.season !== 0 && se.episode !== 0) {
                seasonData.seasonEpisode = seasonEpisodeFromLink;
            }
        }

        const infoNode = (type.includes('serial') || linkHref.match(/s\d+e\d+/gi))
            ? $($(link).parent().parent().parent().prev().children()[1]).children()
            : $(link).parent().parent().next().children();
        let isOva = false;
        if (type.includes('serial') && $($(link).parent().parent().parent().prev().children()[0]).text().includes('فصل : OVA')) {
            isOva = true;
        }
        const infoNodeChildren = $(infoNode[1]).children();
        const quality = purgeQualityText($(infoNode[0]).text()).replace(/\s+/g, '.').replace('زیرنویس.چسبیده', '');

        let encoder = (infoNodeChildren.length === 3) ? purgeEncoderText($(infoNodeChildren[0]).text()) : '';
        encoder = encoder
            .replace('DigiMoviez', '')
            .replace(/https:?\/\/.+(mkv|jpg)/, '')
            .replace('نسخه زیرنویس چسبیده فارسی', '');
        let size = (infoNodeChildren.length === 3)
            ? purgeSizeText($(infoNodeChildren[1]).text())
            : purgeSizeText($(infoNodeChildren[0]).text());
        if (size.includes('ENCODER')) {
            size = '';
        }
        let seasonStack = '';
        if (encoder.includes('تمامی قسمت ها در یک فایل قرار دارد')) {
            encoder = encoder.replace('تمامی قسمت ها در یک فایل قرار دارد', '');
            seasonStack = ' (whole season in one file)'
            size = '';
        }
        let info = [quality, encoder, seasonStack].filter(Boolean).join('.');
        info = fixLinkInfo(info, linkHref, type);
        info = fixLinkInfoOrder(info);
        if (seasonData.seasonEpisode) {
            info = seasonData.seasonEpisode + '.' + info;
        }
        if (seasonData.seasonName) {
            info = info + '.' + seasonData.seasonName;
        }
        if (isOva && !info.match(specialRegex)) {
            info = info.replace(new RegExp(`\\.(${releaseRegex.source})`), (res) => '.OVA' + res);
        }
        return [info, size].filter(Boolean).join(' - ');
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getSeasonEpisode_extra($, link, type) {
    try {
        let seasonEpisode = '';
        let seasonName = '';
        let linkText = $(link).text() || '';
        if (type.includes('serial') || linkText.includes('دانلود قسمت')) {
            if (!linkText) {
                return 'ignore';
            }

            linkText = linkText.replace('دانلود قسمت', '').replace(/\./g, '').trim();
            let episodeNumber;
            if (linkText === 'ویژه') {
                episodeNumber = 0;
            } else if (!isNaN(linkText)) {
                episodeNumber = Number(linkText);
            } else {
                return 'ignore';
            }
            const seasonInfo = $($($(link).parent().parent().parent().prev().children()[0]).children()[1]).text().replace(/\d+قسمت/, '').trim();
            const seasonMatch = seasonInfo.match(/فصل\s*:\s*\d+/g);
            if (seasonMatch) {
                const seasonNumber = seasonMatch.pop().match(/\d+/g).pop();
                if (!seasonNumber || Number(seasonNumber) === 0) {
                    return 'ignore';
                }
                seasonEpisode = 'S' + seasonNumber + 'E' + episodeNumber;
            } else if (!seasonInfo.match(/\d/)) {
                seasonName = seasonInfo.replace('فصل :', '').trim().replace(/\s+/g, '_');
                if (seasonName.match(/^(ova|oad|nced|ncop|special|redial)$/i)) {
                    seasonEpisode = 'S0E' + episodeNumber;
                } else {
                    seasonEpisode = 'S1E' + episodeNumber;
                }
            } else {
                return 'ignore';
            }
        }
        return {seasonEpisode, seasonName};
    } catch (error) {
        saveError(error);
        return 'ignore';
    }
}

function getQualitySample($, link, type) {
    try {
        if (type.includes('serial') || $(link).attr('href').match(/s\d+e\d+/gi)) {
            return '';
        }
        const sampleUrl = $(link).next()[0]?.attribs.href || '';
        if (sampleUrl.match(/\.(jpeg|jpg|png)/) || sampleUrl.endsWith('lm_action=download')) {
            return sampleUrl;
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}
