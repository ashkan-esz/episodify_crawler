import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../services/crawler/searchTools.js";
import {getType, removeDuplicateLinks, replacePersianNumbers} from "../../utils/utils.js";
import {getTitleAndYear} from "../../services/crawler/movieTitle.ts";
import {purgeSizeText, fixLinkInfoOrder, fixLinkInfo, addDubAndSub} from "../../linkInfoUtils.js";
import {posterExtractor, summaryExtractor, trailerExtractor} from "../../extractors/index.js";
import save from "../../save_changes_db.js";
import {saveError} from "../../../error/saveError.js";
// import { logger } from '../../utils/index.js';

export const sourceConfig = Object.freeze({
    sourceName: "anime20",
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

export default async function anime20({movie_url}, pageCount, extraConfigs) {
    let {lastPage, linksCount} = await wrapper_module(sourceConfig, movie_url, pageCount, search_title, extraConfigs);
    return [lastPage, linksCount];
}

async function search_title(link, pageNumber, $, url, extraConfigs) {
    try {
        let title = link.text();
        if (title && link.parent()[0].name === 'div' && link.parent().hasClass('post_small_title')) {
            let year;
            let pageLink = link.attr('href');
            let type = getType(title);
            if (type.includes('movie') && url.includes('/series/')) {
                type = type.replace('movie', 'serial');
            }
            if (url.includes("/anime/") && !type.includes("anime")) {
                type = "anime_" + type;
            }
            if (config.nodeEnv === 'dev') {
                logger.info(`anime20/${type}/${pageNumber}/${title}  ========>  `);
            }
            ({title, year} = getTitleAndYear(title, year, type));

            if (title.endsWith(' movie') || title.includes(' movie ') || title.match(/\smovie\s\d+/)) {
                title = title.replace(/\sthe\s?movie$/, '')
                type = type.replace('serial', 'movie')
            }

            if (title !== '') {
                let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (pageSearchResult) {
                    let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
                    if (type.includes('serial') && downloadLinks.length > 0 && downloadLinks.every(item => item.season === 1 && item.episode === 0)) {
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

        let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
        if (pageSearchResult) {
            let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
            if (type.includes('serial') && downloadLinks.length > 0 && downloadLinks.every(item => item.season === 1 && item.episode === 0)) {
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
            if ($(divs[i]).hasClass('post_meta_i')) {
                let imdb = $($($(divs[i]).children()[1]).children()[0]).text();
                if (imdb) {
                    imdb = imdb.split("/")[0];
                    if (!isNaN(imdb)) {
                        ratings.imdb = Number(imdb);
                    }
                }
                let mal = $($($(divs[i]).children()[3]).children()[0]).text();
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
        let prevElemName = $(link).prev()?.[0]?.name
        if (prevElemName === "source" || prevElemName === "video" || prevElemName === "track") {
            return "ignore";
        }
        const infoNodeChildrenText = $($($(link).parent().prev()).children()).text();
        const sizeText = $($($(link).parent().prev()).children()[1]).text();
        const size = purgeSizeText(replacePersianNumbers(sizeText));
        const sub = addDubAndSub(infoNodeChildrenText, '');
        let info = fixLinkInfo(sub, $(link).attr('href'), type);
        info = fixLinkInfoOrder(info);
        return [info, size].filter(Boolean).join(' - ');
    } catch (error) {
        saveError(error);
        return '';
    }
}
