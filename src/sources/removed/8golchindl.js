import config from "../../../config/index.js";
import {search_in_title_page, wrapper_module} from "../../services/crawler/searchTools.js";
import {validateYear, getType, removeDuplicateLinks, getDecodedLink, replacePersianNumbers} from "../../utils/utils.js";
import {getTitleAndYear} from "../../services/crawler/movieTitle.ts";
import {
    encodersRegex,
    fixLinkInfo,
    fixLinkInfoOrder,
    purgeEncoderText,
    purgeQualityText,
    purgeSizeText,
    releaseRegex,
    specialWords
} from "../../linkInfoUtils.js";
import {posterExtractor, summaryExtractor, trailerExtractor} from "../../extractors/index.js";
import * as persianRex from "persian-rex";
import save from "../../save_changes_db.js";
import {saveError} from "../../../error/saveError.js";
// import { logger } from '../../utils/index.js';

export const sourceConfig = Object.freeze({
    sourceName: "golchindl",
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

export default async function golchindl({movie_url}, pageCount, extraConfigs) {
    let p1 = await wrapper_module(sourceConfig, movie_url, pageCount, search_title, extraConfigs);
    return [p1];
}

async function search_title(link, pageNumber, $, url, extraConfigs) {
    try {
        let title = link.attr('title');
        if (title && title.includes('دانلود') && link.parent()[0].name === 'h2') {
            let year;
            let pageLink = link.attr('href');
            let type = getType(title);
            if (config.nodeEnv === 'dev') {
                logger.info(`golchindl/${type}/${pageNumber}/${title}  ========>  `);
            }
            if (
                title.includes('انتخابات') ||
                title.includes('مجله لیگ قهرمانان') ||
                title.includes('جومونگ') ||
                title.includes('دانلود بازی')
            ) {
                return;
            }
            title = title.replace('پلی استیشن 5', '').replace(/\(.+\)$/, '');
            let isCeremony = title.includes('دانلود مراسم');
            let isCollection = title.includes('کالکشن فیلم') || title.includes('کالکشن انیمیشن');
            ({title, year} = getTitleAndYear(title, year, type));

            if (!year) {
                year = fixYear($, link);
            }

            if (title !== '') {
                let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                    null, null, false,
                    extraSearchMatch, extraSearch_getFileData);
                if (pageSearchResult) {
                    let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
                    type = fixAnimeType($2, type);
                    if (type.includes('serial') && downloadLinks.length > 0 &&
                        downloadLinks[0].link.replace(/\.(mkv|mp4)|\.HardSub|\.x264|:/gi, '') === downloadLinks[0].info.replace(/\.HardSub|\.x264/gi, '')) {
                        type = type.replace('serial', 'movie');
                        pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                            null, null, false,
                            extraSearchMatch, extraSearch_getFileData);
                        if (!pageSearchResult) {
                            return;
                        }
                        ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                    }
                    if (type.includes('movie') && downloadLinks.length > 0 && downloadLinks[0].link.match(/s\d+e\d+/gi)) {
                        type = type.replace('movie', 'serial');
                        pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                            null, null, false,
                            extraSearchMatch, extraSearch_getFileData);
                        if (!pageSearchResult) {
                            return;
                        }
                        ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
                    }
                    downloadLinks = removeDuplicateLinks(downloadLinks, sourceConfig.replaceInfoOnDuplicate);
                    downloadLinks = handleLinksExtraStuff(downloadLinks);
                    if (isCollection) {
                        title += ' collection';
                        addTitleNameToInfo(downloadLinks, title, year);
                    } else if (isCeremony) {
                        addTitleNameToInfo(downloadLinks, title, year);
                    }

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
                        rating: null,
                        cookies
                    };
                    await save(title, type, year, sourceData, pageNumber, extraConfigs);
                }
            }
        }
    } catch (error) {
        await saveError(error);
    }
}

export async function handlePageCrawler(pageLink, title, type, pageNumber = 0, extraConfigs, isCollection = false, isCeremony = false) {
    try {
        title = title.toLowerCase();
        let year;
        ({title, year} = getTitleAndYear(title, year, type));

        let pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
            null, null, false,
            extraSearchMatch, extraSearch_getFileData);
        if (pageSearchResult) {
            let {downloadLinks, $2, cookies, pageContent} = pageSearchResult;
            type = fixAnimeType($2, type);
            if (type.includes('serial') && downloadLinks.length > 0 &&
                downloadLinks[0].link.replace(/\.(mkv|mp4)|\.HardSub|\.x264|:/gi, '') === downloadLinks[0].info.replace(/\.HardSub|\.x264/gi, '')) {
                type = type.replace('serial', 'movie');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                    null, null, false,
                    extraSearchMatch, extraSearch_getFileData);
                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
            }
            if (type.includes('movie') && downloadLinks.length > 0 && downloadLinks[0].link.match(/s\d+e\d+/gi)) {
                type = type.replace('movie', 'serial');
                pageSearchResult = await search_in_title_page(sourceConfig, extraConfigs, title, type, pageLink, pageNumber, getFileData,
                    null, null, false,
                    extraSearchMatch, extraSearch_getFileData);
                if (!pageSearchResult) {
                    return;
                }
                ({downloadLinks, $2, cookies, pageContent} = pageSearchResult);
            }
            downloadLinks = removeDuplicateLinks(downloadLinks, sourceConfig.replaceInfoOnDuplicate);
            downloadLinks = handleLinksExtraStuff(downloadLinks);
            if (isCollection) {
                title += ' collection';
                addTitleNameToInfo(downloadLinks, title, year);
            } else if (isCeremony) {
                addTitleNameToInfo(downloadLinks, title, year);
            }

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
                rating: null,
                cookies
            };
            await save(title, type, year, sourceData, pageNumber, extraConfigs);
            return downloadLinks.length;
        }
        return 0;
    } catch (error) {
        await saveError(error);
        return 'error';
    }
}

function fixYear($, link) {
    try {
        const linkNodeParent = link.parent().parent().parent().parent().next().next().next();
        const yearNodeParentChildren = $(linkNodeParent).children().children().children();
        for (let i = 0, _length = yearNodeParentChildren.length; i < _length; i++) {
            const text = $(yearNodeParentChildren[i]).text();
            if (text.includes('سال ساخت :')) {
                const yearArray = text
                    .replace('سال ساخت :', '')
                    .trim()
                    .split(/\s+|-|–/g)
                    .filter(item => item && !isNaN(item.trim()))
                    .sort((a, b) => Number(a) - Number(b));
                if (yearArray.length === 0) {
                    return '';
                }
                return validateYear(yearArray[0]);
            }
        }
        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function fixAnimeType($, type) {
    try {
        if (type.includes('anime')) {
            return type;
        }
        const details = $('.details')?.text().toLowerCase() || '';
        if (details.includes('انیمیشن') && (details.includes('کشور سازنده :japan') || details.includes('زبان :japan'))) {
            return 'anime_' + type;
        }
        return type;
    } catch (error) {
        saveError(error);
        return type;
    }
}

export function addTitleNameToInfo(downloadLinks, title, year) {
    const names = [];
    for (let i = 0, downloadLinksLength = downloadLinks.length; i < downloadLinksLength; i++) {
        const fileName = getDecodedLink(downloadLinks[i].link.split('/').pop()).split(/a\.?k\.?a/i)[0];
        const nameMatch = fileName.match(/.+\d\d\d\d?p/gi) || fileName.match(/.+(hdtv)/gi);
        const name = nameMatch ? nameMatch.pop()
            .replace(/\d\d\d\d?p|[()]|hdtv|BluRay|WEB-DL|WEBRip|BR-?rip|(hq|lq)?DvdRip|%21|!|UNRATED|Uncut|EXTENDED|REPACK|Imax|Direct[ou]rs?[.\s]?Cut/gi, '')
            .replace(/\.|_|\+|%20| |(\[.+])|\[|\s\s+/g, ' ')
            .replace(/\.|_|\+|%20| |(\[.+])|\[|\s\s+/g, ' ')
            .trim() : '';
        title = title.replace(/s/g, '');
        const temp = name.toLowerCase().replace(/-/g, ' ').replace(/s/g, '');
        if (!name || temp === (title + ' ' + year) || temp === (title + ' ' + (Number(year) - 1))) {
            continue;
        }
        names.push(name.toLowerCase());
        const splitInfo = downloadLinks[i].info.split(' - ');
        if (splitInfo.length === 1) {
            downloadLinks[i].info += '. (' + name + ')';
        } else {
            downloadLinks[i].info = splitInfo[0] + '. (' + name + ')' + ' - ' + splitInfo[1];
        }
    }
    try {
        if (names.length > 0 && names.every(item => item === names[0])) {
            const name = new RegExp(`\\. \\(${names[0].replace(/\*/g, '\\*')}\\)`, 'i');
            for (let i = 0, downloadLinksLength = downloadLinks.length; i < downloadLinksLength; i++) {
                downloadLinks[i].info = downloadLinks[i].info.replace(name, '');
            }
        }
    } catch (error) {

    }
    return downloadLinks;
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
    if ($($(link).parent().parent()).hasClass('wpd-comment-text')) {
        return 'ignore';
    }
    const infoText = $($(link).parent()[0]).text();
    const linkHref = $(link).attr('href');
    const splitInfoText = infoText.split(' – ');
    let quality, encoder;
    if (splitInfoText[0].includes('کیفیت')) {
        const qualityText = splitInfoText[0].split('کیفیت')[1].trim().replace(/ |\s/g, '.');
        quality = purgeQualityText(qualityText);
        encoder = splitInfoText.length > 1 ? purgeEncoderText(splitInfoText[1]) : '';
    } else if (splitInfoText[0].includes('«')) {
        quality = splitInfoText[0].split('«')[1].replace('»:', '');
        quality = purgeQualityText(quality).replace(/\s+/g, '.');
        encoder = splitInfoText.length > 1 ? purgeEncoderText(splitInfoText[1].replace('»: لينک مستقيم', '')) : '';
    } else {
        const splitLinkHref = linkHref.split('.');
        splitLinkHref.pop();
        const seasonEpisodeIndex = splitLinkHref.findIndex((value => value.match(/s\d+e\d+/gi)));
        quality = splitLinkHref.slice(seasonEpisodeIndex + 1).join('.');
        quality = purgeQualityText(quality);
        quality = quality
            .replace(/\.(Golchindl|net|BWBP|2CH)/gi, '')
            .replace('DD%202.0.H.264monkee', 'monkee');
        encoder = '';
    }

    let info = [quality, encoder].filter(Boolean).join('.').replace(/\.+/g, '.');
    info = fixLinkInfo(info, linkHref, type);
    info = fixLinkInfoOrder(info);
    if (info.includes('https')) {
        return 'ignore';
    }
    return info;
}

function getFileData_movie($, link, type) {
    const linkHref = $(link).attr('href');
    const infoText = getMovieInfoText($, link);
    if (infoText.includes('دانلود پشت صحنه') || $(link).text().includes('دانلود پشت صحنه')) {
        return 'ignore';
    }
    let quality, encoder, size;
    if (infoText.includes('|')) {
        const splitInfoText = infoText.split('|');
        if (splitInfoText.length === 3) {
            if (splitInfoText[0].includes('کیفیت')) {
                quality = purgeQualityText(splitInfoText[0]).replace(/\s/g, '.');
                if (splitInfoText[1].includes('انکودر')) {
                    encoder = purgeEncoderText(splitInfoText[1]);
                    size = purgeSizeText(splitInfoText[2]);
                } else {
                    size = purgeSizeText(splitInfoText[1]);
                    encoder = purgeEncoderText(splitInfoText[2]);
                }
            } else {
                quality = purgeQualityText(splitInfoText[1]).replace(/\s/g, '.');
                size = purgeSizeText(splitInfoText[2]);
                encoder = '';
            }
        } else {
            quality = splitInfoText[0].trim()
                .split(' ')
                .filter((text) => text && !persianRex.hasLetter.test(text))
                .join('.');
            size = purgeSizeText(splitInfoText[1]);
            encoder = '';
        }
    } else if (infoText.includes(' –') || infoText.includes(' -')) {
        const splitInfoText = infoText.split(/\s[–-]/g);
        quality = purgeQualityText(splitInfoText[0]).replace(/\s/g, '.');
        if (splitInfoText.length === 3) {
            if (splitInfoText[1].includes('انکودر')) {
                encoder = purgeEncoderText(splitInfoText[1]);
                size = purgeSizeText(splitInfoText[2]);
            } else {
                size = purgeSizeText(splitInfoText[1]);
                encoder = purgeEncoderText(splitInfoText[2]);
            }
        } else {
            size = purgeSizeText(splitInfoText[1]);
            size = (size.toLowerCase().includes('mb') || size.toLowerCase().includes('gb')) ? size : '';
            encoder = splitInfoText[1].includes('انکودر') ? purgeEncoderText(splitInfoText[1]) : '';
        }
    } else {
        const splitInfoText = infoText.split('حجم');
        quality = purgeQualityText(splitInfoText[0]).replace(/\s/g, '.');
        size = splitInfoText.length > 1 ? purgeSizeText(splitInfoText[1]) : '';
        encoder = '';
    }

    let info = [quality, encoder].filter(Boolean).join('.');
    if (info.includes('https')) {
        return 'ignore';
    }
    info = fixLinkInfo(info, linkHref, type);
    info = fixLinkInfoOrder(info);
    info = info.replace('.تاریخ.جهان.2.ساعت', '');
    return [info, size].filter(Boolean).join(' - ');
}

function getMovieInfoText($, link) {
    let infoText = '';
    const parentName = $(link).parent()[0].name;
    if (parentName !== 'li') {
        let infoNodeChildren;
        if (parentName === 'strong') {
            infoNodeChildren = $(link).parent().parent().prev();
            if (!$(infoNodeChildren).text().match(/^BluRay \d\d\d\d?p$/i)) {
                infoNodeChildren = $($(link).parent().parent().parent().prev().children()[0]).children()[0];
            }
            if ($(infoNodeChildren).text().includes('دانلود با کیفیت')) {
                infoNodeChildren = $($(link).parent().parent().parent().prev().prev().children()[0]).children()[0];
            }
        } else {
            infoNodeChildren = parentName !== 'p'
                ? $($(link).parent().parent().prev().children()[0]).children()[0]
                : $($(link).parent().prev().children()[0]).children()[0];
        }
        infoText = $(infoNodeChildren).text();
        if (infoText.match(/پارت \d/g)) {
            // پارت 1
            infoNodeChildren = $(infoNodeChildren).prev();
            infoText = $(infoNodeChildren).text();
        }
        if (infoText.includes('انکودر') || $(infoNodeChildren).length === 0) {
            // انکودر : RMT
            infoNodeChildren = $(link).parent().parent().prev().prev();
            infoText = $(infoNodeChildren).text();
            if (infoText.includes('خلاصه داستان')) {
                infoNodeChildren = $(link).parent().prev().children()[0];
                infoText = $(infoNodeChildren).text();
            }
            if (infoText.match(/^(–|\s)+$/g) || $(infoNodeChildren).length === 0) {
                infoNodeChildren = $(link).parent().parent().prev();
                infoText = $(infoNodeChildren).text();
            }
            if (infoText.match(/^([-=….])+$/g)) {
                infoText = '';
            }
        }
        infoText = infoText
            .replace(/ /g, ' ')
            .replace('- 4K', '')
            .replace('- اختصاصی گلچین دانلود', '')
            .replace('زبان اصلی - ', '')
            .trim();
    }
    return infoText;
}

//------------------------------------------------
//------------------------------------------------

function extraSearchMatch($, link, title) {
    try {
        const linkHref = replacePersianNumbers(getDecodedLink($(link).attr('href'))).toLowerCase();

        if (linkHref.includes('/sub/download/') ||
            linkHref.includes('/movie_cats/') ||
            linkHref.includes('/sound/') ||
            linkHref.includes('/audio/') ||
            linkHref.match(/mka|mkv|mp4|avi|mov|flv|wmv/) ||
            linkHref.match(/((\/sub)|(\.(mkv|zip))|([?#](v-c|comment)[=_-]\d+))$/)) {
            return false;
        }
        if (
            linkHref.match(/\/((\d\d\d+p(\s?bd)?)|(specials?))$/i) ||
            replacePersianNumbers($(link).text()).match(/\d+\s*&\s*\d+/i)
        ) {
            return true;
        }

        title = title.replace(/\*/g, '\\*');
        return (
            !!linkHref.match(/\/s\d+\/(.*\/?((\d{3,4}p(\.x265)?)|(DVDRip))\/)?$/i) ||
            !!linkHref.match(new RegExp(`${title.replace(/\*/g, '\\*')}\\/\\d+p(\\.x265)?\\/`)) ||
            !!linkHref.match(new RegExp(`${title.replace(/\s+/g, '.') .replace(/\*/g, '\\*')}\\/\\d+p(\\.x265)?\\/`)) ||
            !!linkHref.match(new RegExp(`\\/serial\\/${title.replace(/\s+/g, '.').replace(/\*/g, '\\*')}\\/$`)) ||
            !!linkHref.match(/\/(duble|dubbed)\//i) ||
            !!linkHref.match(/\/(HardSub|SoftSub|dubbed|duble|(Zaban\.Asli))\/\d+-(\d+)?\/(\d\d\d\d?p(\.x265)?\/)?/i) ||
            !!linkHref.match(/\/(HardSub|SoftSub|dubbed|duble|(Zaban\.Asli))\/\d\d\d\d?p(\.x265)?\/?/i)
        );
    } catch (error) {
        saveError(error);
        return false;
    }
}

function extraSearch_getFileData($, link, type, sourceLinkData, title) {
    try {
        const linkHref = getDecodedLink($(link).attr('href'));
        const pageHref = $(sourceLinkData.link).attr('href');

        let quality = getQualityFromLinkHref(linkHref, title);
        quality = removeEpisodeNameFromQuality(quality);

        quality = purgeQualityText(quality)
            .replace(/[\[\]]/g, '.')
            .replace(/(\.nf)?(\.ss)?\.?(((Dub)?Golchi?n\.?dl?n?(\.?fa)?(\.\d+p?)?\d?)|RMTGolchindl|GolchinMusics|Golchuindl)(_\d)?/gi, '')
            .replace(/(\.nf)?(\.ss)?\.(NightMovie|AvaMovie|Sas?ber(Fun)?|ValaMovi?e|DayMovie|Bia2M(ovies)?|MrMovie|(filmb(\.in)?)|MovieBaz[.\s]?tv|Amazon|net|BWBP+|2CH)(_\d)?/gi, '')
            .replace(/(^|\.)(iT00NZ|BluZilla|BluDragon|264|AAC2|v2|2hd|MA|60FPS|softsub|sub|soft|8bit|not|(Erai\.raws)|MULVAcoded|RubixFa|0SEC|XOR|Zarfilm|proper|XviD|30nama)/gi, '')
            .replace(/(^|\.)((s\d+e\d+)|(episode\.\d+))/i, '')
            .replace('REAL.', '')
            .replace('DD%202.0.H.264monkee', 'monkee')
            .replace('[AioFilm.com]', '')
            .replace('.Anime.20Dubbing', '')
            .replace(/Galaxy\.Tv/i, 'GalaxyTv');

        const hardSub = pageHref.match(/softsub|hardsub/gi);
        let info = hardSub ? (quality + '.' + hardSub.pop()) : quality;
        info = fixLinkInfo(info, linkHref, type);
        info = fixLinkInfoOrder(info);
        info = info
            .replace(/HardSub\.dubbed/i, 'Dubbed')
            .replace(/\.Www\.DownloadSpeed\.iR/i, '')
            .replace('.Golchindl', '')
            .replace(/\.ATVP\.GalaxyTV/i, '.GalaxyTV')
            .replace(/\.DIMENSION\.pahe/i, '');
        if (!info.match(/^\d\d\d\d?p/)) {
            const t = info;
            info = info.replace(/.+(?=(\d\d\d\dp))/, '');
            if (t === info) {
                info = info.replace(/.+(?=(\d\d\dp))/, '');
            }
        }
        if (!hardSub && pageHref.match(/duble/i) && !info.includes('dubbed')) {
            info = info + '.Dubbed';
        }
        const sizeMatch = info.match(/\.\d+MB(?=(\.|$))/i);
        if (sizeMatch) {
            info = info.replace(new RegExp('\\' + sizeMatch[0].replace(/\*/g, '\\*'), 'gi'), '');
            info = info + ' - ' + sizeMatch[0].replace('.', '');
        }
        if (info.includes('https')) {
            return 'ignore';
        }
        return info;
    } catch (error) {
        saveError(error);
        return 'ignore';
    }
}

function getQualityFromLinkHref(linkHref, title) {
    const splitLinkHref = linkHref
        .replace(/\s+/g, '.')
        .replace(/(\.-\.)/, '.')
        .replace(/\.+/g, '.')
        .replace(/,/g, '')
        .split('.');
    splitLinkHref.pop();

    let seasonEpisodeIndex = splitLinkHref.findIndex((value => value.match(/(?<!\/)s\d+[._-]?(e\d+)?/gi) || value.match(/Ep?\d+/i)));
    if (seasonEpisodeIndex === -1) {
        let numbers = splitLinkHref.filter(item => !isNaN(item));
        if (numbers.length === 1) {
            seasonEpisodeIndex = splitLinkHref.indexOf(numbers[0]);
        }
    }

    if (seasonEpisodeIndex === splitLinkHref.length - 1) {
        seasonEpisodeIndex--;
    }

    return splitLinkHref.slice(seasonEpisodeIndex + 1).join('.')
        .replace(/\d\d\d\d?\.p/, res => res.replace('.p', 'p.'))
        .replace(/^E?\d+\./i, '')
        .replace(/(^|\.)(SoftSub|HardSub)\d*/gi, '')
        .replace(/(^|\.)Not\.Sub(bed)?/i, '')
        .replace(/\?dubbed\d+/i, '')
        .replace(/\.dubbed\.fa(rsi)?/i, '')
        .replace('.netDUBLE', '.DUBLE')
        .replace(/\.(DUBEL?|DIBLE)/i, '.DUBLE')
        .replace('20x264', '')
        .replace(/\.Senario(?=(\.|$))/i, '')
        .replace(/\d\d\d\d?p(?!(\.|\s|$))/i, res => res.replace('p', 'p.'))
        .replace(/(^|\.)s\d+e\d+/i, '')
        .replace(new RegExp('^' + title.replace(/\s+/g, '.').replace(/\*/g, '\\*'), 'i'), '')
        .replace(new RegExp('[.\\/]' + title.replace(/\s+/g, '.').replace(/\*/g, '\\*'), 'i'), '')
        .replace(/\d\d\d\d?p_?\d/, res => res.replace(/_?\d$/, ''))
        .replace(/\.x?264-/i, '.x264.')
        .replace(/(^|\.)10bit/i, '')
        .replace(/\.HQ(?=(\.|$))/i, '')
        .replace(/\.Ohys[.\-]Raws/i, '')
        .replace('.NEW', '')
        .replace(/AC3\.6CH/i, '6CH')
        .replace(/\.5\.1ch/i, '')
        .replace(/ITALIAN|i_c|pcok|(O\.Ye\.of\.Little\.Faith\.Father\.NF\.)/i, '')
        .replace(/\.(STAN|Keyword|TagName|((ctu|real|proper|in|GMEB)(?=(\.|$))))/gi, '')
        .replace('AHDTV', 'HDTV')
        .replace(/\.[876]ch/i, res => res.toUpperCase())
        .replace(/\.Zaban\.Asli/i, '')
        .replace('.(Kor)', '')
        .replace(/(^|\.)((Fifteen\.Minutes\.of\.Shame)|(The\.Gift)|(Beyond\.the\.Aquila\.Rift))/i, '')
        .replace(/\.?\(Film2serial\.ir\)/i, '')
        .replace(/[_\-]/g, '.').replace(/\.+/g, '.').replace(/^\./, '');
}

const specialWordsRegex = new RegExp(`(\\d\\d\\d\\d?p)|(${releaseRegex.source})|(${encodersRegex.source})|(${specialWords.source})`);

function removeEpisodeNameFromQuality(quality) {
    quality = quality.replace(/(^|\.)(silence|Joyeux|problème|loki)/gi, '');
    const tempQuality = quality.replace(/(^|\.)((DVDRip)|(Special))/gi, '');
    if (tempQuality && !tempQuality.match(specialWordsRegex)) {
        const splitTempQuality = tempQuality.split('.');
        for (let i = 0; i < splitTempQuality.length; i++) {
            quality = quality.replace(splitTempQuality[i], '');
        }
        quality = quality.replace(/\.+/g, '.').replace(/(^\.)|(\.$)/g, '');
    } else {
        const tempQuality2 = quality.split(/\.\d\d\d\d?p/)[0].replace(/(^|\.)((DVDRip)|(Special))/gi, '');
        if (tempQuality2 && !tempQuality2.match(specialWordsRegex)) {
            let splitTempQuality = tempQuality2.split('.');
            if (splitTempQuality.length > 0) {
                for (let i = 0; i < splitTempQuality.length; i++) {
                    quality = quality.replace(splitTempQuality[i], '');
                }
                quality = quality.replace(/\.+/g, '.').replace(/(^\.)|(\.$)/g, '');
            }
        }
    }
    return quality;
}

//------------------------------------------------
//------------------------------------------------

export function handleLinksExtraStuff(downloadLinks) {
    if (downloadLinks.every(item => item.season === 1 && item.episode === 0 && (item.link.match(/part\d+/i) || item.info.match(/part_\d+/i)))) {
        return downloadLinks.map(item => {
            const partNumber = item.link.match(/(?<=(part))\d+/i) || item.info.match(/(?<=(part_))\d+/i);
            const episodeMatch = Number(partNumber[0]);
            return {...item, episode: episodeMatch};
        });
    }
    return downloadLinks;
}
