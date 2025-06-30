import { JapanRegions } from '@/utils';
import { getMonthNumberByMonthName } from '@utils/crawler';

export function extractStaffDataFromJikanAbout(jikanData: any): {
    height: string,
    weight: string,
    birthday: string,
    age: number,
    deathday: string,
    gender: string,
    hair_color: string,
    eye_color: string,
    country: string,
} {
    if (!jikanData || !jikanData.about) {
        const birthday = jikanData.birthday ? jikanData.birthday.toString().split('T')[0] || '' : '';
        return {
            height: '',
            weight: '',
            birthday: birthday || '',
            age: 0,
            deathday: '',
            gender: '',
            hair_color: '',
            eye_color: '',
            country: ''
        };
    }

    normalizeJikanData(jikanData);

    const gender = getGenderFromJikanData(jikanData);
    const {height, weight} = getHeightWeightFromJikan(jikanData);
    // eslint-disable-next-line prefer-const
    let {birthday, age} = getBirthdayAndAgeFromJikan(jikanData);
    const {deathday, deathAge} = getDeathDayAndAgeFromJikan(jikanData);
    if (!age) {
        age = deathAge;
    }
    const hairColor = getHairColorFromJikan(jikanData);
    const eyeColor = getEyeColorFromJikan(jikanData);
    const country = getCountryFromJikan(jikanData);

    fixJikanAbout(jikanData);

    return {
        height: height || '',
        weight: weight || '',
        birthday: birthday || '',
        age: age || 0,
        deathday: deathday || '',
        gender: gender || '',
        hair_color: hairColor || '',
        eye_color: eyeColor || '',
        country: country || '',
    };
}

function normalizeJikanData(jikanData: any): void {
    //normal jikanData.about field
    jikanData.about = jikanData.about
        .replace(
            'No voice actors have been added to this character. Help improve our database by searching for a voice actor, and adding this character to their roles .',
            ''
        )
        .replace(/½|~|(\s?&amp;)/gi, '')
        .replace(/cm|㎝/g, 'cm')
        .replace(/kg|kilograms/gi, 'kg')
        .replace(/\[/g, '(')
        .replace(/]/g, ')')
        .replace(/^[A-Z][a-z]+(\s[A-Z][a-z]+)? - /gm, (r: string) => r.replace(' -', ':'))
        .replace(/- (?=([A-Z][a-z][a-z]))/g, '')
        .replace(/^- (?=(\d\d\d\d))/gm, '')
        .replace(/[A-Z][a-z]+: ((\?\?)|(Unknown)|(N\/A)|(n\/a))(.+)?\n/g, '')
        .replace(/[A-Z][a-z]+:\n/g, '')
        .replace(/[A-Z][a-z]+:(?!\s)/g, (r: string) => r.replace(':', ': '))
        .replace(/[A-Z][a-z]+ :/g, (r: string) => r.replace(' ', ''))
        .replace(/[A-Z][a-z]+' [A-Z]/g, (r: string) => r.replace('\'', ':'))
        .replace(/\d\d\d?,\d(?!\d)/g, (r: string) => r.replace(/,\d/, ''))
        .replace(/[A-Z][a-z]+: \d\d\d?\s?\(formerly\)-\d\d\d?/gi, (r: string) => r.replace(/\d\d\d?\s?\(formerly\)-/, ''))
        .replace(/(Height|Weight): \d\d\d-&gt;\d\d\d (cm|kg)\n/gi, (r: string) => r.replace(/\d\d\d-&gt;/, ''))
        .replace(/(Height|Weight): Part I+: \d\d\d\.\d+ (cm|kg)\n/gi, (r: string) => r.replace(/Part I+: /, ''))
        .replace(/[A-Z][a-z]+: ((at least)|(about)|(almost)|(around))/gi, (r: string) => r.split(' ')[0])
        .replace(/\d+\s?ft\s?\d+\s?in/, (r: string) => r.replace(/\s?ft\s?/, '\'').replace(/\s?in/, '"'))
        .replace(/Height \(.+\):/, 'Height:')
        .replace(/Height - (?=(\d+(\.\d+)?\s?cm))/, 'Height: ')
        .replace(/Height (?=((\d+['"]\s?\d+['"])|(\d+(\.\d+)?\s?cm)))/, 'Height: ')
        .replace(/Weight (?=(\d+(\.\d+)?\s?kg))/i, 'Weight: ')
        .replace(/Weight\s?\n+/, 'Weight: ')
        .replace(' Hair:', '\nHair:');
}

function fixJikanAbout(jikanData: any): void {
    jikanData.about = jikanData.about
        .replace(/Weight: (Undisclosed)?(?!\d)/, '')
        .replace(/\n\s+/g, '\n')
        .trim();
}

function getGenderFromJikanData(jikanData: any): string {
    jikanData.about = jikanData.about
        .replace(/Sex: (Fe)?Male \(past life\) [-→] Sexless/i, 'Sex: Sexless')
        .replace('Gender Identity:', 'Gender:');

    let gender = jikanData.about.match(/(Gender|Sex):\s*(Female|Male|Sexless)/i)?.[0]
        .split(':').pop().trim() || '';
    if (!gender) {
        gender = jikanData.about.match(/^(Female|Male)\.?(\n|$)/mi)?.[0].replace('.', '').trim() ||
            jikanData.about.match(/^((Awards:\s)?(\d\d\d\d\s)?Best\s)(Female|Male)\s/mi)?.[0].match(/Female|Male/i)[0] ||
            jikanData.about.match(/^(the( main)?\s)?(Female|Male)(\s(protagonist|version|(main character)))[.\s]/mi)?.[0].match(/Female|Male/i)[0] ||
            jikanData.about.match(/.{3,10} is the (Female|Male) protagonist of/i)?.[0].match(/Female|Male/i)[0] ||
            jikanData.about.match(/\sthe (Female|Male) main character in/i)?.[0].match(/Female|Male/i)[0] ||
            jikanData.about.match(/\sand main (Female|Male) character (in|of)/i)?.[0].match(/Female|Male/i)[0] ||
            jikanData.about.match(/\sthe (Female|Male) lead of/i)?.[0].match(/Female|Male/i)[0] ||
            jikanData.about.match(/(^|a\s)(Female|Male)\s/)?.[0].match(/Female|Male/)[0] ||
            jikanData.about.match(/((an)|(a Japanese)) ((all-(fe)?male)|((fe)?male .+-member))\s/)?.[0].match(/female|male/)[0] ||
            jikanData.about.match(
                /(a|of|first)(\s[Jj]apanese)? (fe)?male ((vocalist)|(voice)|(animator)|(.*singer)|(Japanese)|((episode|art) director)|(director)|(mangaka)|(artist))[.,\s]/
            )?.[0].match(/female|male/)[0] ||
            jikanData.about.match(
                /(a|of|first)(\syoung)?(\s(japanese|russian))? (fe)?male (shaman|assassin|servant|forger|teacher|doctor|professional|individual)[.,\s]/i
            )?.[0].match(/female|male/i)[0] ||
            jikanData.about.match(/^.{0,20} (fe)?male college[.,\s]/i)?.[0].match(/female|male/i)[0] ||
            jikanData.about.match(/^(.{0,20} is\s)?the (sole|only) (fe)?male member[.,\s]/i)?.[0].match(/female|male/i)[0] ||
            jikanData.about.match(/but( s?he)? is actually (fe)?male\s?(despite|\.|$)/)?.[0].match(/female|male/)[0] ||
            jikanData.about.match(/but prefers others to not mistake (his|hers) gender\s?(\.|$)/)?.[0].match(/\s(his|hers)/)[0]
                .replace('his', 'male').replace('hers', 'female') ||
            jikanData.about.match(/^a (fe)?male dragon /i)?.[0].match(/female|male/i)[0] || '';
    }
    if (!gender) {
        gender = jikanData.about.match(/^(-|\s)?s?he\s/mi)?.[0].replace('-', '').trim().toLowerCase() ||
            jikanData.about.match(/the main protagonist of the story.{0,50}\. s?he /i)?.[0].toLowerCase().match(/s?he/)?.[0] ||
            jikanData.about.match(/\. s?he is the/mi)?.[0].toLowerCase().match(/s?he/)?.[0] || '';
        if (!gender) {
            gender = jikanData.about
                .match(/^in \d\d\d\d, s?he won/mi)?.[0]
                .match(/s?he/i)?.[0]
                .toLowerCase() || '';
        }
        gender = gender === 'she'
            ? 'female'
            : gender === 'he' ? 'male' : '';
    }
    if (!gender) {
        const name = jikanData.name.replace('*', '').replace(/\+/g, '');
        const heroineRegex = new RegExp(name + ' is one of the main heroines', 'i');
        const womanRegex = new RegExp(name + ' is a .{3,15} woman', 'i');
        if (jikanData.about.match(heroineRegex) || jikanData.about.match(womanRegex)) {
            gender = 'female';
        }
        if (!gender) {
            const regex = new RegExp(name + " is .{3,10}\\'s (fe)?male classmate", 'i');
            gender = jikanData.about.match(regex)?.[0].match(/(fe)?male/i)[0] || '';
        }
        if (!gender) {
            const splitName = name.split(' ');
            const regex = new RegExp(splitName[0] + " (is|was) the only (fe)?male.{0,10} (of|in)", 'i');
            gender = jikanData.about.match(regex)?.[0].match(/(fe)?male/i)[0] || '';
        }
        if (!gender) {
            const splitName = name.split(' ');
            const regex = new RegExp(name + " is a (fe)?male (dragon|chimera|student) ", 'i');
            const regex2 = new RegExp(splitName[0] + " is a (fe)?male (dragon|chimera|student) ", 'i');
            gender = jikanData.about.match(regex)?.[0].match(/(fe)?male/i)[0] ||
                jikanData.about.match(regex2)?.[0].match(/(fe)?male/i)[0] || '';
        }
        if (!gender) {
            const regex = new RegExp(name + ".{3,20}\\'s (boyfriend|girlfriend)", 'i');
            const temp = jikanData.about.match(regex)?.[0].match(/(boy|girl)friend/i)[0] || '';
            gender = temp === 'girlfriend'
                ? 'female'
                : temp === 'boyfriend' ? 'male' : '';
        }
    }
    if (!gender) {
        const lines = jikanData.about.split(/(?<!(\s[Mm][Rr]))\.(?!(['",]?\n))/g).filter((item: any) => item);
        const firstTwoLine = lines.slice(0, 2);
        const lastLine = lines[lines.length - 1];
        if (firstTwoLine.length === 2 && !firstTwoLine[0].match(/\s(she|he|her|him|his)([^a-zA-z]|$)/i)) {
            gender = lastLine.match(/\s?s?he\s/i)?.[0].trim().toLowerCase() || '';
            if (!gender) {
                gender = firstTwoLine[1].match(/(^|\s)s?he\s/i)?.[0].trim().toLowerCase() ||
                    firstTwoLine[1].match(/\s(his|hers)\s/i)?.[0].trim().toLowerCase() || '';
            }
            if (!gender) {
                const temp = firstTwoLine[1].match(/(?<=\s)(him|her)/g) || [];
                if (temp.length > 0 && temp.every((item: string) => item === temp[0])) {
                    gender = temp[0];
                }
            }
            if (!gender) {
                const temp = firstTwoLine[1].match(/(?<=\s)(female|male)/g) || [];
                if (temp.length > 0 && temp.every((item: string) => item === temp[0])) {
                    gender = temp[0] === 'female' ? 'she' : 'he';
                }
            }
            gender = (gender === 'she' || gender === 'hers' || gender === 'her')
                ? 'female'
                : (gender === 'he' || gender === 'his' || gender === 'him') ? 'male' : '';
        } else if (firstTwoLine.length === 2) {
            const temp = firstTwoLine.join('  ').match(/\s(she|he|her|him|hers|his|female|male)([^a-zA-z]|$)/gi).map((item: string) => {
                item = item.toLowerCase().trim();
                if (item === 'she' || item === 'her' || item === 'hers' || item === 'female') {
                    return 'female';
                }
                return 'male';
            });
            if (temp.length > 0 && temp.every((item: string) => item === temp[0])) {
                gender = temp[0];
            }
        }
    }

    if (!gender) {
        const name = jikanData.name?.toLowerCase() || '';
        gender = name.match(/^(grand)?father\s/)
            ? 'male'
            : name.match(/^(grand)?mother\s/) ? 'female' : '';
    }

    if (gender) {
        gender = gender.toLowerCase();
        jikanData.about = jikanData.about
            .replace(/(Gender|Sex):\s*((Fe)?Male|Sexless)(\s\(brought up as (fe)?male\))?\n?/gi, '')
            .replace(/^(Female|Male|Sexless)\.?(\n|$)/mi, '');
    }
    return gender;
}

function getHeightWeightFromJikan(jikanData: any): { height: string, weight: string } {
    let height, weight;
    const heightAndWeightRegex = /Height\/Weight: .+\s?[・,\/]\s?.+\n/;
    const heightAndWeightMatch = jikanData.about.match(heightAndWeightRegex)?.[0] || '';
    if (heightAndWeightMatch) {
        let temp = heightAndWeightMatch.replace('Height/Weight: ', '').split(/[・,\/]/);
        height = getHeightFromJikan({about: 'Height: ' + temp[0].trim()});
        weight = getWeightFromJikan({about: 'Weight: ' + temp[1].trim()});
        jikanData.about = jikanData.about.replace(heightAndWeightMatch, '');
    } else {
        height = getHeightFromJikan(jikanData);
        weight = getWeightFromJikan(jikanData);
    }
    return {height, weight};
}

function getHeightFromJikan(jikanData: any): string {
    jikanData.about = jikanData.about
        .replace(/Height: \d+ cm \(\d+\s?cm .+\)\n/, (r: string) => r.replace(/\(.+\)/, ''))
        .replace(/Height: \d+ centimeters .+\n/, (r: string) => r.replace('centimeters', 'cm'))
        .replace(/Height: \d\d\d(\.\d+)?\n/, (r: string) => r + ' cm')
        .replace(' Meters', ' meters');

    const heightRegex = /Height: .{1,18}(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    let heightMatch = jikanData.about.match(heightRegex)?.[0] || '';
    if (heightMatch.match(/\(I+\)/)) {
        heightMatch = '';
    }

    let height = heightMatch
        .match(/((\d+([,.]\d+)?(\s?-\s?\d+(\.\d+)?\s?)?)|(\d+\s?m\s?\d+)|(\d+(\.\d+)?m))\s?(cm|\s(?!M)|$)/)?.[0]
        .replace(',', '')
        .trim()
        .replace(/\d\d\d\s?-\s?\d\d\d/, (r: string) => r.replace(/\s?-\s?\d\d\d/, ''))
        .replace(/\dcm/, (r: string) => r.replace('cm', ' cm'))
        .replace(/\d$/, (r: string) => r + ' cm') || '';

    if (!height) {
        heightMatch = jikanData.about.match(/Height: \d+['"]+\s?(\d+\s?['"]*)?(\s?ft\.)?\n/)?.[0] || '';
        if (heightMatch) {
            const temp = heightMatch.replace('Height: ', '').split(/['"]/g).filter((item: string) => item && !isNaN(Number(item)));
            const number = Number(temp[0]) * 30.48 + Number(temp[1] || 0) * 2.54;
            height = number.toFixed(1) + ' cm';
        }
    } else if (height.match(/\d+(\.\d+)?m/)) {
        const meter = Number(height.match(/\d+(\.\d+)?m/)[0].replace('m', '')) * 100;
        const centimeter = Number(height.match(/\d+(\.\d+)?\s/)?.[0] || '');
        height = (meter + centimeter) + ' cm';
    }

    if (!height) {
        heightMatch = jikanData.about.match(/\d+(-|\s)centimeters?(-|\s)tall\s/)?.[0] || '';
        if (heightMatch) {
            height = heightMatch.match(/\d+/)[0] + ' cm';
        }
    }

    if (height) {
        jikanData.about = jikanData.about.replace(heightMatch, '');
    }
    return height;
}

function getWeightFromJikan(jikanData: any): string {
    const weightRegex = /Weight: .{1,18}(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    let weightMatch = jikanData.about.match(weightRegex)?.[0] || '';
    if (weightMatch.match(/\(I+\)/)) {
        weightMatch = '';
    }

    let weight = weightMatch
        .match(/\d+(\.\d+)?\s?kg/)?.[0]
        .replace(/\dkg/, (r: string) => r.replace('kg', ' kg'))
        .trim() || '';

    if (!weight) {
        weightMatch = jikanData.about.match(/Weight: \d+(\.\d+)?\s?(lbs|pounds)?\n/i)?.[0] || '';
        if (weightMatch) {
            const temp = weightMatch.match(/\d+(\.\d+)?/)[0];
            const number = Number(temp) / 2.205;
            weight = number.toFixed(1) + ' kg';
        }
    }

    if (weight) {
        jikanData.about = jikanData.about.replace(weightMatch, '');
    }
    return weight;
}

function getBirthdayAndAgeFromJikan(jikanData: any): {
    birthday: string, age: number,
} {
    jikanData.about = jikanData.about
        .replace(/-/g, ' ')
        .replace(/born (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-zA-Z]+ \d\d?,? \d\d\d\d(\sin [a-zA-Z]+)?,?\s/i,
            (r: string) => '\n' + r.replace('born', 'Birthday:').replace(/(\sin [a-zA-Z]+)|(,$)/, '') + '\n'
        )
        .replace(/(^|[^\S\r\n])(Birthdate|(Date of [Bb]irth)|(Birth [Dd]ate)|(Birth)|(Born)):/m, 'Birthday:')
        .replace(/Birthday (\(.+\)|date):/, 'Birthday:')
        .replace(/((His|Her)\s?)?Birthday is (?=[A-Z])/, 'Birthday: ')
        .replace(/Birthday (?=[A-Z][a-z]+\s\d\d?)/, 'Birthday: ')
        .replace(/Birthday: .*\d\d?(th|st|nd|rd|,)/, (r: string) => r.replace(/(?<=\d)(th|st|nd|rd|,)/, ''))
        .replace(/Birthday: .+\d\d? \(\d\d\d\d\)/, (r: string) => r.replace(/[()]/g, ''))
        .replace('Birthday: Not official', '')
        .replace(/Age(?=\d)/, 'Age: ')
        .replace(/Age(?=(\s?\d))/, 'Age:')
        .replace(/Age \(.+\):/, 'Age:')
        .replace(/Age: ((less than)|(forever)|(for over)|(approximately)|(approx\.))\s.+\n/i,
            (r: string) => r.replace(/((less than)|(forever)|(for over)|(approximately)|(approx\.))\s/i, '')
        )
        .replace(/Age: \d+ ((years old)|(y\.o\.))(\s\(in human years\))?/, (r: string) => r.replace(/ ((years old)|(y\.o\.))(\s\(in human years\))?/, ''))
        .replace(/Age: \d+( years)(\s\(according to books.+\))?/, (r: string) => r.replace(/( years)(\s\(according to books.+\))?/, ''))
        .replace(/Age: \d+\/\d+\n/, (r: string) => r.replace('/', '-'))
        .replace(/Age: \d+.+(\s\?)?\s\(appears \d+\)\n/i, (r: string) => r.replace(/(\s\?)?\s\(appears \d+\)/i, ''))
        .replace(/Age: \d+ \(((\d+(th|rd|nd))|first|second|third) year.+\)\n/, (r: string) => r.replace(/\s\(.+\)/, ''));

    const birthdayRegex = /Birthday: [a-zA-Z]{3,10}[.,]?\s\d\d?(,?\s{1,3}\d\d\d\d)?(\s?\([A-Z][a-z]+(\s[A-Z][a-z]+)?\))?\s*\.?(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    let birthdayMatch = jikanData.about.match(birthdayRegex)?.[0] || '';
    if (!birthdayMatch) {
        const birthdayRegex2 = /Birthday: \d\d?\s[a-zA-Z]{3,10}(,?\s\d\d\d\d)?(\s?\([A-Z][a-z]+\))?\s*\.?(,|\*|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
        birthdayMatch = jikanData.about.match(birthdayRegex2)?.[0] || '';
    }
    if (!birthdayMatch) {
        const temp = jikanData.about.match(/Birthday: \d\d? [a-zA-Z]{3,10} \(\d+ years old\)/)?.[0];
        if (temp) {
            const yearsOld = temp.match(/\(\d+ years old\)/)[0];
            birthdayMatch = temp.replace(yearsOld, '');
            jikanData.about = jikanData.about.replace(yearsOld, '');
            const age = yearsOld.match(/\d+/)[0];
            jikanData.about = jikanData.about + '\n' + `Age: ${age}` + '\n';
        }
    }

    //------------------------------------------
    const ageRegex = /Age: \d+(\s?[-–→,;\s]\s?\d+)?(\s?\((\d+\s)?[\sa-zA-Z]+\))?(\+)?([^\S\r\n])?(,(?!\s\d)|(\.\s)|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    const ageMatch = jikanData.about.match(ageRegex)?.[0] || '';
    let age = 0;
    if (ageMatch) {
        age = ageMatch
            .replace(/(Age:)|(\(.+\))|(\+)/g, '')
            .split(/[-–→,\s;]/)
            .filter((item: string) => item && !isNaN(Number(item)))
            .pop().trim();
        age = Number(age);
    }
    //------------------------------------------

    let birthday = '';
    const yearMatch = birthdayMatch.match(/\d\d\d\d/);
    if (yearMatch) {
        const year = yearMatch[0];
        const day = birthdayMatch.replace(year, '').match(/\d\d?/)?.[0];
        const temp = birthdayMatch.replace(/(Birthday: )|\./g, '').split(' ');
        let month = temp[0];
        if (month === day) {
            month = temp[1];
        }
        const monthNumber = getMonthNumberByMonthName(month);
        if (year && day && monthNumber) {
            birthday = year + '-' + monthNumber + '-' + day;
        }
    } else {
        const day = birthdayMatch.match(/\d\d?/)?.[0];
        const temp = birthdayMatch.replace('Birthday: ', '').split(' ');
        let month = temp[0];
        if (month === day) {
            month = temp[1];
        }
        const monthNumber = getMonthNumberByMonthName(month);
        if (day && monthNumber) {
            birthday = 'xxxx-' + monthNumber + '-' + day;
        }
    }

    if (!birthdayMatch) {
        const reg = /Birthday: \d\d?\/\d\d?\n/;
        birthdayMatch = jikanData.about.match(reg)?.[0] || '';
        if (birthdayMatch) {
            const monthAndDay = birthdayMatch.match(/\d\d?\/\d\d?/)[0].split('/');
            birthday = 'xxxx-' + monthAndDay[0] + '-' + monthAndDay[1];
        }
    }

    if (!birthday && jikanData.birthday) {
        birthday = jikanData.birthday.toString().split('T')[0] || '';
    }

    if (birthday) {
        birthday = birthday.replace(/-\d(-|$)/g, r => r.replace('-', '-0'));
        birthday = birthday.replace(/-\d(-|$)/g, r => r.replace('-', '-0'));
        jikanData.about = jikanData.about.replace(birthdayMatch, '');
    }
    if (ageMatch) {
        jikanData.about = jikanData.about.replace(ageMatch, '');
    }
    return {birthday, age};
}

function getDeathDayAndAgeFromJikan(jikanData: any): {
    deathday :string, deathAge: number } {
    jikanData.about = jikanData.about
        .replace(/-/g, ' ')
        .replace(/((Termination date)|(Date of [Dd]eath)):/, 'Died:')
        .replace(/Died \(.+\):/, 'Died:')
        .replace(/Died (?=[A-Z][a-z]+\s\d\d?)/, 'Birthday: ')
        .replace(/Died: .*\d\d?(th|st|nd|rd|,)/, (r: string) => r.replace(/(?<=\d)(th|st|nd|rd|,)/, ''))
        .replace('Died: Not official', '');

    const deathDayRegex = /Died: [a-zA-Z]{3,10},?\s\d\d?(,?\s{1,3}\d\d\d\d)?(\s\(age \d+(\s?[-–→,\s]\s?\d+)?\))?(\s?\([A-Z][a-z]+(\s[A-Z][a-z]+)?\))?\s*\.?(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    let deathDayMatch = jikanData.about.match(deathDayRegex)?.[0] || '';
    if (!deathDayMatch) {
        const deathDayRegex2 = /Died: \d\d?\s[a-zA-Z]{3,10}(\s\d\d\d\d)?(\s\(age \d+(\s?[-–→,\s]\s?\d+)?\))?(\s?\([A-Z][a-z]+\))?\s*\.?(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
        deathDayMatch = jikanData.about.match(deathDayRegex2)?.[0] || '';
    }
    //------------------------------------------
    const deathAgeRegex = /age \d+(\s?[-–→,\s]\s?\d+)?/;
    const deathAgeMatch = deathDayMatch.match(deathAgeRegex)?.[0] || '';
    let deathAge = 0;
    if (deathAgeMatch) {
        deathAge = deathAgeMatch
            .replace('age: ', '')
            .split(/[-–→,\s]/)
            .filter((item: string) => item && !isNaN(Number(item)))
            .pop().trim();
        deathAge = Number(deathAge);
    }
    //------------------------------------------

    let deathday = '';
    const yearMatch = deathDayMatch.match(/\d\d\d\d/);
    if (yearMatch) {
        const year = yearMatch[0];
        const day = deathDayMatch.replace(year, '').match(/\d\d?/)?.[0];
        const temp = deathDayMatch.replace('Died: ', '').split(' ');
        let month = temp[0];
        if (month === day) {
            month = temp[1];
        }
        const monthNumber = getMonthNumberByMonthName(month);
        if (year && day && monthNumber) {
            deathday = year + '-' + monthNumber + '-' + day;
        }
    } else {
        const day = deathDayMatch.match(/\d\d?/)?.[0];
        const temp = deathDayMatch.replace('Died: ', '').split(' ');
        let month = temp[0];
        if (month === day) {
            month = temp[1];
        }
        const monthNumber = getMonthNumberByMonthName(month);
        if (day && monthNumber) {
            deathday = 'xxxx-' + monthNumber + '-' + day;
        }
    }

    if (!deathDayMatch) {
        let mode = 0;
        const reg = /Died: \d\d?[/\s.]\d\d?([/\s.]\d\d\d\d)?\.?(\n|$)/;
        deathDayMatch = jikanData.about.match(reg)?.[0] || '';
        if (!deathDayMatch) {
            const reg2 = /Died: \d\d\d\d[/\s.]\d\d?[/\s.]\d\d?(\s\d\d:\d\d AM|PM)?\.?(\n|$)/;
            deathDayMatch = jikanData.about.match(reg2)?.[0] || '';
            mode = 1;
        }
        if (deathDayMatch) {
            const monthAndDay = deathDayMatch.replace(/(Died: )|(\s\d\d:\d\d AM|PM)|\.?\n/g, '').split(/[/\s.]/g);
            if (monthAndDay.length === 3) {
                if (mode === 0) {
                    deathday = monthAndDay.reverse().join('-');
                } else {
                    deathday = monthAndDay.join('-');
                }
            } else {
                deathday = 'xxxx-' + monthAndDay[1] + '-' + monthAndDay[0];
            }
        }
    }

    if (deathday) {
        jikanData.about = jikanData.about.replace(deathDayMatch, '');
    }
    return {deathday, deathAge};
}

function getHairColorFromJikan(jikanData: any): string {
    jikanData.about = jikanData.about
        .replace('Hair: Ebony', 'Hair:')
        .replace(/Hair [Cc]olou?r:(?!\s)/, 'Hair: ')
        .replace(/Hair [Cc]olou?r:/, 'Hair:')
        .replace(/Hair: .+ \(.+\)\n/, (r: string) => r.replace(/\s\(.+\)/, ''))
        .replace(/\s?,/, '');

    const hairRegex = /Hair: [a-zA-Z]{3,10}(([^\S\r\n]|\/)[a-zA-Z]{3,10})*(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    let hairMatch = jikanData.about.match(hairRegex)?.[0] || '';
    if (hairMatch.match(/\(I+\)/)) {
        hairMatch = '';
    }

    const lastName = jikanData.name?.split(' ').pop() || '';
    const hairColor = hairMatch
        .replace('Hair:', '')
        .toLowerCase()
        .replace(lastName, '')
        .trim();

    if (hairColor) {
        jikanData.about = jikanData.about.replace(hairMatch, '');
    }
    return hairColor;
}

function getEyeColorFromJikan(jikanData: any): string {
    jikanData.about = jikanData.about
        .replace(/Eyes?(\s[Cc]olou?r)?:(?!\s)/, 'Eye: ')
        .replace(/Eyes?(\s[Cc]olou?r)?:/, 'Eye:')
        .replace(/\s?,/, '');

    const EyeRegex = /Eye: [a-zA-Z]{3,10}(;)?(([;,])?(([^\S\r\n]|\/)[a-zA-Z]{3,10})*(\s\(([\s\/\da-zA-Z]{3,10})+\))?)*([^\S\r\n])?(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    let EyeMatch = jikanData.about.match(EyeRegex)?.[0] || '';
    if (EyeMatch.match(/\(I+\)/)) {
        EyeMatch = '';
    }

    const lastName = jikanData.name?.split(' ').pop() || '';
    const EyeColor = EyeMatch
        .replace(/(Eye:)|;/g, '')
        .toLowerCase()
        .replace(lastName, '')
        .trim();

    if (EyeColor) {
        jikanData.about = jikanData.about.replace(EyeMatch, '');
    }
    return EyeColor;
}

function getCountryFromJikan(jikanData: any): string {
    jikanData.about = jikanData.about.replace(/((Birth\s?place)|(Place of [Bb]irth)):/, 'Country:');

    let mode = 0;
    const countryRegex = /Country: [a-zA-Z]{3,10}(;)?(([;:,])?(([^\S\r\n]|\/)[a-zA-Z]{2,10})*(\s\(([\s\/\da-zA-Z]{2,10})+\))?)*([^\S\r\n])?(,|(?=(\s[A-Z][a-z][a-z]))|\n|$)/;
    let countryMatch = jikanData.about.match(countryRegex)?.[0] || '';
    if (!countryMatch) {
        mode = 1;
        const countryRegex2 = /Country: [a-zA-Z]{1,10}(([^\S\r\n]|\/)[a-zA-Z]{2,10})*([^\S\r\n])?(\n|$)/;
        countryMatch = jikanData.about.match(countryRegex2)?.[0] || '';
    }
    if (countryMatch.match(/\(I+\)/)) {
        countryMatch = '';
    }

    let country = countryMatch
        .replace(/(Country:)|;|(Occupation:.+)/g, '')
        .toLowerCase()
        .replace('(former) ', '(former), ')
        .replace('city ', 'city, ')
        .trim()
        .replace(/\s?prefecture$/, '')
        .replace(/\sprefecture\s/, ', ');

    const japanRegionNames = JapanRegions.prefectureEnNames();

    if (japanRegionNames.includes(country) || japanRegionNames.includes(country.split(' ').pop())) {
        country = country + ', japan';
    }
    const splitCountry = country.split(/,?\s/g);
    if (splitCountry.length === 2) {
        if (splitCountry[0] === 'japan') {
            country = splitCountry.reverse().join(', ');
        } else if (!country.includes(',') && mode === 0) {
            country = country.replace(' ', ', ');
        }
    } else if (splitCountry.length === 3 && splitCountry[0] === splitCountry[1]) {
        country = splitCountry.slice(1).join(', ');
    }

    if (country) {
        jikanData.about = jikanData.about.replace(countryMatch, '');
    }
    return country;
}
