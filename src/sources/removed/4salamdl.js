import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../searchTools.js";
import {validateYear, getType, removeDuplicateLinks, getSeasonEpisode} from "../../utils/utils.js";
import {getTitleAndYear} from "../../movieTitle.js";
import {
    purgeEncoderText,
    purgeSizeText,
    fixLinkInfo,
    purgeQualityText,
    fixLinkInfoOrder,
    releaseRegex,
} from "../../linkInfoUtils.js";
import {posterExtractor, summaryExtractor, trailerExtractor} from "../../extractors/index.js";
import save from "../../save_changes_db.js";
import * as persianRex from "persian-rex";
import {getSubtitleModel} from "../../../models/subtitle.js";
import {subtitleFormatsRegex} from "../../subtitle.js";
import {saveError} from "../../../error/saveError.js";

export const sourceConfig = Object.freeze({
    sourceName: "salamdl",
    needHeadlessBrowser: false,
    sourceAuthStatus: 'ok',
    vpnStatus: Object.freeze({
        poster: 'vpnOnly',
        trailer: 'noVpn',
        downloadLink: 'noVpn',
    }),
    isTorrent: false,
    replaceInfoOnDuplicate: true,
    removeScriptAndStyleFromHtml: false,
});

export default async function salamdl({movie_url}, pageCount, extraConfigs) {
    let p1 = await wrapper_module(sourceConfig, movie_url, pageCount, search_title, extraConfigs);
    return [p1];
}

async function search_title(link, pageNumber, $, url, extraConfigs) {
    try {
        let rel = link.attr('rel');
        if (rel && rel === 'bookmark') {
            let title = link.text().toLowerCase();
            let year;
            let type = getType(title);
            let pageLink = link.attr('href');
            if (config.nodeEnv === 'dev') {
                console.log(`salamdl/${type}/${pageNumber}/${title}  ========>  `);
            }
            if (
                title.includes('ایران') ||
                title.includes('ماجرای نیمروز') ||
                title.includes('سهیلا') ||
                title.includes('رسوایی') ||
                title.includes('دانلود فصل')
            ) {
                return;
            }
            ({title, year} = getTitleAndYear(title, year, type));

            if (title !== '') {
                let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (pageSearchResult) {
                    let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
                    if (!year) {
                        year = fixYear($2);
                    }
                    if (type.includes('serial') && downloadLinks.length > 0 && downloadLinks[0].info === '') {
                        type = type.replace('serial', 'movie');
                        pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                        if (!pageSearchResult) {
                            return;
                        }
                        ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                    }
                    if (type.includes('movie') && downloadLinks.length > 0 && downloadLinks[0].link.match(/s\d+e\d+/gi)) {
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
                        poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName),
                        trailers: trailerExtractor.getTrailers($2, pageLink, sourceConfig.sourceName, sourceConfig.vpnStatus.trailer),
                        subtitles: getSubtitles($2, type, pageLink),
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
            if (type.includes('serial') && downloadLinks.length > 0 && downloadLinks[0].info === '') {
                type = type.replace('serial', 'movie');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData);
                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
            }
            if (type.includes('movie') && downloadLinks.length > 0 && downloadLinks[0].link.match(/s\d+e\d+/gi)) {
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
                poster: posterExtractor.getPoster($2, pageLink, sourceConfig.sourceName),
                trailers: trailerExtractor.getTrailers($2, pageLink, sourceConfig.sourceName, sourceConfig.vpnStatus.trailer),
                subtitles: getSubtitles($2, type, pageLink),
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
        const postInfo = $('p:contains("تاریخ انتشار")');
        if (postInfo.length === 1) {
            let yearMatch = $(postInfo).text().match(/\d\d\d\d/g);
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

function fixWrongYear(title, type, year) {
    if (title === 'room 104' && type === 'serial') {
        return '2017'; // 2019 --> 2017
    } else if (title === 'the walking dead' && type === 'serial') {
        return '2010'; // 2019 --> 2010
    }
    return year;
}

function getSubtitles($, type, pageLink) {
    try {
        let result = [];
        const $a = $('a');
        for (let i = 0, _length = $a.length; i < _length; i++) {
            const linkHref = $($a[i]).attr('href');
            if (linkHref && linkHref.match(subtitleFormatsRegex)) {
                const subtitle = getSubtitleModel(linkHref, '', type, sourceConfig.sourceName);
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
        if ($($(link).parent().prev()).hasClass('comment-meta')) {
            return 'ignore';
        }

        if (type.includes('serial')) {
            return getFileData_serial($, link, type);
        }

        let text = $(link).text();
        const linkHref = $(link).attr('href');
        let dubbed = '';
        if (text.includes('(دوبله فارسی)') ||
            text.includes('(دو زبانه)') ||
            linkHref.toLowerCase().includes('farsi')) {
            dubbed = 'Dubbed';
            text = text.replace('(دوبله فارسی)', '').replace('(دو زبانه)', '');
        }

        if (text.includes('لینک مستقیم')) {
            return getFileData_extraLink($, link, type);
        }
        return getFileData_movie(text.split('|'), dubbed, linkHref, type);
    } catch (error) {
        saveError(error);
        return "";
    }
}

function getFileData_serial($, link, type) {
    const linkHref = $(link).attr('href');
    const prevNodeChildren = $(link).parent().parent().parent().prev().children();
    let text_array = purgeQualityText($(prevNodeChildren[3]).text()).split(' ');
    const size = purgeSizeText($(prevNodeChildren[5]).text());

    if (text_array.filter(value => value && !persianRex.hasLetter.test(value)).length === 0) {
        return getSerialFileInfoFromLink(linkHref, type);
    }

    if (text_array.length === 1 && text_array[0] === '') {
        text_array = $(link).parent().prev().text().split(' ');
    }

    let info = fixLinkInfo(text_array.filter(Boolean).join('.'), linkHref, type);
    info = fixLinkInfoOrder(info);
    return [info, size].filter(Boolean).join(' - ');
}

function getSerialFileInfoFromLink(linkHref, type) {
    linkHref = linkHref.replace(/[/_\s]/g, '.').replace('.-.', '.');
    const link_href_array = linkHref.split('.');
    const seasonEpisode_match = linkHref.match(/s\d+e\d+(-?e\d+)*/gi);
    let info = '';
    if (seasonEpisode_match) {
        const index = link_href_array.indexOf(seasonEpisode_match.pop());
        const array = link_href_array.slice(index + 1);
        array.pop();
        info = purgeQualityText(array.join('.'));
    } else {
        const seasonEpisode = getSeasonEpisode(linkHref);
        if (seasonEpisode.season !== 1 || seasonEpisode.episode === 0) {
            info = fixLinkInfo(info, linkHref, type);
            info = fixLinkInfoOrder(info);
            return info;
        }
    }

    if (!info.match(/\d\d\d\d?p/i)) {
        const splitInfo = info.split('.');
        let resIndex = splitInfo.findIndex(item => item.match(/\d\d\d\d?p/));
        if (resIndex === -1) {
            resIndex = splitInfo.findIndex(item => item.match(releaseRegex));
        }
        info = resIndex !== -1 ? splitInfo.slice(resIndex).join('.') : '';
    }

    info = fixLinkInfo(info, linkHref, type);
    info = fixLinkInfoOrder(info);
    const temp = linkHref.split('/').pop().split('.');
    const seasonEpisodeIndex = temp.findIndex(item => item.match(/^s\d+e\d+$/i));
    if (seasonEpisodeIndex !== -1) {
        let temp2 = temp.slice(seasonEpisodeIndex + 1).join('.')
            .split(/\.\d\d\d\d?p/)[0]
            .replace(/DIRECTORS?\.CUT|Encore\.Edition|3D|EXTENDED|REMASTERED|Part[._]\d/gi, '');
        if (temp2) {
            info = info.replace('.' + temp2, '');
        }
    }
    return info;
}

function getFileData_movie(text_array, dubbed, linkHref, type) {
    if (text_array[0].includes('تریلر') || text_array[0].includes('تیزر')) {
        return 'trailer';
    }

    let encoder = '';
    const encoder_index = (text_array.length === 1) ? 0 :
        (text_array[1].includes('انکدر') || text_array[1].includes('انکودر')) ? 1
            : (text_array[2] && text_array[2].includes('انکودر:')) ? 2 : '';
    if (encoder_index) {
        encoder = purgeEncoderText(text_array[encoder_index])
    } else {
        const temp = text_array[0].match(/MkvCage|ShAaNiG|Ganool|YIFY|nItRo/i);
        if (temp) {
            encoder = temp[0];
            text_array[0] = text_array[0].replace(new RegExp(`${temp[0]}\\s*-\\s`), '');
        }
    }

    const size_index = (text_array.length === 1) ? 0 :
        (text_array[1].includes('حجم')) ? 1 :
            (text_array[2]) ? 2 : '';
    if (size_index && text_array[size_index].includes('کیفیت')) {
        text_array[size_index] = text_array[size_index].split('حجم').pop();
    }
    const size = size_index ? purgeSizeText(text_array[size_index]) : '';

    let quality = purgeQualityText(text_array[0]);
    if (quality.includes('دانلود نسخه سه بعد')) {
        const info = ['3D', dubbed].filter(Boolean).join('.')
        return [info, size].filter(Boolean).join(' - ');
    }

    quality = quality.split(' ');
    if (quality.length === 1 && quality[0] === '--') {
        quality = [];
    }

    let info = [...quality, encoder, dubbed].filter(Boolean).join('.');
    info = fixLinkInfo(info, linkHref, type);
    info = fixLinkInfoOrder(info);
    return [info, size].filter(Boolean).join(' - ');
}

function getFileData_extraLink($, link, type) {
    const link_href = $(link).attr('href');
    const link_href_array = link_href.split('.');
    const quality_match = link_href.match(/\d\d\d\d?p/gi);
    if (quality_match) {
        const quality_index = link_href_array.indexOf(quality_match.pop());
        const text_array = link_href_array.slice(quality_index, quality_index + 4);
        let info = purgeQualityText(text_array.join('.'));
        info = fixLinkInfo(info, link_href, type);
        info = fixLinkInfoOrder(info);
        return info;
    } else {
        let year_match = link_href.match(/\d\d\d\d/g);
        if (year_match) {
            const year_index = link_href_array.indexOf(year_match.pop());
            let info = link_href_array[year_index + 1];
            info = fixLinkInfo(info, link_href, type);
            info = fixLinkInfoOrder(info);
            return info;
        } else {
            return '';
        }
    }
}
