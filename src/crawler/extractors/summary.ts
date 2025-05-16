import * as cheerio from 'cheerio';
import * as Diff from 'diff';
import chalk from 'chalk';
import { sourcesNames } from '@crawler/sourcesArray';
import { saveError } from '@utils/logger';
// @ts-expect-error ...
import inquirer from 'inquirer';
import {
    updateSourcePageData,
    getSourcePagesSamples,
} from '@crawler/samples/sourcePages/sourcePageSample';

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
    updateMode: boolean = true,
    autoUpdateIfNeed: boolean = false,
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
        console.log('------------- START OF (comparePrevSummaryWithNewMethod) -----------');
        const sources = sourceName || sourcesNames;
        console.time('comparePrevSummaryWithNewMethod');
        for (let i = 0; i < sources.length; i++) {
            console.log(
                `------------- START OF (comparePrevSummaryWithNewMethod [${sources[i]}]) -----------`,
            );
            let sourcePages: any[] | string = [];
            let start = 1;
            let lastFileIndex = 1;
            while (true) {
                sourcePages = await getSourcePagesSamples(sources[i], start, start);
                start++;
                if (sourcePages.length === 0) {
                    console.log(
                        `------------- END OF (comparePrevSummaryWithNewMethod [${sources[i]}]) -----------`,
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
                        console.log(
                            `--- empty summary (${title}) (year:${year}): `,
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
                    } else if (newPersianSummary.length > 1600) {
                        console.log(
                            `--- suspicious summary (${title}) (year:${year}): `,
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
                        console.log(newPersianSummary);
                    }

                    if (persianSummary !== newPersianSummary) {
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
                        let diff: any[] = [];
                        let diffs: any[] = [];
                        let t = '';
                        if (persianSummary.length < 1600 && newPersianSummary.length < 1600) {
                            diff = Diff.diffChars(persianSummary, newPersianSummary);
                            diffs = [];
                            t = persianSummary;
                            diff.forEach((part) => {
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
                        }

                        console.log({
                            ps1: persianSummary,
                            ps2: newPersianSummary,
                        });
                        console.log(`${chalk.blue('RES')}: ${t}\n${chalk.blue('DIFFS')}: ${diffs}`);

                        stats.diffs++;

                        if (updateMode) {
                            const checkUpdateIsNeededResult = checkUpdateIsNeeded(
                                diffs,
                                diff,
                                title,
                                year,
                            );
                            if (checkUpdateIsNeededResult && autoUpdateIfNeed) {
                                console.log('------ semi manual update');
                                sourcePages[j].persianSummary = newPersianSummary;
                                await updateSourcePageData(sourcePages[j], ['persianSummary']);
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
                                sourcePages[j].persianSummary = newPersianSummary;
                                await updateSourcePageData(sourcePages[j], ['persianSummary']);
                            }
                            console.log();
                        }
                        console.log('-------------------------');
                        console.log('-------------------------');
                    }
                }
            }
        }
        console.timeEnd('comparePrevSummaryWithNewMethod');
        console.log(JSON.stringify(stats));
        console.log('------------- END OF (comparePrevSummaryWithNewMethod) -----------');
        return stats;
    } catch (error) {
        saveError(error);
        return stats;
    }
}

function checkUpdateIsNeeded(diffs: any[], diff: any[], title: string, year: string): boolean {
    const changes = diff.filter((item) => item.removed || item.added);
    const changesJoinedValues = changes
        .map((item) => item.value)
        .join('')
        .trim()
        .replace(/\s/g, '');
    console.log(changes);
    return (
        (diffs.length <= 3 && changes.every((item) => item.added === true && item.value === ':')) ||
        (diffs.length <= 4 &&
            changes.every(
                (item) => item.removed === true && (item.value === ' ' || item.value === '  '),
            )) ||
        (diffs.length <= 11 &&
            changes.every(
                (item) =>
                    (item.removed === true && item.value === ' ') ||
                    (item.added === true && item.value === ' '),
            )) ||
        (diffs.length <= 2 &&
            changes.every(
                (item) => item.removed === true && (item.value === '\n' || item.value === '\n\n'),
            )) ||
        (diffs.length === 2 &&
            changes[0].added === true &&
            changes[0].value === ':' &&
            changes[1].removed === true &&
            changes[1].value === ' ') ||
        (diffs.length === 2 &&
            changes[0].removed === true &&
            (changes[0].value === '\n' || changes[0].value === '\n\n') &&
            changes[1].added === true &&
            changes[1].value === ' ') ||
        (diffs.length <= 7 &&
            changes.every((item) => item.removed === true) &&
            (changesJoinedValues === 'درانفیلمآمدهاست،ی' ||
                changesJoinedValues === 'دراینفیلمترسناکآمدهاست،' ||
                changesJoinedValues === 'درایسریاآمدهاست،نل' ||
                changesJoinedValues === 'دراینفیلمآمدهاست،' ||
                changesJoinedValues === 'دراینفیلمآمدهات،س' ||
                changesJoinedValues === 'دراینسریالآمداست،ه' ||
                changesJoinedValues === 'درانفیلمترسناورازآلودآمدهاست،یک')) ||
        (diffs.length <= 7 &&
            changes.every(
                (item) => item.added === true || (item.removed === true && item.value === ' '),
            ) &&
            (changesJoinedValues === 'خلاصهدستانا' || changesJoinedValues === 'خلاصهداستان')) ||
        (diffs.length <= 7 &&
            changes[0].removed === true &&
            (changes[0].value
                .toLowerCase()
                .replace(/[\s!,:.-]/g, '')
                .trim() === title.toLowerCase().replace(/\s/g, '') ||
                changes[0].value
                    .toLowerCase()
                    .replace(/[\s!,:.-]/g, '')
                    .trim() === year ||
                changes[0].value
                    .toLowerCase()
                    .replace(/[\s!,:.-]/g, '')
                    .trim() === (title.toLowerCase() + ' ' + year).replace(/\s/g, '')) &&
            changes
                .slice(1)
                .every(
                    (item) =>
                        (item.added === true && item.value === ':') ||
                        (item.added === true && item.value === ' ') ||
                        (item.removed === true && item.value === ' ') ||
                        (item.removed === true && item.value === '\n') ||
                        (item.removed === true && item.value === '\n\n'),
                ))
    );
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
