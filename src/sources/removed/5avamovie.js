import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../searchTools.js";
import {validateYear, getType, replacePersianNumbers, removeDuplicateLinks} from "../../utils/utils.js";
import {getTitleAndYear} from "../../movieTitle.js";
import {
    purgeEncoderText,
    purgeSizeText,
    fixLinkInfoOrder,
    fixLinkInfo,
    purgeQualityText,
} from "../../linkInfoUtils.js";
import {posterExtractor, summaryExtractor, trailerExtractor} from "../../extractors/index.js";
import save from "../../save_changes_db.js";
import {saveError} from "../../../error/saveError.js";

export const sourceConfig = Object.freeze({
    sourceName: "avamovie",
    needHeadlessBrowser: true,
    sourceAuthStatus: 'ok',
    vpnStatus: Object.freeze({
        poster: 'allOk',
        trailer: 'noVpn',
        downloadLink: 'noVpn',
    }),
    isTorrent: false,
    replaceInfoOnDuplicate: true,
    removeScriptAndStyleFromHtml: true,
});

export default async function avamovie({movie_url, serial_url}, pageCount, extraConfigs) {
    let p1 = await wrapper_module(sourceConfig, serial_url, pageCount, search_title, extraConfigs);
    let p2 = await wrapper_module(sourceConfig, movie_url, pageCount, search_title, extraConfigs);
    return [p1, p2];
}

async function search_title(link, pageNumber, $, url, extraConfigs) {
    try {
        let title = link.attr('title');
        if (title && link.parent().hasClass('item-movie')) {
            let year;
            let pageLink = link.attr('href');
            let type = getType(title);
            if (type.includes('movie') && url.includes('/series/')) {
                type = type.replace('movie', 'serial');
            } else if (type.includes('serial') && url.includes('/movies/')) {
                type = type.replace('serial', 'movie');
            }
            if (config.nodeEnv === 'dev') {
                console.log(`avamovie/${type}/${pageNumber}/${title}  ========>  `);
            }
            ({title, year} = getTitleAndYear(title, year, type));

            if (title !== '') {
                let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (pageSearchResult) {
                    let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
                    if (!year) {
                        year = fixYear($2);
                    }
                    if (type.includes('movie') && downloadLinks.length > 0 && (
                        downloadLinks[0].link.match(/s\d+e\d+/gi) ||
                        downloadLinks[0].link.match(/\.E\d\d\d?\..*\d\d\d\d?p?\./i) ||
                        downloadLinks[0].link.match(/(?<=\.)(Special|OVA|ONA|OAD|NCED|NCOP|Redial)\.\d\d\d?\.\d\d\d\d?p?/i) ||
                        (type === 'anime_movie' && downloadLinks[0].link.match(/\.\d\d\d?\.\d\d\d\d?p/i))
                    )) {
                        type = type.replace('movie', 'serial');
                        pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                        if (!pageSearchResult) {
                            return;
                        }
                        ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                    }
                    year = fixWrongYear(title, type, year);
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
            if (type.includes('movie') && downloadLinks.length > 0 && (
                downloadLinks[0].link.match(/s\d+e\d+/gi) ||
                downloadLinks[0].link.match(/\.E\d\d\d?\..*\d\d\d\d?p?\./i) ||
                downloadLinks[0].link.match(/(?<=\.)(Special|OVA|ONA|OAD|NCED|NCOP|Redial)\.\d\d\d?\.\d\d\d\d?p?/i) ||
                (type === 'anime_movie' && downloadLinks[0].link.match(/\.\d\d\d?\.\d\d\d\d?p/i))
            )) {
                type = type.replace('movie', 'serial');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
            }
            year = fixWrongYear(title, type, year);
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
        let postInfo = $('li:contains("سال های پخش")');
        if (postInfo.length === 0) {
            postInfo = $('li:contains("سال انتشار")');
        }
        if (postInfo.length === 0) {
            postInfo = $('li:contains("سال تولید")');
        }
        if (postInfo.length === 1) {
            const temp = $(postInfo).text()
                .replace('سال های پخش', '')
                .replace('سال انتشار', '')
                .replace('سال تولید', '')
                .toLowerCase().trim();
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
            if ($(divs[i]).hasClass('rate imdb')) {
                let imdb = $($($(divs[i]).children()[0]).children()[1]).text();
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

function fixWrongYear(title, type, year) {
    if (title === 'the blacklist' && type === 'serial') {
        return '2013'; // 2016 --> 2013
    } else if (title === 'i am the night' && type === 'serial') {
        return '2019'; // 2011 --> 2019
    } else if (title === 'living with yourself' && type === 'serial') {
        return '2019'; // 2010 --> 2019
    } else if (title === 'the l word generation q' && type === 'serial') {
        return '2019'; // 2021 --> 2019
    }
    return year;
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
    const infoNodeChildren = $($($(link).parent().parent().parent().prev()).children()[1]).children();
    const temp = $(infoNodeChildren[0]).text();
    const qualityText = (temp.match(/\d\d\d\d?p/i) || temp.includes('کیفیت')) ? temp : $(infoNodeChildren[1]).text();
    let quality = replacePersianNumbers(qualityText);
    quality = purgeQualityText(quality).split(/\s+/g).reverse().join('.');
    let size = $(infoNodeChildren[2]).text();
    if (size.includes('حجم')) {
        size = purgeSizeText(size);
    } else if (infoNodeChildren.length > 3) {
        const text = $(infoNodeChildren[3]).text();
        size = text === 'SoftSub' ? '' : purgeSizeText(text);
    }
    if (quality === '' && size === '') {
        return 'ignore';
    }
    let info = fixLinkInfo(quality, $(link).attr('href'), type);
    info = fixLinkInfoOrder(info);
    return [info, size].filter(Boolean).join(' - ');
}

function getFileData_movie($, link, type) {
    const containerText = $($(link).parent().parent().parent().parent().prev()).text().trim();
    const infoNode = $(link).parent().parent().next().children()[0];
    const infoNodeChildren = $(infoNode[1]).children();
    let quality = replacePersianNumbers($(infoNode[0]).text());
    quality = quality.includes('نلود فیلم') ? '' : purgeQualityText(quality).replace(/\s+/g, '.');
    let encoder = purgeEncoderText($(infoNodeChildren[0]).text());
    let size = purgeSizeText($(infoNodeChildren[1]).text());
    if (encoder.includes('حجم')) {
        size = purgeSizeText(encoder);
        encoder = '';
    }
    if (containerText.includes('بدون زیرنویس')) {
        quality = quality.replace(/\.?HardSub|SoftSub/i, '');
    }
    let info = [quality, encoder].filter(Boolean).join('.');
    info = fixLinkInfo(info, $(link).attr('href'), type);
    info = fixLinkInfoOrder(info);
    return [info, size].filter(Boolean).join(' - ');
}

function getQualitySample($, link) {
    try {
        const nextNode = $(link).next()[0];
        if (!nextNode || nextNode.name !== 'div') {
            return '';
        }
        const sampleUrl = nextNode.attribs['data-imgqu'];
        if (sampleUrl.endsWith('.jpg')) {
            return sampleUrl;
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}
