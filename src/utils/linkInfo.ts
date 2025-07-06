import type { DownloadLink } from '@/types';
import {checkDubbed, checkHardSub} from "./crawler";

//----------------------------------------

export const releaseRegex = /WEB-DL|WEB-RIP|BluRay|HDTV|HD-RIP|HDTS|HDTC|BR-RIP|BD-RIP|DVDRip|DVDScr|WEBSCR|Mobile|CAMRip|HD-CAM/;
export const releaseRegex2 = /WEBa?-?DL|WEB-?RIP|BluRa?y|B-lu-Ry|HDTV|HD-?RIP|HDTS|HDTC|BR-?RIP|BD-?RIP|P?DVDRip|DVDScr|WEBSCR|CAMRip|HD-CAM/i;

export const encodersRegex = new RegExp([
    /SupermanPeacemakerWalterWhite|DeviousZirconGrebeOfDiscourse|LessConfusingThanTenet|DontTakeCandyFromStrangers|IMABARBiEGiRL/,
    /|AccomplishedYak/,
    /|B2HD|DigiM(ov|vo)iez|AvaMovie|SalamDL|DigiDigimoviezmoviez|DigimDigimoviezoviez|Film2media|DonyayeSerial/, // source_name
    /|Luvmichelle|DeeJayAhmed|IchiMaruGin|FreetheFish|GetSchwifty/, // 11
    /|REMARKABLE|TNTVillage|Provenance|Providence|Improbable|Budgetbits|LiBRARiANS|LowFatMilk|KatmovieHD/, // 10
    /|SUNSCREEN|associate|Frontline|EthanCunt|CfaMilyRG|bamboozle|dimension|Bollycine|COALiTiON|STRONTiUM/, // 9
    /|FraMeSToR|AN0NYM0US|PLUTONiUM/, // 9
    /|GalaxyR?G?|GalaxyTv|anoXmous|DEFiNiTE|Jalucian|LordVako|HighCode|Micromkv|KamiKaze|RiGHTNOW|CUPCAKES/, // 8
    /|Team-?x265|WebCakes|GOPISAHI|PECULATE|ALLiANCE|Garshasp|Nickarad|ANONA911|SADPANDA|Grashasp|SMAHAWUG/, // 8
    /|SPRiNTER|CiNEFiLE|ALTEREGO/, // 8
    /|LIMITED|ShAaNiG|Mkv?Cage|Mkvking|MkvHub|sujaidr|Silence|Worldmkv|AiRLiNE|HazMatt|FiDELiO|D3FiL3R|watcher/, // 7
    /|Mkvcage|AViATOR|SUJAIDR|BRSHNKV|HEVCBay|Slinece|Reaktor|UNRATED|TASTETV|killers|CRYPTIC|SYNCOPY|NOSiViD/, // 7
    /|MeGusta|IMMERSE|lucidtv|KILLERS|BORDURE|TIMECUT|DiAMOND|AnimeRG|TombDoc|Vyndros|Omikron|h3llg0d|imSamir/, // 7
    /|TeamMCU|SECRECY|HORiZON|AMIABLE|SECTOR7|CADAVER|Replica|DEFLATE|EPSiLON|SAPHiRE|Raphael|SiNNERS/, // 7
    /|Ganool|Rmteam|TrueHD|mottoj|LilKim|EVOLVE|Rudaki|GHOSTS|Kirion|LINETV|FRISK|SPARKS|orenji|Paso7[27]Y/, // 6
    /|(Tigo(le|el))|STRiFE|DRONES|monkee|titler|TuGAZx|GECKOS|HUZZAH|CtrlHD|PiGNUS|DEMAND|PSYCHD|TVSmash?/, // 6
    /|DTSJYK|RZeroX|t3nzin|Telugu|MeGUiL|Apekat|HDSTAr|InSaNe|RUSTED|Felony|REWARD|KEWPiE|ROVERS|PoOlLa/, // 6
    /|CROOKS|C1NEM4|SHeRiF/, // 6
    /|Hon3y|HDETG|Ozlem|NitRo|DZ0N3|Judas|AMRAP|SiGMA|Scorp|muhHD|vsenc|SaNiG|MZABI|TEPES|Aries|afm7[23]/, // 5
    /|MovCr|ACOOL|NoGRP|TayTO|MTeam|ALiGN|FLEET|SEEZN|SMURF|TVING|Stamo|Panda|ION10|XEBEC|LiHDL|FLAME/, // 5
    /|AvoHD|Tommy|Cakes|MkHub|Atmos|SCENI|NAISU|Tomdoc|POIASD|SUECOS|SARTRE|EDITH|ETHEL|SAMPA|Natty/, // 5
    /|GSFTX|RONIN|Bandi|Pav69|BRISK|CZ530|Telly|ViZNU|DREDD|ESubs|Lover|iExTv|PRiME|CRiSC|YOL0W|Rapta/, // 5
    /|HAiKU|GETiT|TiTAN|SKGTV/, // 5
    /|RARBG?|Pahe|AMZN|Yi?f[IiYy]|HDTS|GCJM|BONE|Qman|NVEE|DEEP|r00t|HAMR|Cleo|LION|FLUX|WELP|AAA(UHD)?/, // 4
    /|LAMA|Gooz|WDYM|APEX|Loki|DSNY|RKHD|PAAI|Prof|WiKi|Kick|AdiT|ETRG|CMRG|BTRG|TURG|ISRA|LoRD|xRed|RCVR/, // 4
    /|RyRo|XpoZ|viki|kogi|CPNG|Minx|DSNP|KaKa|EGEN|ATVP|MRCS|Obey|PCOK|M[Hk]UB|KIMO?|YOGI|SH0W|GECK|NEZU/, // 4
    /|LAZY|BRMP|BLOW|VETO|QPEL|FiCO/, // 4
    /|Psa|YTS|EVO|QxR|RSG|GAZ|VXT|3dg|rDX|ELR|JYK|eSc|Joy|jbr|xTv|HdT|KRT|Btx|Ika|LLG|FGT|AME|RDH|ASW|BDP|NT[GB]/, // 3
    /|R?MT|GAN|AC3|w4f|d3g|DAA|TTL|NBY|AVS|LCK|T0M|z97|CHD|GDL|DDR|HDL|SVA|BTN|PTV|MRN|TFP|DON|HDH|VFX|Xlf|RBX|VIU/, // 3
    /|NFP|PMV|[RH]?TM|BAM|IFR|MAX|JiO|mSD|F2M/, // 3
    /|Ift|tbs|SNG|YST|HET|HDC|m2g|UNK|RKO?|TM[VK]|MHB|EXT|REM|DMV|BdC/, // 3
    /|HS|MW|IQ|IC|FC|NM|HV/, // 2
].map(item => item.source).join(''), "i");

export const globalEncodersRegex = new RegExp(`(?<![a-zA-Z\d\/])(${encodersRegex.source})`, 'gi');
// export const globalEncodersRegex = new RegExp(encodersRegex, 'gi');

export const linkInfoRegex = new RegExp([
    /^((\d\d\d\d?p)|(1080p\.FULL-HD)|(1440p\.2K)|(2160p\.4K)|(2160p\.UHD))/,
    /((\.x265)?(\.10bit)?(\.HDR(10)?)?(\.3D)?(\.HSBS)?(\.[876]CH)?)?/,
    /(\.Episode\(\d\d?\d?-\d\d?\d?\))?/,
    /(\.Episode\(\d\d?\.5\))?/,
    /((\.\d)?\.(((Christmas\.)?Special)|OVA|ONA|OAD|NCED|NCOP|Redial)(_\d)?)?/,
    /((\.Main-Ceremony)|(\.Red-Carpet)|((\.Summary)?\.Oscar(\.\d\d\d\d)?))?/,
    /(\.DIRECTORS-CUT)?/,
    /(\.ALT-UNIVERSE-CUT)?/,
    /(\.EXTRAS)?/,
    /(\.Theatrical)?/,
    /(\.EXTENDED)?/,
    /(\.REMUX)?/,
    /(\.REPACK)?/,
    /(\.Part_\d)?/,
    /(\.Chapter_\d)?/,
    /(\.Extra)?/,
    /(\.Encore-Edition)?/,
    /(\.IMAX)?/,
    /(\.REMASTERED)?/,
    /(\.Backstage)?/,
    /(\.Preview)?/,
    new RegExp(`(\\.(${releaseRegex.source}))?`), // --> /\.(releaseRegex)/
    new RegExp(`(\\.(${encodersRegex.source}))?`), // --> /(\.(encodersRegex))?/
    /(\.(Un)?Censored)?/,
    /(\.(HardSub(\(.+\))?(\.Dubbed)?|SoftSub(\(.+\))?(\.Dubbed(\(.+\))?)?|Dubbed(\(.+\))?))?/i,
    /(\.V2)?/,
    /((\.\d\d\d\d)?\.\d\d\.\d\d)?/,
    /(\.Round_\d+(\.Day_\d+(_\d+)?)?(\.(ReWatch|Preview))?)?/,
    /(\.\s\(whole season in one file\))?/,
    /(\.\s\(.+\))?/,
    /( - (\d\d?(\.\d\d?)?GB|\d\d\d?MB))?$/
].map(item => item.source).join(''), 'g');

const countries = [
    'St-Louis', 'Anaheim', 'Oakland', 'Glendale', 'San-Diego', 'Tampa', 'Arlington', 'Atlanta',
    'Daytona', 'Valenciana', 'Europa', 'Teruel', 'Aragon', 'Lenovo-San-Marino', 'Czech-Republic',
    'Jerez', 'Abu-Dhabi', 'Sakhir', 'Turkish', 'Eifel', 'Russian', 'Tuscan', 'Andalucia', 'Belgium',
    'Grand-Prix', 'British', 'Hungarian', 'Styria', 'Austrian', 'Azerbaijan', 'Emilia-Romagna', 'Monaco',
    'Spanish', 'Bahrain', 'Germany', 'Catalunya', 'Italy', 'France', 'Portugal', 'Doha', 'Gatar', 'Emilia-Romagna',
];
export const countriesRegex = new RegExp(`(480p|720p|1080p)(\\.FULL-HD)?(\\.Preview)?(\\.[1-5])?\\.(${countries.join('|')})`, 'i');

export const specialWords = new RegExp([
    /x265|10bit|3D|HDR10|HDR|HSBS/,
    /|HardSub|SoftSub|Dubbed|Sub|Censored/,
    /|FULL-HD|2K|4K|[876]CH/,
    /|DIRECTORS-CUT|ALT-UNIVERSE-CUT/,
    /|Main-Ceremony|Red-Carpet|Backstage/,
    /|EXTENDED|REMASTERED|Theatrical|REMUX|REPACK|Extra|IMAX|Encore-Edition/,
    /|Episode/,
    /|((Christmas\.)?Special)|OVA|ONA|OAD|NCED|NCOP|Redial/,
].map(item => item.source).join(''), 'g');

const episodeRangeRegex = /Episode\(\d\d?\d?-\d\d?\d?\)/;
const episodeRangeRegex2 = /Episode\(\d\d?\d?-\d\d?\d?\)/;
export const specialRegex = /(((Christmas\.)?Special)|OVA|ONA|OAD|NCED|NCOP|Redial)(_\d)?/;
const dubbedRegex = /Dubbed(\(.+\))?/;
const softSubRegex = /SoftSub(\(.+\))?/;
const hardSubRegex = /HardSub(\(.+\))?/;
const partRegex = /Part_\d/;
const chapterRegex = /Chapter_\d/;
const ceremonyRegex = /(Main-Ceremony)|(Red-Carpet)|(Oscar)/;
const orders = Object.freeze([
    'qualityRegex', 'full-hd', '2k', '4k', 'uhd',
    'x265', '10bit', 'hdr10', 'hdr',
    '3d', 'hsbs', '6ch', '7ch', '8ch',
    'episodeRangeRegex',
    'episodeRangeRegex2',
    'specialRegex',
    'ceremonyRegex',
    'directors-cut', 'alt-universe-cut',
    'extras', 'theatrical',
    'extended', 'remux', 'repack',
    'imax', 'remastered', 'Encore-Edition',
    'backstage',
    'partRegex',
    'chapterRegex',
    'releaseRegex',
    'encodersRegex',
    'uncensored', 'censored',
    'softsub', 'hardsub',
    'softSubRegex', 'hardSubRegex',
    'v2',
    'dubbed', 'dubbedRegex',
    ' (whole season in one file)',
]);

const ordersIndex = Object.freeze({
    releaseRegex: orders.indexOf('releaseRegex'),
    encodersRegex: orders.indexOf('encodersRegex'),
    episodeRangeRegex: orders.indexOf('episodeRangeRegex'),
    episodeRangeRegex2: orders.indexOf('episodeRangeRegex2'),
    specialRegex: orders.indexOf('specialRegex'),
    dubbedRegex: orders.indexOf('dubbedRegex'),
    softSubRegex: orders.indexOf('softSubRegex'),
    hardSubRegex: orders.indexOf('hardSubRegex'),
    partRegex: orders.indexOf('partRegex'),
    chapterRegex: orders.indexOf('chapterRegex'),
    ceremonyRegex: orders.indexOf('ceremonyRegex'),
});

const findSpecialRegex = /(?<=\.)(Special|OVA|ONA|OAD|NCED|NCOP|Redial)(?=(\.?e?\d))/gi;
const findSpecialRegex2 = /(?<=%20)(Special|OVA|ONA|OAD|NCED|NCOP|Redial)(?=\.)/gi;

//-------------------------------------------------------
//-------------------------------------------------------
//-------------------------------------------------------

export function purgeQualityText(qualityText: string): string {
    return qualityText
        // eslint-disable-next-line no-irregular-whitespace
        .replace(/[ ;]/g, ' ')
        .replace(/\s\s+/g, ' ')
        .replace('دانلود', '')
        .replace('فیلم', '')
        .replace('کیفیت', '')
        .replace('انتخاب', '')
        .replace('کیفیت', '')
        .replace('كيفيت', '') //its not duplicate
        .replace(/نسخه \d ساعته/, '')
        .replace('نسخه', '')
        .replace('سخه', '')
        .replace('کم حجم', '')
        .replace('حجم بالا', '')
        .replace('اختصاصی', '')
        .replace('گلچین', '')
        .replace('دوبله', '')
        .replace('سه زبانه', '')
        .replace('زیرنویس', '')
        .replace('فارسی', '')
        .replace(/فا.رسی/, '')
        .replace('فاربسی', '')
        .replace('چسبیده', '')
        .replace('هاردساب', '')
        .replace('سافت ساب', '')
        .replace('پخش آنلاین', '')
        .replace('بدون سانسور', '')
        .replace('سانسور شده', 'Censored')
        .replace('بدون', '')
        .replace('دوزبانه', '')
        .replace('دو زبانه', '')
        .replace('زبان اصلی', '')
        .replace('لينک مستقيم', '')
        .replace('لینک مستقیم', '') //its not duplicate
        .replace('لینک مستقم', '')
        .replace('لینک مستق', '')
        .replace('یم', '')
        .replace(/قسمت \d\d?\d?((\s*([و٫]|تا)\s*)?\d?\d?\d?)+/, '')
        .replace(/قسمت ها \d+/g, '')
        .replace(/\d+ دقیقه/g, '')
        .replace('قسمت', '')
        .replace('فرمت', '')
        .replace('دالبی', '')
        .replace('دیجیتال', '')
        .replace('ریلیز', '')
        .replace('سه بعدی', '3D')
        .replace('سه بعدي', '3D') //its not duplicate
        .replace('پشت صحنه', 'Backstage')
        .replace('بازنگری', 'ReWatch')
        .replace('پریویو شو', 'Preview')
        .replace('روز', 'Day')
        .replace('اس‌پی‌یک', 'Special_1')
        .replace('اس‌پی', 'Special_')
        .replace('ویژه', 'Special')
        .replace('ان‌سی‌ئی‌دی', 'NCED')
        .replace('ان‌سی‌اُ‌پی', 'NCOP')
        .replace('ان‌سی‌اُپی', 'NCOP')
        .replace('اووی‌ای', 'OVA')
        .replace('پارت ', 'Part ')
        .replace('مراسم اسکار', 'Oscar')
        .replace('اسکار', 'Oscar')
        .replace('خلاصه', 'Summary')
        .replace('مراسم افتتاحیه بازی های المپیک', '')
        .replace('مراسم اختتامیه بازی های المپیک', '')
        .replace('مگابایت', 'MB')
        .replace('بالا', '')
        .replace(/(اول)|(دوم)|(سوم)/, '')
        .replace(/در|با|و/g, '')
        .replace(/[)(:|«»\-_=\/]|\.H264|\sHQ/gi, '')
        .replace('مراسم اصلی', 'Main-Ceremony')
        .replace('مراسم فرش قرمز', 'Red-Carpet')
        .replace(/\.(DDP?|AAC)?\d\.\d(\.H)?(\.264)?(?!((\d\d\d?p)|(ch)))/i, '')
        .replace(/bluray/gi, 'BluRay')
        .replace(/weba?[-_]*[dl](l|$)/gi, 'WEB-DL')
        .replace(/weba?[-_]*[dl]\s/gi, 'WEB-DL ')
        .replace(/web[.\-]*rip/gi, 'WEB-RIP')
        .replace(/BR(-)?RIP/gi, 'BR-RIP')
        .replace(/BD(-)?RIP/gi, 'BD-RIP')
        .replace(/DvdRip/gi, 'DVDRip')
        .replace(/hdrip/gi, 'HD-RIP')
        .replace(/hk-?rip/gi, 'HD-RIP')
        .replace(/hdtv/gi, 'HDTV')
        .replace(/full?[\s.]hd/gi, 'FULL-HD')
        .replace(/(?<=(\s|\.|^))fhd/i, 'FULL-HD')
        .replace(/HD-?CAM/gi, 'HD-CAM')
        .replace(/ 4k /g, ' 4K ')
        .replace(/ Extended(\scut)?/gi, ' EXTENDED')
        .replace(/\s(BrRio|AC3|PROPER)/, '')
        .replace(/\d\d\d\d?p & \d\d\d\d?p/, '')
        .replace(/\s\s+/g, ' ')
        .trim();
}

export function fixLinkInfo(info: string, linkHref: string, type:string):string {
    linkHref = linkHref.split('=')[0];

    const lowCaseLinkHref = linkHref.toLowerCase();
    info = fixLinkInfoResolution(lowCaseLinkHref, info);

    info = info
        .replace(/(^|\.)x256\./, (res) => res.replace('256', '265'))
        .replace(/\.(10bir|10bt|1bit)\./, '.10bit.')
        .replace('.x265p.', '.x265.')
        .replace('1080x264', '1080p')
        .replace('1080x265', '1080p.x265')
        .replace(/bl?ue?rayR?L?/i, 'BluRay')
        .replace(/WEB-?DLR/i, 'WEB-DL')
        .replace(/WEB\.DL/gi, 'WEB-DL')
        .replace(/WEB\.?D(?!L)/i, 'WEB-DL')
        .replace(/hd-?rip/gi, 'HD-RIP')
        .replace('DL.WEB', 'WEB-DL')
        .replace(/FullHD/i, 'FULL-HD')
        .replace(/(Farsi\.Dub(bed)?)|(Dubbed\.Farsi)|(Dub\.fa)/i, 'Dubbed')
        .replace(/farsi\.sub(bed)?/g, 'HardSub');

    if (lowCaseLinkHref.includes('10bit')) {
        info += '.10bit';
    }
    if (lowCaseLinkHref.includes('x265') || lowCaseLinkHref.includes('.265.')) {
        info += '.x265';
    }
    if (lowCaseLinkHref.includes('.3D.')) {
        info += '.3D';
    }
    if (lowCaseLinkHref.includes('.6ch.')) {
        info += '.6CH';
    }
    if (lowCaseLinkHref.includes('.7ch.')) {
        info += '.7CH';
    }
    if (lowCaseLinkHref.includes('.8ch.')) {
        info += '.8CH';
    }

    if (type.includes('movie')) {
        const moviePart = lowCaseLinkHref.replace(/%20/g, ' ').match(/part(\s|\.)*\d+/g)?.pop() || "";
        // @ts-expect-error ...
        if (moviePart && moviePart.match(/\d+/)[0].length < 3) {
            info += '.' + moviePart.replace('p', 'P').replace(/\s|\./, '_');
        }
        const chapter = lowCaseLinkHref.replace(/%20/g, ' ').match(/chapter(\s|\.)?\d+/g)?.pop() || "";
        // @ts-expect-error ...
        if (chapter && chapter.match(/\d+/)[0].length < 3) {
            info += '.' + chapter.replace('c', 'C').replace(/\s|\./, '_');
        }
    }

    info = addDubAndSub(lowCaseLinkHref, info);

    if (!releaseRegex2.test(info)) {
        const match = linkHref.replace(/%20|_|\./g, '-').match(releaseRegex2);
        if (match) {
            info += '.' + match[0]
                .replace(/b-?lu-?ra?y/i, 'BluRay')
                .replace(/weba?(-)?dl/i, 'WEB-DL')
                .replace(/web(-)?rip/i, 'WEB-RIP')
                .replace(/BR(-)?RIP/i, 'BR-RIP')
                .replace(/BD(-)?RIP/i, 'BD-RIP')
                .replace(/hd-?rip/i, 'HD-RIP')
                .replace(/P?DvdRip/i, 'DVDRip')
                .replace(/hdtv/i, 'HDTV');
        } else if (/\.WEB(-HD)?\./i.test(linkHref)) {
            info += '.WEB-DL';
        }
    }

    // extract/add encoder
    if (!info.match(encodersRegex)) {
        let encoder: string[] | null = linkHref.match(globalEncodersRegex);
        if (encoder && encoder.length > 0) {
            if (encoder.length > 1) {
                encoder = encoder.filter(e => e.toLowerCase() !== "film2media");
            }
            info += "." + encoder.pop();
        }
    }

    info = handleMultiEpisode(linkHref, info);

    if (!findSpecialRegex.test(info)) {
        let ovaMatch = linkHref.match(findSpecialRegex) || linkHref.match(findSpecialRegex2);
        if (ovaMatch) {
            info += '.' + ovaMatch.pop();
        }
    }

    if (linkHref.match(/[._-]Uncen(sored)?[._-]/i)) {
        info += '.UnCensored';
    } else if (linkHref.match(/[._-]censored[._-]/i)) {
        info += '.Censored';
    }

    return info.replace(/\.$/, '');
}

function fixLinkInfoResolution(lowCaseLinkHref: string, info:string):string {
    info = info.replace(/(?<=(^\d+))P\./, 'p.');
    const temp = info.match(/\d{3,5}p/)?.[0] || '';
    if (
        temp && lowCaseLinkHref.match(/[.\s_[]\d\d\d\d?p?[.\s_\]]/) &&
        !lowCaseLinkHref.includes(temp) &&
        !lowCaseLinkHref.includes('.' + temp.replace('p', '') + '.')
    ) {
        if (temp === '1440p') {
            if (!lowCaseLinkHref.includes('2k')) {
                info = info.replace(temp + '.', '').replace(temp, '');
            }
        } else if (temp === '2160p') {
            if (!lowCaseLinkHref.includes('4k')) {
                info = info.replace(temp + '.', '').replace(temp, '');
            }
        } else {
            info = info.replace(temp + '.', '').replace(temp, '');
        }
    }

    if (!info.match(/\d\d\d\d?p/gi)) {
        const qualityMatch = lowCaseLinkHref.match(/[.\s_]\d{3,5}p[.\s_]/g);
        let resolution = '480p';
        if (qualityMatch) {
            resolution = qualityMatch.pop()?.replace(/[.\s_]/g, '') ?? '';
        } else {
            const qualityMatch2 = lowCaseLinkHref.match(/\[\d\d\d\d?p?]/g);
            if (qualityMatch2) {
                resolution = qualityMatch2.pop()?.replace(/[[\]]/g, '') ?? '';
            } else {
                const qualityMatch3 = lowCaseLinkHref.match(/([-_])\d\d\d\d?\.[a-z\d]{3}($|\?)/g);
                if (qualityMatch3) {
                    resolution = qualityMatch3.pop()?.match(/\d+/g)?.[0] ?? '';
                } else {
                    resolution = (info.includes('DVDRip') || lowCaseLinkHref.includes('dvdrip')) ? '576p' : '480p';
                }
            }
        }
        resolution = !resolution.toLowerCase().includes('p') ? resolution + 'p' : resolution;
        info = info ? resolution + '.' + info : resolution;
    }

    if (info.includes('480p') && !lowCaseLinkHref.match(/\d\d\d\d?p/) &&
        (info.includes('3D') || lowCaseLinkHref.includes('full.hd'))) {
        info = info.replace('480p', '1080p');
    }
    info = info.replace('540p', '576p');

    return info;
}

function handleMultiEpisode(linkHref: string, info: string): string {
    let multiEpisodeMatch = linkHref.match(/\.(s\d\d?)?e\d\d\d?(([-.])?(e\d\d\d?)+)+\./gi);
    if (!multiEpisodeMatch) {
        multiEpisodeMatch = linkHref.match(/E\d+-\d+\./gi);
        if (multiEpisodeMatch) {
            if (multiEpisodeMatch.length === 1) {
                multiEpisodeMatch[0] = multiEpisodeMatch[0]
                    .toLowerCase()
                    .replace('e', '')
                    .replace('-', '-e');
            } else {
                multiEpisodeMatch = null;
            }
        } else {
            multiEpisodeMatch = linkHref.match(/(?<=\.)S\d+E\d+-E\d+(?=\.)/gi);
            if (multiEpisodeMatch) {
                if (multiEpisodeMatch.length === 1) {
                    multiEpisodeMatch[0] = multiEpisodeMatch[0].replace(/s\d+e/i, '');
                } else {
                    multiEpisodeMatch = null;
                }
            }
        }
    }
    if (multiEpisodeMatch) {
        const temp = multiEpisodeMatch.pop()?.replace(/s\d\d?/i, '').replace(/(^\.e)|\.|-/gi, '').split(/e/i);
        if (temp) {
            const number1 = Number(temp[0]);
            const number2 = Number(temp.pop());
            if (number1 < number2) {
                info += `.Episode(${number1}-${number2})`;
            }
        }
    }
    return info;
}

export function addDubAndSub(lowCaseLinkHref: string, info: string):string {
    if (lowCaseLinkHref.includes('dual.audio.jpn.eng') || lowCaseLinkHref.includes('dual.eng-ja')) {
        info += '.Dubbed(japanese-english)';
        info = info.replace(/(\.Dual\.Audio)|(\.?Audio\.Dual)/i, '');
    } else if (lowCaseLinkHref.includes('dual.audio.hindi.english')) {
        info += '.Dubbed(hindi-english)';
        info = info.replace(/\.Dual\.Audio/i, '');
    } else if (lowCaseLinkHref.includes('farsi.sub')) {
        info += '.HardSub';
    } else if (checkDubbed(lowCaseLinkHref, info)) {
        info += '.Dubbed';
    }
    if (lowCaseLinkHref.includes('korsub')) {
        info += '.HardSub(korean)';
    } else {
        const subRegex = /s[ou]ft\.?s[ou]b|hards[ou]b/gi;
        const subMatch = info.match(subRegex) || lowCaseLinkHref.match(subRegex);
        if (subMatch) {
            //HardSob --> HardSub
            //SuftSub --> SoftSub
            info += ('.' + subMatch.pop()?.replace('uft', 'oft').replace('ob', 'ub').replace('.', '') || '');
        } else if (lowCaseLinkHref.includes('subsoft') || lowCaseLinkHref.includes('softsuv')) {
            info += '.SoftSub';
        } else if (checkHardSub(info) || checkHardSub(lowCaseLinkHref)) {
            info += '.HardSub';
        }
    }
    return info;
}

//-------------------------------------------------------
//-------------------------------------------------------
//-------------------------------------------------------

export function fixLinkInfoOrder(info: string): string {
    info = fixInfoWrongQualityResolution(info);
    info = fixInfoDubAndSub(info);
    info = getCleanLinkInfo(info);

    const splitInfo = info.split(/(Episode\(\d+\.5\))|\./).filter(item => item);
    const temp = splitInfo.sort((a, b) => {
        if (a.match(/\d\d\d\d?p/)) {
            return -1;
        }
        if (b.match(/\d\d\d\d?p/)) {
            return 1;
        }
        const index_a = getOrderIndex(a, splitInfo);
        const index_b = getOrderIndex(b, splitInfo);
        return index_a > index_b ? 1 : -1;
    });

    info = temp.join('.')
        .replace(/(?<!(1080p))\.FULL-HD/, '')
        .replace(/(?<!(2160p))\.4k/i, '')
        .replace(/(?<!(1440p))\.2k/i, '')
        .replace('1080p.FULL-HD.2K', '1080p.FULL-HD')
        .replace('FULL-HD.WEB-DL', 'WEB-DL')
        .replace('Digital.Extras.EXTRAS', 'EXTRAS');

    info = removeDuplicates(info);
    return info;
}

function getOrderIndex(input: string, splitInfo: any[]): number {
    let index = orders.indexOf(input.toLowerCase());
    if (index !== -1) {
        return index;
    }
    if (input.match(releaseRegex)) {
        index = ordersIndex.releaseRegex;
    } else if (input.match(encodersRegex)) {
        index = ordersIndex.encodersRegex;
    } else if (input.match(episodeRangeRegex)) {
        index = ordersIndex.episodeRangeRegex;
    } else if (input.match(episodeRangeRegex2)) {
        index = ordersIndex.episodeRangeRegex2;
    } else if (input.match(specialRegex)) {
        index = ordersIndex.specialRegex;
    } else if (input.match(dubbedRegex)) {
        index = ordersIndex.dubbedRegex;
    } else if (input.match(softSubRegex)) {
        index = ordersIndex.softSubRegex;
    } else if (input.match(hardSubRegex)) {
        index = ordersIndex.hardSubRegex;
    } else if (input.match(partRegex)) {
        index = ordersIndex.partRegex;
    } else if (input.match(chapterRegex)) {
        index = ordersIndex.chapterRegex;
    } else if (input.match(ceremonyRegex)) {
        index = ordersIndex.ceremonyRegex;
    } else {
        if (index === -1) {
            index = splitInfo.indexOf(input);
        }
    }
    return index;
}

function fixInfoWrongQualityResolution(info: string): string {
    return info
        .replace(/\d\d\d\d?P([.p]|$)/, (res) => res.toLowerCase().replace('pp', 'p'))
        .replace('20160p.', '2160p.')
        .replace(/^080p/, '1080p')
        .replace(/(100p|108p|10820p|10800p|1080pHQ)\./, '1080p.')
        .replace(/750p|7200p/, '720p')
        .replace(/^720p.\./, '720p.')
        .replace(/\.(1080|80p|720|72p|70?p?|20p|480|40p|48p|128|0p|04)(?=(\.|$))/, '')
        .replace(/\.720$/, '')
        .replace(/\.?\[\d\d\d\d?p?]/i, '')
        .replace(/\d\d\d\d?px26[45]/, (res) => res.replace('x264', '').replace('x265', ''))
        .replace(/(UHD\.)?4k/gi, '4K')
        .replace(/1080p\.(UHD|4k)/i, '1080p')
        .replace('WEB-DL.FULL-HD', 'WEB-DL')
        .replace(/(?<!(1080))p\.FULL-HD/, 'p');
}

function fixInfoDubAndSub(info: string): string {
    return info
        //dubbed
        .replace(/\.(DO?UBLE|Dobleh|(dubbed\.Sound))/i, '.Dubbed')
        .replace(/(?<!(\.|^))dubbed/i, '.Dubbed')
        .replace(/dubbed(\.fa)?\.dubbed/i, 'Dubbed')
        .replace(/((Sync(\.\d)?)|fa)\.dubbed/i, 'Dubbed')
        .replace(/\.FA(rsi)/i, '.Dubbed')
        .replace(/dubbed\d*(\.dubbed\d*)+/gi, 'Dubbed')
        .replace(/Dual\.Audio\.(SoftSub|dubbed)/i, 'Dubbed')
        .replace(/(Dual|Dubbed)\.Audio/i, 'Dubbed')
        .replace(/ENG\.Dub(bed)?/i, 'Dubbed(english)')
        .replace(/dubbed(\.HardSub)?\.dubbed(?=(\.|$))/i, 'Dubbed')
        .replace(/EXTENDEDFarsi(\.dubbed)?/i, 'EXTENDED.Dubbed')
        .replace(/BluRayFarsi/i, 'BluRay.Dubbed')
        //softSub
        .replace(/soft?sub/gi, 'SoftSub')
        .replace(/(?<!(\.|^))SoftSub/, '.SoftSub')
        .replace(/\.(SoftSu|Sof)\.SoftSub/i, '.SoftSub')
        .replace(/[-.]softsub/i, '.SoftSub')
        .replace(/\.((Soft\.Sub)|(Sub\.Soft))/i, '.SoftSub')
        .replace(/\.(SotSub|SoftSuv)/i, '.SoftSub')
        .replace(/Soft?Sub(\.SoftSub)+/gi, 'SoftSub')
        .replace(/\.NOT\.SUB(BED)?(\.SoftSub)?/i, '')
        .replace(/\.NOT\.SoftSubSub/i, '')
        //hardSub
        .replace(/hardsub?/gi, 'HardSub')
        .replace(/Hard?Sub(\.HardSub)+/gi, 'HardSub')
        .replace('.SoftSub.HardSub', '.SoftSub')
        .replace(/dubbed\.(SoftSub|Fixed|\d)\.dubbed/i, 'Dubbed')
        .replace('DUAL.SoftSub', 'SoftSub')
        .replace(/Fa\.(?=(Soft|Hard))/i, '');
}

function fixInfoCaseSensitiveWords(info: string): string {
    return info
        .replace(/remux/i, 'REMUX')
        .replace(/remastered/i, 'REMASTERED')
        .replace(/yify/gi, 'YIFY')
        .replace(/psa/gi, 'PSA')
        .replace(/tving/gi, 'TVING')
        .replace(/repack/i, 'REPACK');
}

export function getCleanLinkInfo(info: string): string {
    return info
        .replace(/\d\d\d\d٫\d\d٫\d\d/, (res) => res.replace(/٫/g, '.').split('.').reverse().join('.')) //case: 2020٫11٫19
        .replace(/\d\d٫\d\d٫\d\d\d\d/, (res) => res.replace(/٫/g, '.')) //case: 28٫09٫2020
        .replace(/^\d\d\d\d?p\.\d\d\d\d?p/, (res) => res.split('.')[0])
        .replace(/^\d\d\d\d?p\.\d+$/i, res => res.split('.')[0])
        .replace(/[ًًًٌٍَُِ]/g, '')
        .replace(/\.(nf|ir|(\[?ss]?)|g|h|ng|gm|hmax|ip|HULU|AAC|1ch|2ch|co|ma|60FPS|Bia2m|ITSat|DV|HC)(?=(\.|\[|$))/gi, '')
        .replace(/\.(\[(StartDL|(Anime\.?20Dubbing)|RubixFa)])/gi, '')
        .replace(/([.\-])Fixed/i, '')
        .replace(/(^Internal\.)|(\.INTERNAL)/i, '')
        .replace(/HEVCPSA/i, 'PSA')
        .replace(/(^|\.)(x254|x?\.?264|x\.?246)/gi, '')
        .replace(/x256|X265/g, 'x265')
        .replace('x 265', 'x265')
        .replace('.6C.', '.6CH.')
        .replace('6CHx264', '6CH')
        .replace(/10?B?itr?/i, '10bit')
        .replace('.HDR10Plus', '.HDR10')
        .replace(/\.10\.Bit/i, '.10bit')
        .replace(/\.(H264|HEVC|mkv|mka|mp4|uRay|WEB|Dolby|vision|x26|x65|x2256|265|P2P|DC|CM|AMZN|Ultra)(?=(\.|$))/gi, '')
        .replace(/Part([\s.])\d/g, (res) => res.replace(/[\s.]/, '_'))
        .replace(/Part\d/g, (res) => res.replace('Part', 'Part_'))
        .replace(/Special\d/, (res) => res.replace('Special', 'Special_'))
        .replace(/(Cut\.)?Alt[-.]?Universe([.-]Cut)?/i, 'ALT-UNIVERSE-CUT')
        .replace(/((Cut\.Directors?)|(DIRECTORS?\.CUT))(?=(\.|$))/i, 'DIRECTORS-CUT')
        .replace(/Encore\.Edition(?=(\.|$))/i, 'Encore-Edition')
        .replace(/\.unrated/i, '')
        .replace(/\.(MB|GB)[.\s]\d\d\d?\./, '.')
        .replace(/\.((\d\d\d?)|(\d\.\d\d?))[.\s](MB|GB)(?=(\.|$))/, '')
        .replace(/WEB?-?Rip?/i, 'WEB-RIP')
        .replace(/(?<!(Full))\.hd(?=(\.|$))/i, '')
        .replace(/^(hd|7|g)(\.|$)/i, '')
        .replace(/(LQ|HQ)?DVD-?Rip/i, 'DVDRip')
        .replace(/HD-?TV?(?=(\.|$))/i, 'HDTV')
        .replace(/(\.Full)?\.HD\.WEB-DL/i, '.WEB-DL')
        .replace('.BDRip.WEB-DL', '.WEB-DL')
        .replace('.RED.WEB-DL', '.WEB-DL')
        .replace(new RegExp(`(${releaseRegex.source})(?!(\\.|$))`), res => res + '.')
        .replace(/\d[.-]Part(?=(\.\d\d\d\d?p))/, (res) => res.split(/[.-]/).reverse().join('_'))
        .replace(/\.(2020|(Cut\.)?Exclusive)/gi, '')
        .replace(/\.I\.C(?=(\.|$))/i, '.IC')
        .replace(new RegExp(`I(${releaseRegex.source})\\.MAX`), (res) => res.replace('I', 'IMAX.').replace('.MAX', ''))
        .replace(new RegExp(`I\\d\\d\\d\\d?p\\.MAX`), (res) => res.replace('I', '').replace('MAX', 'IMAX'))
        .replace(new RegExp(`(${releaseRegex.source})\\d\\d\\d\\d?p`), (res) => res.replace(/\d\d\d\d?p/, (res2) => '.' + res2));
}

function removeDuplicates(info: string): string {
    const splitInfo = info.split('.');
    const result = splitInfo.slice(0, 2);
    for (let i = 2; i < splitInfo.length; i++) {
        if (splitInfo[i - 1] !== splitInfo[i]) {
            result.push(splitInfo[i]);
        }
    }
    info = result.join('.');
    return info
        .replace(new RegExp(`(${releaseRegex.source})\\.(${releaseRegex.source})`), res => res.split('.')[0])
        .replace(new RegExp(`(${encodersRegex.source})\\.(${encodersRegex.source})`), res => res.split('.')[0])
        .replace(new RegExp(`(${specialRegex.source})\\.(${specialRegex.source})`), res => res.split('.')[0]);
}

//-------------------------------------------------------
//-------------------------------------------------------
//-------------------------------------------------------

export function handleRedundantPartNumber(downloadLinks: DownloadLink[]): DownloadLink[] {
    if (downloadLinks.length === 0) {
        return [];
    }
    const part = downloadLinks[0].info.match(/\.Part_\d+/)?.[0];
    const chapter = downloadLinks[0].info.match(/\.Chapter_\d+/)?.[0];
    const special = downloadLinks[0].info.includes('.Special');
    if (part && downloadLinks.every(item => item.info.match(/\.Part_\d+/)?.[0] === part)) {
        for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
            downloadLinks[i].info = downloadLinks[i].info.replace(part, '');
        }
    } else if (chapter && downloadLinks.every(item => item.info.match(/\.Chapter_\d+/)?.[0] === chapter)) {
        for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
            downloadLinks[i].info = downloadLinks[i].info.replace(chapter, '');
        }
    } else if (special && downloadLinks.every(item => item.info.includes('.Special'))) {
        for (let i = 0, _length = downloadLinks.length; i < _length; i++) {
            downloadLinks[i].info = downloadLinks[i].info.replace('.Special', '');
        }
    }
    return downloadLinks;
}

export function filterLowResDownloadLinks(downloadLinks: DownloadLink[]): DownloadLink[] {
    return downloadLinks.filter(item => !item.info.startsWith('240p') && !item.info.startsWith('360p'));
}

//-------------------------------------------------------
//-------------------------------------------------------
//-------------------------------------------------------

export function purgeSizeText(sizeText: string): string {
    if (sizeText === '') {
        return '';
    }
    let result = sizeText
        .trim()
        .replace(/[ۀإ]/g, '')
        .replace(/\//g, '.')
        .replace('میانگین حجم', '')
        .replace('حجم: نامشخص', '')
        .replace('حجم', '')
        .replace('میانگین', '')
        .replace('فایل', '')
        .replace('گیگابایت', 'GB')
        .replace('گیکابایت', 'GB')
        .replace('گیگا بایت', 'GB')
        .replace('گیگابیت', 'GB')
        .replace('گیابایت', 'GB')
        .replace('گیگابات', 'GB')
        .replace('گیگابابایت', 'GB')
        .replace('گیگ', 'GB')
        .replace('گمابایت', 'MB')
        .replace('مگابایت', 'MB')
        .replace('مگابابت', 'MB')
        .replace('مکگابایت', 'MB')
        .replace('مگاابایت', 'MB')
        .replace('مگا بایت', 'MB')
        .replace('مگایایت', 'MB')
        .replace('bytes', 'b')
        .replace('انکودر', '')
        .replace(/[\s:,]/g, '')
        .replace(/\(ورژن\d\)/g, '') // (ورژن1)
        .replace(/\(جدید\)/g, '') // (جدید)
        .replace('ئذ', '')
        .replace(/bytes|kb|720p/gi, '')
        .replace(/^\d(\.\d)?(BG|G8|GHB)$/i, (res) => res.replace(/(BG|G8|GHB)/i, 'GB'))
        .replace(/\.([mg])/i, (res) => res.replace('.', ''))
        .replace(/g$/i, 'gb')
        .replace(/(GBB|GBGB|HB)$/i, 'GB')
        .replace(/(BMB)$/i, 'MB')
        .replace(/(?<=\d)[MB]$/i, 'MB') // 150M, 150B
        .replace(/MM$/i, 'MB')
        .toUpperCase();

    if (result.match(/(mb|gb)\d+/gi)) {
        result = result.slice(2) + result.slice(0, 2);
    }
    if (result && !result.match(/mb|gb/gi)) {
        const temp = result.match(/^\d(\.\d+)?$/g) ? 'GB' : 'MB';
        result += temp;
    }
    if (result.match(/^\d\d+\.\d+MB$/g)) {
        result = result.split('.')[0] + 'MB';
    }
    if (result.match(/\d\d\d\dMB/)) {
        const size = result.split('M')[0];
        const newSize = (Number(size) / 1024).toFixed(2);
        result = newSize + 'GB';
    }
    if (result.match(/^\d(\.\d\d?)?MB$/)) {
        result = result.replace('MB', 'GB');
    }
    if (result.match(/^\d\d\d(\.?\d)?GB$/)) {
        result = result.replace(/\.\d/, '').replace('GB', 'MB');
        if (result.match(/\d\d\d\dMB/)) {
            const size = result.split('M')[0];
            const newSize = (Number(size) / 1024).toFixed(2);
            result = newSize + 'GB';
        }
    }
    if (result.match(/^((mkv(cage)?mb|mb|gb)|(0(mb|gb)))$/i) || result === '1MB') {
        return '';
    }
    if (result.match(new RegExp(`(${encodersRegex.source})(MB|GB)`, 'i'))) {
        return '';
    }
    result = result
        .replace(/\d\.\d\d\d?\.\d+GB/, (res) => res.replace(/\.\d+GB/, 'GB'))
        .replace(/\d\.\d\d\dGB/, (res) => res.replace(/\dGB/, 'GB'))
        .replace(/t/i, '');
    return result;
}

export function purgeEncoderText(encoderText: string): string {
    return encoderText
        .replace('انتخاب انکودر', '')
        .replace('انکودر', '')
        .replace('انکدر', '')
        .replace('انکود', '')
        .replace('موسسه', '')
        .replace('لینک های دانلود با زیرنویس فارسی چسبیده', '')
        .replace(/[ًًًَ]/g, '')
        // eslint-disable-next-line no-irregular-whitespace
        .replace(/encoder|Unknown|Unkown|Unjnown|Unlnown|:|-|‌| /gi, '')
        .replace(/mkvcage/gi, 'MkvCage')
        .replace(/mkvhub/gi, 'MkvHub')
        .replace(/shaanig/gi, 'ShAaNiG')
        .replace(/yts(\.(mx|ag))?/gi, 'YTS')
        .replace(/(MB)?Pahe/gi, 'PaHe')
        .replace(/xtv/gi, 'xTv')
        .replace(/n[il]tro/gi, 'NitRo')
        .replace(/yify/gi, 'YIFY')
        .replace(/yifi/gi, 'YIFI')
        .replace(/WEB-?DL/gi, 'WEB-DL')
        .replace(/Gal(ax|xa|ag)y[\sRG]*(TV)?/i, 'GalaxyRG')
        .replace('Galaxy.TV', 'GalaxyTv')
        .replace(/sparks/i, 'SPARKS')
        .replace('af,72', 'afm72')
        .replace(/playWEB|HEVC(?!Bay)\s*|AAC5\s*1\s*/i, '')
        .trim();
}
