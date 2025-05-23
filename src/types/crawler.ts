export type CrawlerExtraConfigs = {
    returnAfterExtraction: boolean;
    retryCounter: number;
    equalTitlesOnly: boolean;
    returnTitlesOnly: boolean;
};

export enum PageType {
    MainPage = 'MainPage',

}

export enum PageState {
    Fetching_Start = 'fetching_start',
    Fetching_End = 'fetching_end',
    // retryOnNotFound = 'retryOnNotFound',
    // retryUnEscapedCharacters = 'retryUnEscapedCharacters',
    // fromCache = 'fromCache',
}

export enum CrawlerPauseReason {
    OK = '',
    Manual_PAUSE = 'Manual_PAUSE',
    HIGH_MEMORY_USAGE = 'HIGH_MEMORY_USAGE',
    HIGH_CPU_USAGE = 'HIGH_CPU_USAGE',
}
