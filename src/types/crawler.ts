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
