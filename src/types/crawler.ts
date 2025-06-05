export type CrawlerExtraConfigs = {
    returnAfterExtraction: boolean;
    retryCounter: number;
    equalTitlesOnly: boolean;
    returnTitlesOnly: boolean;
    castUpdateState: ExtraConfigsSwitchState;
    apiUpdateState: ExtraConfigsSwitchState;
    trailerUploadState: ExtraConfigsSwitchState;
    axiosBlockThreshHold: number;
    crawlerConcurrency: number;
    dontUseRemoteBrowser: boolean;
};

export enum ExtraConfigsSwitchState {
    NONE = 'none',
    IGNORE = 'ignore',
    FORCE = 'force',
}

export enum PageType {
    MainPage = 'MainPage',
    // ListPage = 'ListPage',
    MovieDataPage = 'MovieDataPage',
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
