export interface MediaProvider {
    name: string;
    baseUrl: string;

    getApiData(
        title: string,
        alternateTitles: string[],
        titleSynonyms: string[],
        id: string | number,
        premiered: string,
        type: MovieType,
        canRetry: boolean,
    ): Promise<any>;

    getApiFields(data: any, type: MovieType): any;

    callApi(url: string, timeoutSec?: number): Promise<any>;

    // checkTitle(
    //     data: any,
    //     title: string,
    //     alternateTitles: string[],
    //     titleSynonyms: string[],
    //     imdbID: string,
    //     premiered: string,
    //     titleYear: string,
    //     yearIgnored: boolean,
    //     type: MovieType,
    // ): boolean;

    normalizeText(title: string): string;
    getEditedTitle(title: string): string;
}

import type { MovieType } from '@/types';
import * as tvmaze from './tvmaze.provider';
import * as omdb from './omdb.provider';
import * as kitsu from './kitsu.provider';
import * as Jika from './jikan.provider';
import * as Youtube from './youtube.provider';
import * as StaffAndCharacter from './staffAndCharacter';
// export * as amv from './amv.provider';

const TVMaze = new tvmaze.TVMazeProvider();
const OMDB = new omdb.OMDBProvider();
const KITSU = new kitsu.KITSUProvider();
const Jikan = new Jika.JikanProvider();

export { TVMaze, OMDB, KITSU, Jikan, Youtube, StaffAndCharacter };
