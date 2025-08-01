/** biome-ignore-all lint/style/noUnusedTemplateLiteral: <explanation> */
import * as cheerio from 'cheerio';
import fastDiff from 'fast-diff';
import chalk from 'chalk';
import { sourcesNames } from '@services/crawler/sourcesArray';
import { logger, TerminalUtils } from '@/utils';
import { saveError } from '@utils/logger';
import {
    updateSourcePageData,
    getSourcePagesSamples,
} from '@/samples/sourcePages/sourcePageSample';

export function getPersianSummary($: any, title: string, year: string): string {
    try {
        const $div = $('div');
        const $p = $('p');
        const $strong = $('strong');
        const $summary = $('summary');

        for (let i = 0, divLength = $div.length; i < divLength; i++) {
            if ($($div[i]).hasClass('plot_text')) {
                return purgePersianSummary($($div[i]).text(), title, year);
            }
        }

        // bia2anime -conflict with خلاصه داستان
        for (let i = 0, pLength = $p.length; i < pLength; i++) {
            if ($($p[i]).parent().hasClass('-plot')) {
                return purgePersianSummary($($p[i]).text(), title, year);
            }
        }

        //golchindl -conflict with خلاصه داستان
        for (let i = 0, divLength = $div.length; i < divLength; i++) {
            if ($($div[i]).hasClass('summary') && $($div[i]).text().includes('خلاصه')) {
                return purgePersianSummary($($div[i]).text(), title, year);
            }
        }

        //avamovie -conflict with خلاصه داستان
        for (let i = 0, divLength = $div.length; i < divLength; i++) {
            if ($($div[i]).hasClass('plot')) {
                return purgePersianSummary($($div[i]).text(), title, year);
            }
        }

        //film2movie
        for (let i = 0, divLength = $div.length; i < divLength; i++) {
            const temp = $($div[i]).text();
            if (temp && temp.trim() === 'خلاصه داستان :') {
                return purgePersianSummary($($div[i]).next().text(), title, year);
            }
        }

        //salamdl
        for (let i = 0, pLength = $p.length; i < pLength; i++) {
            const temp = $($p[i]).text();
            if (temp && temp.includes('خلاصه داستان')) {
                return purgePersianSummary(temp, title, year);
            }
        }

        //bia2hd
        for (let i = 0, pLength = $p.length; i < pLength; i++) {
            const parent = $p[i].parent;
            if (parent.name === 'div' && $(parent).hasClass('-plot')) {
                return purgePersianSummary($($p[i]).text(), title, year);
            }
        }

        //golchindl | vipofilm
        for (let i = 0, strongLength = $strong.length; i < strongLength; i++) {
            if ($($strong[i]).text().includes('خلاصه داستان')) {
                const summary = purgePersianSummary($($strong[i]).text(), title, year);
                if (!summary && $($($strong[i]).parent())[0]?.name === 'span') {
                    const parentSpan = $($($strong[i]).parent()).text();
                    if (parentSpan) {
                        return purgePersianSummary(parentSpan, title, year);
                    }
                }
                return summary;
            }
        }

        for (let i = 0, pLength = $p.length; i < pLength; i++) {
            if ($($p[i]).text().includes('خلاصه فیلم')) {
                return purgePersianSummary($($p[i]).text().split('–').pop(), title, year);
            }
        }

        // takanime
        for (let i = 0, pLength = $p.length; i < pLength; i++) {
            const prev = $($p[i]).prev()[0];
            if (prev && prev.name?.includes('h') && $(prev).text().includes('داستان')) {
                return purgePersianSummary($($p[i]).text().split('–').pop(), title, year);
            }
        }

        //anime20
        for (let i = 0, divLength = $div.length; i < divLength; i++) {
            const text = $($div[i]).text();
            if (text && $($($div[i]).children())[0]?.name === 'h4' && text.includes('خلاصه')) {
                return purgePersianSummary(text, title, year);
            }
        }

        //nightMovie
        for (let i = 0, divLength = $div.length; i < divLength; i++) {
            const text = $($div[i]).text();
            if (
                text &&
                $($div[i]).children().length === 0 &&
                $($div[i]).attr('class')?.includes('summary')
            ) {
                return purgePersianSummary(text, title, year);
            }
        }

        // moboMovies
        for (let i = 0, summaryLength = $summary.length; i < summaryLength; i++) {
            const text = $($summary[i]).text();
            if (text) {
                return purgePersianSummary(text, title, year);
            }
        }

        // roboFilm
        for (let i = 0, pLength = $p.length; i < pLength; i++) {
            const text = $($p[i]).text() || '';
            if (text && $($p[i]).attr('id')?.includes('summary') && text.includes('داستان')) {
                return purgePersianSummary(text.split('–').pop(), title, year);
            }
        }

        // f2m
        for (let i = 0, divLength = $div.length; i < divLength; i++) {
            const text = $($div[i]).text();
            if (
                text &&
                $($($div[i]).children())[0]?.name === 'p' &&
                $($div[i]).attr('class')?.includes('excerpt')
            ) {
                return purgePersianSummary(text, title, year);
            }
        }

        return '';
    } catch (error) {
        saveError(error);
        return '';
    }
}

function purgePersianSummary(persianSummary: string, title: string, year: string): string {
    try {
        persianSummary = persianSummary.replace(/ /g, ' ');
        const title2 =
            title
                .split('')
                .map((item: string) => {
                    if (item === ' ') {
                        item = ',?:?-?\\.?' + item;
                    }
                    return item;
                })
                .join('') + '!?\\.?';
        const title3 = title
            .replace(' and ', ' (and|&) ')
            .split('')
            .map((item: string) => {
                if (item !== ' ') {
                    item = item + ':?’?-?';
                } else {
                    item = '(\\s|\\-)';
                }
                return item;
            })
            .join('');

        const titleRegex = new RegExp(
            '^(\\s)?' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + `( ${year})?(!)?`,
            'i',
        );

        const escapedTitle = escapeRegex(title2)
            .replace(/,/g, '[,]?') // Handle commas optionally
            .replace(/(\s+)/g, '[\\s,:.-]*'); // Allow spaces/punctuation between words

        const titleRegex2 = new RegExp(
            `^(\\s)?` +
            `(خلاصه( داستان)? (انیمیشن|فیلم|فيلم|سریال|انییمشن) )?` +
            `${escapedTitle}` +
            `[!?]?` + // Optional ! or ?
            `[!?]?` + // Optional ! or ?
            `( ${year})?` +
            `[!]?`, // Optional final !
            'i',
        );

        const titleRegex3 = new RegExp(
            '^(\\s)?(خلاصه( داستان)? (انیمیشن|فیلم|فيلم|سریال|انییمشن) )?' +
            title3.replace(/\*/g, '\\*') +
            `(!)?(\\?)?( ${year})?(!)?`,
            'i',
        );
        persianSummary = persianSummary.replace(titleRegex, '');
        persianSummary = persianSummary.replace(titleRegex2, '');
        persianSummary = persianSummary.replace(titleRegex3, '');

        const titleRegex4 = new RegExp(
            `در خلاصه داستان (سریال|فیلم|فيلم) ${title.replace(/\*/g, '\\*')} آمده است :`,
            'i',
        );
        const titleRegex5 = new RegExp(
            `در خلاصه داستان (سریال|فیلم|فيلم) ${title.replace(/\*/g, '\\*')} آمده است که , `,
            'i',
        );
        persianSummary = persianSummary.replace(titleRegex4, '');
        persianSummary = persianSummary.replace(titleRegex5, '');
    } catch (error) {
        saveError(error);
    }

    return persianSummary
        .replace(/^\s*!\s+\d+\s(?=\()/, '')
        .replace('در خلاصه داستان این فیلم ترسناک و رازآلود آمده است ، ', '')
        .replace('در خلاصه داستان این سریال آمده است که، ', '')
        .replace('در خلاصه داستان این فیلم آمده است ، ', '')
        .replace('در خلاصه داستان این سریال آمده است ، ', '')
        .replace(/^(\s*خلاصه داستان\s*:)+/, '')
        .replace('خلاصه فیلم', '')
        .replace(/\n+/g, ' ')
        .replace(/\s\s+/g, ' ')
        .replace(
            /^\s?در خلاصه داستان این (انیمیشن|فیلم|فيلم|سریال|انییمشن)?( ترسناک) آمده است(:|(\s،\s))/,
            '',
        )
        .replace(/^\s?در خلاصه داستان (انیمیشن|فیلم|فيلم|سریال|انییمشن) آمده است ، /, '')
        .replace(/^\s?در خلاصه داستان این (انیمیشن|فیلم|فيلم|سریال|انییمشن) آمده است:/, '')
        .replace(/^\s?فارسی English /, '')
        .replace(/(?<=([\u0600-\u06FF]))\s:(?=([\u0600-\u06FF]))/, ': ')
        .replace(/(?<!(([()\d]|[a-zA-Z]|[\u0600-\u06FF])\s?)):/, '')
        .replace(/([.…,\s])+$/, '')
        .trim();
}

export async function comparePrevSummaryWithNewMethod(
    sourceName: string[] | null = null,
    updateMode = true,
    autoUpdateIfNeed = false,
): Promise<{
    total: number;
    checked: number;
    diffs: number;
    updated: number;
}> {
    const stats = {
        total: 0,
        checked: 0,
        diffs: 0,
        updated: 0,
    };

    try {
        logger.warn('------------- START OF (comparePrevSummaryWithNewMethod) -----------');
        const sources = sourceName || sourcesNames;
        console.time('comparePrevSummaryWithNewMethod');
        for (let i = 0; i < sources.length; i++) {
            logger.warn(
                `------------- START OF (comparePrevSummaryWithNewMethod [${sources[i]}]) -----------`,
            );
            let sourcePages: any[] | string = [];
            let start = 1;
            let lastFileIndex = 1;
            while (true) {
                sourcePages = await getSourcePagesSamples(sources[i], start, start);
                start++;
                if (sourcePages.length === 0) {
                    logger.warn(
                        `------------- END OF (comparePrevSummaryWithNewMethod [${sources[i]}]) -----------`,
                    );
                    break;
                }
                stats.total += sourcePages.length;

                for (let j = 0; j < sourcePages.length; j++) {
                    if (lastFileIndex !== sourcePages[j].fileIndex) {
                        lastFileIndex = sourcePages[j].fileIndex;
                        logger.warn(
                            `------------- START OF [${sources[i]}] -fileIndex:${lastFileIndex} -----------`,
                        );
                    }
                    stats.checked++;
                    const {
                        persianSummary,
                        pageContent,
                        title,
                        year,
                        sourceName: sName,
                        fileIndex,
                        type,
                        pageLink,
                    } = sourcePages[j];
                    const $ = cheerio.load(pageContent);
                    const newPersianSummary = getPersianSummary($, title, year);
                    if (newPersianSummary.length === 0) {
                        logger.warn(`
                            --- empty summary (${title}) (year:${year}): 
                            ${fileIndex} |
                            ${stats.checked} / ${stats.total} |
                            ${title} | 
                            ${type} |
                            ${pageLink}`,
                        );
                    } else if (newPersianSummary.length > 1600) {
                        logger.warn(`
                            --- suspicious summary (${title}) (year:${year}): 
                            ${fileIndex} |
                            ${stats.checked} / ${stats.total} |
                            ${title} | 
                            ${type} | 
                            ${pageLink}`,
                        );
                        logger.warn(newPersianSummary);
                    }

                    if (persianSummary !== newPersianSummary) {
                        logger.warn(`
                            ${sName} |
                            ${fileIndex} |
                            ${stats.checked} / ${stats.total} |
                            ${title} |
                            ${type} |
                            ${pageLink}`,
                        );
                        let diff: any[] = [];
                        let diffs: any[] = [];
                        let t = '';
                        if (persianSummary.length < 1600 && newPersianSummary.length < 1600) {
                            diff = fastDiff(persianSummary, newPersianSummary);
                            diffs = [];
                            t = persianSummary;
                            diff.forEach((part: fastDiff.Diff) => {
                                const value = part[1]?.toString() ?? '';
                                if (part[0] === 1) {
                                    const p = chalk.green(value);
                                    t = t.replace(value, p);
                                    diffs.push(p);
                                } else if (part[0] === -1) {
                                    const p = chalk.red(value);
                                    t = t.replace(value, p);
                                    diffs.push(p);
                                }
                            });
                        }

                        logger.warn('', {
                            ps1: persianSummary,
                            ps2: newPersianSummary,
                        });
                        logger.warn(`${chalk.blue('RES')}: ${t}\n${chalk.blue('DIFFS')}: ${diffs}`);

                        stats.diffs++;

                        if (updateMode) {
                            const checkUpdateIsNeededResult = checkUpdateIsNeeded(
                                diffs,
                                diff,
                                title,
                                year,
                            );
                            if (checkUpdateIsNeededResult && autoUpdateIfNeed) {
                                logger.warn('------ semi manual update');
                                sourcePages[j].persianSummary = newPersianSummary;
                                await updateSourcePageData(sourcePages[j], ['persianSummary']);
                                stats.updated++;
                                continue;
                            }

                            const answer = await TerminalUtils.question(
                                `update this movie data? [checkUpdateIsNeeded=${checkUpdateIsNeededResult}]`,
                            );
                            logger.info('');
                            if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
                                stats.updated++;
                                sourcePages[j].persianSummary = newPersianSummary;
                                await updateSourcePageData(sourcePages[j], ['persianSummary']);
                            }
                            logger.info('');
                        }
                        logger.info('-------------------------');
                        logger.info('-------------------------');
                    }
                }
            }
        }
        console.timeEnd('comparePrevSummaryWithNewMethod');
        logger.warn(JSON.stringify(stats));
        logger.warn('------------- END OF (comparePrevSummaryWithNewMethod) -----------');
        return stats;
    } catch (error) {
        saveError(error);
        return stats;
    }
}

function checkUpdateIsNeeded(diffs: any[], diff: any[], title: string, year: string): boolean {
    const changes: fastDiff.Diff[] = diff.filter((item) => item[0] !== 0);
    const changesJoinedValues = changes
        .map((item) => item[1])
        .join('')
        .trim()
        .replace(/\s/g, '');
    logger.warn(JSON.stringify(changes));
    return (
        (diffs.length <= 3 && changes.every((item) => item[0] === 1 && item[1] === ':')) ||
        (diffs.length <= 4 &&
            changes.every(
                (item) => item[0] === -1 && (item[1] === ' ' || item[1] === '  '),
            )) ||
        (diffs.length <= 11 &&
            changes.every(
                (item) =>
                    (item[0] === -1 && item[1] === ' ') ||
                    (item[0] === 1 && item[1] === ' '),
            )) ||
        (diffs.length <= 2 &&
            changes.every(
                (item) => item[0] === -1 && (item[1] === '\n' || item[1] === '\n\n'),
            )) ||
        (diffs.length === 2 &&
            changes[0][0] === 1 &&
            changes[0][1] === ':' &&
            changes[1][0] === -1 &&
            changes[1][1] === ' ') ||
        (diffs.length === 2 &&
            changes[0][0] === -1 &&
            (changes[0][1] === '\n' || changes[0][1] === '\n\n') &&
            changes[1][0] === 1 &&
            changes[1][1] === ' ') ||
        (diffs.length <= 7 &&
            changes.every((item) => item[0] === -1) &&
            (changesJoinedValues === 'درانفیلمآمدهاست،ی' ||
                changesJoinedValues === 'دراینفیلمترسناکآمدهاست،' ||
                changesJoinedValues === 'درایسریاآمدهاست،نل' ||
                changesJoinedValues === 'دراینفیلمآمدهاست،' ||
                changesJoinedValues === 'دراینفیلمآمدهات،س' ||
                changesJoinedValues === 'دراینسریالآمداست،ه' ||
                changesJoinedValues === 'درانفیلمترسناورازآلودآمدهاست،یک')) ||
        (diffs.length <= 7 &&
            changes.every(
                (item) => item[0] === 1 || (item[0] === -1 && item[1] === ' '),
            ) &&
            (changesJoinedValues === 'خلاصهدستانا' || changesJoinedValues === 'خلاصهداستان')) ||
        (diffs.length <= 7 &&
            changes[0][0] === -1 &&
            (changes[0][1]
                    .toLowerCase()
                    .replace(/[\s!,:.-]/g, '')
                    .trim() === title.toLowerCase().replace(/\s/g, '') ||
                changes[0][1]
                    .toLowerCase()
                    .replace(/[\s!,:.-]/g, '')
                    .trim() === year ||
                changes[0][1]
                    .toLowerCase()
                    .replace(/[\s!,:.-]/g, '')
                    .trim() === (title.toLowerCase() + ' ' + year).replace(/\s/g, '')) &&
            changes
                .slice(1)
                .every(
                    (item) =>
                        (item[0] === 1 && item[1] === ':') ||
                        (item[0] === 1 && item[1] === ' ') ||
                        (item[0] === -1 && item[1] === ' ') ||
                        (item[0] === -1 && item[1] === '\n') ||
                        (item[0] === -1 && item[1] === '\n\n'),
                ))
    );
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
