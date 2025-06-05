import { hasSidebarClass } from '@/sources/generic';
import { sourcesNames } from '@services/crawler/sourcesArray';
import { getDecodedLink } from '@utils/crawler';
import { saveError } from '@utils/logger';
import * as cheerio from 'cheerio';
import * as Diff from 'diff';
import chalk from 'chalk';
// @ts-expect-error ...
import inquirer from 'inquirer';
import {
    updateSourcePageData,
    getSourcePagesSamples,
} from '@/samples/sourcePages/sourcePageSample';

const badPosterRegex = /https:\/\/image\.salamdl\.[a-zA-Z]+\/t\/p\/w\d+_and_h\d+_bestv\d+/i;

export function getPoster(
    $: any,
    pageLink: string,
    sourceName: string,
    dontRemoveDimensions: boolean = false,
): string {
    try {
        const $img = $('img');

        if (sourceName === 'film2movie') {
            for (let i = 0, imgLen = $img.length; i < imgLen; i++) {
                const id = $($img[i]).attr('id');
                const alt = $img[i].attribs.alt;
                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                if (
                    (id && id === 'myimg') ||
                    (src.includes('.jpg') && alt && alt.includes('دانلود'))
                ) {
                    return purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                }
            }
            return '';
        }

        for (let i = 0, imgLen = $img.length; i < imgLen; i++) {
            const parent = $img[i].parent.name;
            if (['a', 'figure'].includes(parent)) {
                const parentClass = $($img[i]).parent()?.attr('class') || '';
                if (parentClass.includes('gallery')) {
                    continue;
                }

                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                const poster = purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                if (poster) {
                    return poster;
                }
            }
        }

        for (let i = 0, imgLen = $img.length; i < imgLen; i++) {
            const parent = $img[i].parent.name;
            if (['p', 'div', 'strong', 'span', 'aside'].includes(parent)) {
                const parentClass = $($img[i]).parent()?.attr('class') || '';
                if (isWidePoster(parent, parentClass)) {
                    continue;
                }

                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                const poster = purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                if (poster) {
                    return poster;
                }
            }
        }

        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

export function getWidePoster(
    $: any,
    pageLink: string,
    sourceName: string,
    dontRemoveDimensions: boolean = false,
): string {
    try {
        const $div = $('div[style*="background-image"]');
        // const $div = $('div');
        const $img = $('img');

        for (let i = 0, Len = $div.length; i < Len; i++) {
            const bgImageMatch = $($div[i])
                .attr('style')
                ?.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/gi);

            if (!bgImageMatch || !bgImageMatch[0]) {
                continue;
            }

            const src = bgImageMatch[0].split('url(').pop().replace(/\)$/, '');
            const poster = purgePoster($, $div[i], src, pageLink, dontRemoveDimensions);
            if (poster && poster !== getPoster($, pageLink, sourceName)) {
                return poster;
            }
        }

        for (let i = 0, Len = $img.length; i < Len; i++) {
            const parent = $img[i].parent.name;
            const parentClass = $($img[i]).parent()?.attr('class') || '';

            if (isWidePoster(parent, parentClass)) {
                const src =
                    $img[i].attribs['data-lazy-src'] ||
                    $img[i].attribs['data-src'] ||
                    $img[i].attribs['src'];
                const poster = purgePoster($, $img[i], src, pageLink, dontRemoveDimensions);
                if (poster && poster !== getPoster($, pageLink, sourceName)) {
                    return poster;
                }
            }
        }

        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function isWidePoster(parentName: string, parentClass: string): boolean {
    return (
        parentName === 'div' &&
        (parentClass.includes('background') ||
            (parentClass.includes('cover') && !parentClass.match(/post[._-]cover/)) ||
            !!parentClass.match(/single.?image/g))
    );
}

function purgePoster(
    $: any,
    img: any,
    src: string,
    pageLink: string,
    dontRemoveDimensions: boolean = false,
): string {
    if (
        src === '' ||
        src.match(badPosterRegex) ||
        (!src.includes('upload') && !src.includes('/cdn/')) ||
        src.toLowerCase().includes('/logo') ||
        src.endsWith('.gif') ||
        src.includes('https://www.w3.org/') ||
        src.includes('data:image/') ||
        src.includes('menu') ||
        src.match(/([\/\-_])(Logo|noavatar)[a-z-_]*\./i) ||
        src.match(/imdb\.[a-z\d]+$/i) ||
        hasSidebarClass($(img))
    ) {
        // if (config.nodeEnv === 'dev') {
        //     console.log('************************************ BAD POSTER: ', src);
        // }
        return '';
    }

    const width = Number($(img).attr('width') || 120);
    if (width < 120) {
        // if (config.nodeEnv === 'dev') {
        //     console.log('************************************ BAD POSTER: ', src);
        // }
        return '';
    }

    //wide poster
    if (src.includes('backdrop')) {
        return '';
    }

    if (['a', 'figure'].includes(img.parent.name)) {
        let parentHref = $(img.parent).attr('href');
        if (!parentHref) {
            parentHref = $(img.parent.parent).attr('href');
        }

        if (
            parentHref &&
            getDecodedLink(parentHref).replace(/\/$/, '') !==
                getDecodedLink(pageLink).replace(/\/$/, '') &&
            getDecodedLink(parentHref).replace(/\/$/, '').split('-')[0] !==
                getDecodedLink(src).replace(/\/$/, '').split('-')[0]
        ) {
            return '';
        }
    }

    if (['div'].includes(img.parent.name)) {
        if ($(img.parent).hasClass('head')) {
            return '';
        }
    }

    // if (img.parent.name === "div" && img.parent.parent?.name === "div" &&
    //     $(img.parent.parent).attr('id')?.includes('tab')) {
    //     return '';
    // }

    src = src.replace(/.+(?=https:)/, '');

    if (!dontRemoveDimensions) {
        src = src.replace(/-\d\d\d+x\d\d\d+(?=\.)/g, '');
    }

    src = src.split(/[?&][a-zA-Z\d]+=/g)[0];

    if (!src.startsWith('http')) {
        //relative links
        src = pageLink.split(/(?<=([a-zA-Z\d])\/)/g)[0] + src.replace(/^\//, '');
    }

    return src;
}

export async function comparePrevPosterWithNewMethod(
    sourceName: string[] | null = null,
    updateMode: boolean = true,
    autoUpdateIfNeed: boolean = false,
): Promise<any> {
    const stats = {
        total: 0,
        checked: 0,
        diffs: 0,
        updated: 0,
    };
    try {
        console.log('------------- START OF (comparePrevPosterWithNewMethod) -----------');
        const sources = sourceName || sourcesNames;
        console.time('comparePrevPosterWithNewMethod');
        for (let i = 0; i < sources.length; i++) {
            console.log(
                `------------- START OF (comparePrevPosterWithNewMethod [${sources[i]}]) -----------`,
            );
            let sourcePages: any[] | string = [];
            let start = 1;
            let lastFileIndex = 1;
            while (true) {
                sourcePages = await getSourcePagesSamples(sources[i], start, start);
                start++;
                if (sourcePages.length === 0) {
                    console.log(
                        `------------- END OF (comparePrevPosterWithNewMethod [${sources[i]}]) -----------`,
                    );
                    break;
                }
                stats.total += sourcePages.length;

                for (let j = 0; j < sourcePages.length; j++) {
                    if (lastFileIndex !== sourcePages[j].fileIndex) {
                        lastFileIndex = sourcePages[j].fileIndex;
                        console.log(
                            `------------- START OF [${sources[i]}] -fileIndex:${lastFileIndex} -----------`,
                        );
                    }
                    stats.checked++;
                    const {
                        sourceName: sName,
                        poster,
                        pageContent,
                        fileIndex,
                        title,
                        type,
                        year,
                        pageLink,
                    } = sourcePages[j];
                    let $ = cheerio.load(pageContent);
                    const newPoster = getPoster($, pageLink, sName);
                    if (!newPoster) {
                        console.log(
                            `--- empty poster (${title}) (year:${year}): `,
                            fileIndex,
                            '|',
                            stats.checked + '/' + stats.total,
                            '|',
                            title,
                            '|',
                            type,
                            '|',
                            pageLink,
                        );
                    }

                    if (poster !== newPoster) {
                        console.log(
                            sName,
                            '|',
                            fileIndex,
                            '|',
                            stats.checked + '/' + stats.total,
                            '|',
                            title,
                            '|',
                            type,
                            '|',
                            pageLink,
                        );
                        const diff = Diff.diffChars(poster, newPoster);
                        const diffs: string[] = [];
                        let t = poster;
                        diff.forEach((part: any) => {
                            if (part.added) {
                                let p = chalk.green(part.value);
                                t = t.replace(part.value, p);
                                diffs.push(p);
                            } else if (part.removed) {
                                let p = chalk.red(part.value);
                                t = t.replace(part.value, p);
                                diffs.push(p);
                            }
                        });
                        console.log({
                            ps1: poster,
                            ps2: newPoster,
                        });
                        console.log(`${chalk.blue('RES')}: ${t}\n${chalk.blue('DIFFS')}: ${diffs}`);

                        stats.diffs++;

                        if (updateMode) {
                            const checkUpdateIsNeededResult = checkUpdateIsNeeded(diffs, diff);
                            if (checkUpdateIsNeededResult && autoUpdateIfNeed) {
                                console.log('------ semi manual update');
                                sourcePages[j].poster = newPoster;
                                await updateSourcePageData(sourcePages[j], ['poster']);
                                stats.updated++;
                                continue;
                            }

                            const questions = [
                                {
                                    type: 'list',
                                    name: 'ans',
                                    message: `update this movie data? [checkUpdateIsNeeded=${checkUpdateIsNeededResult}]`,
                                    choices: ['Yes', 'No'],
                                },
                            ];
                            console.log();
                            const answers = await inquirer.prompt(questions);
                            if (answers.ans.toLowerCase() === 'yes') {
                                stats.updated++;
                                sourcePages[j].poster = newPoster;
                                await updateSourcePageData(sourcePages[j], ['poster']);
                            }
                            console.log();
                        }
                        console.log('-------------------------');
                        console.log('-------------------------');
                    }
                }
            }
        }
        console.timeEnd('comparePrevPosterWithNewMethod');
        console.log(JSON.stringify(stats));
        console.log('------------- END OF (comparePrevPosterWithNewMethod) -----------');
        return stats;
    } catch (error) {
        saveError(error);
        return stats;
    }
}

function checkUpdateIsNeeded(diffs: string[], diff: any[]): boolean {
    const changes = diff.filter((item) => item.removed || item.added);
    console.log(changes);

    return (
        (diffs.length === 1 &&
            changes[0].removed === true &&
            changes[0].value.match(/^-\d\d\dx\d\d\d$/i)) ||
        (diffs.length === 1 &&
            changes[0].removed === true &&
            changes[0].value.match(badPosterRegex))
    );
}
