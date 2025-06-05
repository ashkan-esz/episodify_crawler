import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../services/crawler/searchTools.js";
import {validateYear, getType, replacePersianNumbers, removeDuplicateLinks, getDecodedLink} from "../../utils/utils.js";
import {getTitleAndYear} from "../../services/crawler/movieTitle.ts";
import {
    purgeSizeText,
    fixLinkInfoOrder,
    fixLinkInfo,
    purgeQualityText,
} from "../../linkInfoUtils.js";
import {posterExtractor, summaryExtractor, trailerExtractor} from "../../extractors/index.js";
import save from "../../save_changes_db.js";
import {saveError} from "../../../error/saveError.js";

export const sourceConfig = Object.freeze({
    sourceName: "yekmovie",
    needHeadlessBrowser: false,
    sourceAuthStatus: 'ok',
    vpnStatus: Object.freeze({
        poster: 'allOk',
        trailer: 'noVpn',
        downloadLink: 'noVpn',
    }),
    isTorrent: false,
    replaceInfoOnDuplicate: true,
    removeScriptAndStyleFromHtml: false,
});

export default async function yekmovie({movie_url, serial_url}, pageCount, extraConfigs) {
    // let p1 = await wrapper_module(sourceConfig, serial_url, pageCount, search_title, extraConfigs);
    let {lastPage, linksCount} = await wrapper_module(sourceConfig, movie_url, pageCount, search_title, extraConfigs);
    // return [p1, p2];
    return [lastPage, linksCount];
}

async function search_title(link, pageNumber, $, url, extraConfigs) {
    try {
        let title = link.attr('title');
        if (title && link.parent().parent().hasClass('post-title')) {
            let year;
            let pageLink = link.attr('href');
            let type = getType(title);
            if (!type.includes('anime')) {
                type = "anime_" + type;
            }
            if (config.nodeEnv === 'dev') {
                console.log(`yekmovie/${type}/${pageNumber}/${title}  ========>  `);
            }
            ({title, year} = getTitleAndYear(title, year, type));
            if (title === '') {
                return 0;
            }

            let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
            if (pageSearchResult) {
                let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
                if (!year) {
                    year = fixYear($2);
                }
                if (type.includes('movie') && downloadLinks.length > 0 && (
                    getDecodedLink(downloadLinks[0].link).match(/\s+-\s+\d+\s+\[(480|720|1080|2160)p]/i) || // - 12 [480p]
                    downloadLinks[0].link.match(/\.e\d+\.(480|720|1080|2160)p\./i) ||
                    downloadLinks[0].link.match(/s\d+e\d+/gi) ||
                    downloadLinks[0].link.match(/\.E\d\d\d?\..*\d\d\d\d?p?\./i) ||
                    downloadLinks[0].link.match(/(?<=\.)(Special|OVA|ONA|OAD|NCED|NCOP|Redial)\.\d\d\d?\.\d\d\d\d?p?/i) ||
                    downloadLinks[0].link.match(/\.\d\d\d?\.\d\d\d\d?p/i)
                )) {
                    type = type.replace('movie', 'serial');
                    pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                    if (!pageSearchResult) {
                        return 0;
                    }
                    ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                } else if (type.includes('serial') && (
                    downloadLinks.length === 0 ||
                    (downloadLinks.length < 6 && downloadLinks.every(item => item.season === 1 && item.episode === 0)))
                ) {
                    type = type.replace('serial', 'movie');
                    pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                    if (!pageSearchResult) {
                        return 0;
                    }
                    ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                }
                downloadLinks = removeDuplicateLinks(downloadLinks, sourceConfig.replaceInfoOnDuplicate);

                let sourceData = {
                    sourceConfig,
                    pageLink,
                    downloadLinks,
                    watchOnlineLinks: [],
                    torrentLinks: [],
                    persianSummary: summaryExtractor.getPersianSummary($2, title, year),
                    poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName, true),
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
            if (type.includes('movie') && downloadLinks.length > 0 && (
                getDecodedLink(downloadLinks[0].link).match(/\s+-\s+\d+\s+\[(480|720|1080|2160)p]/i) || // - 12 [480p]
                downloadLinks[0].link.match(/\.e\d+\.(480|720|1080|2160)p\./i) ||
                downloadLinks[0].link.match(/s\d+e\d+/gi) ||
                downloadLinks[0].link.match(/\.E\d\d\d?\..*\d\d\d\d?p?\./i) ||
                downloadLinks[0].link.match(/(?<=\.)(Special|OVA|ONA|OAD|NCED|NCOP|Redial)\.\d\d\d?\.\d\d\d\d?p?/i) ||
                downloadLinks[0].link.match(/\.\d\d\d?\.\d\d\d\d?p/i)
            )) {
                type = type.replace('movie', 'serial');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
            } else if (type.includes('serial') && (
                downloadLinks.length === 0 ||
                (downloadLinks.length < 6 && downloadLinks.every(item => item.season === 1 && item.episode === 0)))
            ) {
                type = type.replace('serial', 'movie');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
            }
            downloadLinks = removeDuplicateLinks(downloadLinks, sourceConfig.replaceInfoOnDuplicate);

            let sourceData = {
                sourceConfig,
                pageLink,
                downloadLinks,
                watchOnlineLinks: [],
                torrentLinks: [],
                persianSummary: summaryExtractor.getPersianSummary($2, title, year),
                poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName, true),
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

function fixYear($) {
    try {
        let postInfo = $('span:contains("سال های پخش")');
        if (postInfo.length === 0) {
            postInfo = $('span:contains("سال انتشار")');
        }
        if (postInfo.length === 0) {
            postInfo = $('span:contains("سال تولید")');
        }
        if (postInfo.length === 1 || postInfo.length === 2) {
            const temp = $(postInfo[0]).text()
                .replace('سال های پخش', '')
                .replace('سال انتشار', '')
                .replace('سال تولید', '')
                .replace(":", "")
                .trim();
            const yearArray = temp.split(/\s+|-/g)
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
            if ($(divs[i]).hasClass('-post-rating')) {
                let mal = $($($($(divs[i]).children()[0]).children()[1]).children()[0]).text();
                if (mal) {
                    mal = mal.split("/")[0];
                    if (!isNaN(mal)) {
                        ratings.myAnimeList = Number(mal);
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

export function getFileData($, link, type) {
    try {
        return type.includes('serial')
            ? getFileData_serial($, link, type)
            : getFileData_movie($, link, type);
    } catch (error) {
        saveError(error);
        return '';
    }
}

function getFileData_serial($, link, type) {
    const infoNodeChildren = $($($(link).parent().parent().parent().parent().prev()).children()[0]).children();
    const seasonText = $(infoNodeChildren[1]).text().replaceAll('فصل', '').replaceAll('قسمت', '').replaceAll('سمت', '').trim().toLowerCase();
    const episodeText = $($(link).parent().prev()).text().replaceAll('قسمت', '').replaceAll('سمت', '').trim();
    let se = "";
    if (!seasonText.match(/Special|sepcial|Speacial|OVA|OVN|ONA|OAD|NCED|NCOP|Redial/i) &&
        !episodeText.match(/Special|sepcial|OVA|OVN|ONA|OAD|NCED|NCOP|Redial|\.|اسپشال|پارت/i)) {
        se = `s${replacePersianNumbers(seasonText)}e${replacePersianNumbers(episodeText)}`;
    }
    if (
        seasonText.includes('پارت') || seasonText.includes('سینمایی') || seasonText.includes('movie') || Number(seasonText) > 40 ||
        episodeText.includes('و') || episodeText.includes('تا') || episodeText.includes('نهایت')) {
        return "ignore";
    }
    const qualityText = $(infoNodeChildren[2]).text();
    let quality = replacePersianNumbers(qualityText).replace('10 bit', '10bit').replace('x 265', 'x265').replace('#', '');
    quality = purgeQualityText(quality).split(/\s+/g).reverse().join('.');
    let size = $(infoNodeChildren[4]).text();
    if (size.includes("زبان") || size.includes("ساب")) {
        size = "";
    } else {
        size = purgeSizeText(size);
    }
    if (quality === '' && size === '') {
        return 'ignore';
    }
    let info = fixLinkInfo(quality, $(link).attr('href'), type);
    info = fixLinkInfoOrder(info);
    if (se !== "" && !info.includes('.Episode(')) {
        se = se.replace(/-\d/, r => r.replace('-', '-e'));
        info = se + "." + info;
    }
    return [info, size].filter(Boolean).join(' - ');
}

function getFileData_movie($, link, type) {
    const infoNodeChildren = $($(link).parent().prev()).children().children();
    let quality = replacePersianNumbers($(infoNodeChildren[1]).text());
    quality = purgeQualityText(quality).replace(/\s+/g, '.');
    let size = purgeSizeText($(infoNodeChildren[2]).text());
    let info = fixLinkInfo(quality, $(link).attr('href'), type);
    info = fixLinkInfoOrder(info);
    return [info, size].filter(Boolean).join(' - ');
}
