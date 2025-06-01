import { JapanPref, JapanRegion, prefs, regs } from './data.js';

//copied from https://www.npmjs.com/package/jp-prefectures and https://www.npmjs.com/package/jp-prefecture
//copied due to node import error:
//  Warning: To load an ES module, set "type": "module" in the package.json or use the .mjs extension.
//  import prefs from "../data/prefectures.json";

export function findByName(value: string): JapanPref | null {
    return prefs.find((pref) => pref.name === value) || null;
}

export function findByCode(value: string | number): JapanPref | null  {
    return prefs.find((pref) => pref.code === Number(value)) || null;
}

export function filterByArea(value: string): JapanPref[] {
    return prefs.filter((pref) => pref.area === value);
}

export function prefectures(): JapanPref[] {
    return prefs;
}

export function regions(): JapanRegion[] {
    return regs;
}

export function prefectureCodes(): number[] {
    return prefs.map((pref) => pref.code);
}

export function prefectureNames(): string[] {
    return prefs.map((pref) => pref.name);
}

export function prefectureEnNames(): string[] {
    return prefs.map((pref) => pref.enName);
}

export function regionsEnNames(): string[] {
    return regs.map((pref) => pref.en);
}

export function prefectureAreas(): string[] {
    const onlyUnique = (value: any, index: number, self: any) => {
        return self.indexOf(value) === index;
    };
    const areas = prefs.map((pref) => pref.area);
    return areas.filter(onlyUnique);
}

export function prefectureCapitals(): string[] {
    return prefs.map((pref) => pref.capital);
}
