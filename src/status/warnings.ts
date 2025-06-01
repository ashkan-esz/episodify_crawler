
export const CrawlerErrorMessages = Object.freeze({
    crawlerPauseLimit: (minute: number, info: string) => {
        return `Maximum duration for crawler pause exceeded (${minute}min) [${info}]`;
    },
    sourceStatus: {
        badDownloadLinks: (source: string) => `Source (${source}): badDownloadLinks`,
        badPosters: (source: string) => `Source (${source}): badPosters`,
        badPersianSummary: (source: string) => `Source (${source}): badPersianSummary`,
        possibleVip: (source: string) => `Source (${source}): possible vip conversion`,
    },
    apiCalls: {
        omdb: {
            invalid: (d1: string, d2: string) => `Invalid omdb api key: ${d1}, (${d2})`,
            moreApiKeyNeeded: 'More omdb api keys are needed',
            eaiError: 'EAI_AGAIN error on omdb api call',
        },
        tvmaze: {
            lotsOfApiCall: `lots of tvmaze api call`,
        },
        jikan: {
            lotsOfApiCall: `lots of jikan api call`,
            eaiError: 'EAI_AGAIN error on jikan api call',
        },
        kitsu: {
            lotsOfApiCall: `lots of kitsu api call`,
        },
        amv: {
            lotsOfApiCall: `lots of amv api call`,
            eaiError: 'EAI_AGAIN error on amv api call',
        },
    },
});

export function getCrawlerWarningMessages(
    data1: string = '',
    data2: string = '',
): {
    expireCookie: string;
    expireCookieSkip: string;
    expireCookieSkip_domainChange: string;
    disabledSource: string;
    disabledSourceSkip: string;
    disabledSourceSkip_domainChange: string;
    notWorking: string;
    domainChange: string;
    crawlerPauseLimit: string;
    apiCalls: {
        omdb: { invalid: string; moreApiKeyNeeded: string; eaiError: string };
        tvmaze: { lotsOfApiCall: string };
        jikan: { lotsOfApiCall: string; eaiError: string };
        kitsu: { lotsOfApiCall: string };
        amv: { lotsOfApiCall: string; eaiError: string };
    };
    trailerUploadHighWait: string;
    imageOperationsHighWait: string;
    remoteBrowserNotWorking: string;
    remoteBrowserTimeoutError: string;
    crawlerCancelled: string;
    crawlerCycleCancelled: string;
    axiosTimeoutError: string;
    axiosAbortError: string;
    axiosEaiError: string;
    crawlerBadLink: string;
    sourceLastPage: string;
    sourceDisabled: string;
    sourceErrors: { axios403: string };
} {
    //TODO : remove or refactor
    return {
        expireCookie: `Source (${data1}) has expired cookie(s)`,
        expireCookieSkip: `source (${data1}) cookies expired (crawler skipped).`,
        expireCookieSkip_domainChange: `source (${data1}) cookies expired (crawler skipped --domainChangeHandler).`,
        disabledSource: `source (${data1}) is disabled.`,
        disabledSourceSkip: `source (${data1}) is disabled (crawler skipped).`,
        disabledSourceSkip_domainChange: `source (${data1}) is disabled (crawler skipped --domainChangeHandler).`,
        notWorking: `Source (${data1}) url not working`,
        domainChange: `Source (${data1}) domain changed to (${data2})`,

        crawlerPauseLimit: `Maximum allowed duration for crawler pause exceeded (${data1}min) (crawler need more resource)`,
        apiCalls: {
            omdb: {
                invalid: `Invalid omdb api key: ${data1}, (${data2})`,
                moreApiKeyNeeded: 'More omdb api keys are needed',
                eaiError: 'EAI_AGAIN error on omdb api call',
            },
            tvmaze: {
                lotsOfApiCall: `lots of tvmaze api call`,
            },
            jikan: {
                lotsOfApiCall: `lots of jikan api call`,
                eaiError: 'EAI_AGAIN error on jikan api call',
            },
            kitsu: {
                lotsOfApiCall: `lots of kitsu api call`,
            },
            amv: {
                lotsOfApiCall: `lots of amv api call`,
                eaiError: 'EAI_AGAIN error on amv api call',
            },
        },
        trailerUploadHighWait: `High wait for trailer upload to start (${data1})`,
        imageOperationsHighWait: `High wait for image operation to start (${data1})`,
        remoteBrowserNotWorking: `Remote Browser not working: ${data1}`,
        remoteBrowserTimeoutError: `Remote Browser timeout error (50s/70s): ${data1}`,
        crawlerCancelled: 'Crawling cancelled : sourcesObj is null',
        crawlerCycleCancelled: 'Crawler cycle cancelled : sourcesObj is null',
        axiosTimeoutError: `Axios timeout error (${data1}): ${data2}`,
        axiosAbortError: `Axios aborted error: ${data1}`,
        axiosEaiError: `Axios EAI_AGAIN error: ${data1}`,
        crawlerBadLink: `Crawler generated badLink (${data1})`,
        sourceLastPage: `Source (${data1}) lastPage: ${data2}`,
        sourceDisabled: `Source (${data1}): Disabled, reasons: ${data2}`,
        sourceErrors: {
            axios403: `Source (${data1}): 403 Error (Axios)`,
        },
    };
}

export const linkStateMessages = Object.freeze({
    start: 'start',
    paused: 'paused',
    sourcePage: Object.freeze({
        start: 'start',
        fetchingStart: 'fetching start',
        fetchingStart_axios: 'fetching start (axios)',
        retryAxiosCookie: 'fetching, retry with axios and cookies',
        retryOnNotFound: 'fetching, retry with not found error',
        retryUnEscapedCharacters: 'fetching, retry on unEscaped characters url',
        fromCache: 'fetching page data from google cache',
        fetchingEnd: 'fetching end',
    }),
    gettingPageData: Object.freeze({
        gettingPageData: 'getting page data',
        gettingPageData_axios: 'getting page data (axios)',
        retryAxiosCookie: 'getting page data, retry with axios and cookies',
        retryOnNotFound: 'getting page data, retry with not found error',
        retryUnEscapedCharacters: 'getting page data, retry on unEscaped characters url',
        fromCache: 'getting page data from google cache',
    }),
    addFileSize: 'adding file size to downloadLinks info',
    checkingDB: 'checking db',
    newTitle: Object.freeze({
        newTitle: 'new title',
        inserting: 'new title: inserting',
        addingCast: 'new title: adding cast and characters',
        uploadingPosterToS3: 'new title: uploading poster to s3',
        uploadingJikanPosterToS3: 'new title: uploading jikan poster to s3',
        uploadingKitsuPosterToS3: 'new title: uploading kitsu poster to s3',
        uploadingAmvPosterToS3: 'new title: uploading amv poster to s3',
        uploadingKitsuWidePosterToS3: 'new title: uploading kitsu wide poster to s3',
        uploadingAmvWidePosterToS3: 'new title: uploading amv wide poster to s3',
        uploadingTvmazePosterToS3: 'new title: uploading tvmaze poster to s3',
        uploadingOmdbPosterToS3: 'new title: uploading omdb poster to s3',
        uploadingTvmazeWidePosterToS3: 'new title: uploading tvmaze wide poster to s3',
        generatingThumbnail: 'new title: generating thumbnail',
        callingOmdbTvMazeKitsuAmv: 'new title: calling omdb/tvmaze/kitsu/amv apis',
        handlingSeasonFields: 'new title: handling seasons fields',
        callingJikan: 'new title: calling jikan api',
        uploadingYoutubeTrailerToS3: 'new title: uploading youtube trailer to s3',
        addingRelatedTitles: 'new title: adding related titles',
    }),
    updateTitle: Object.freeze({
        updateTitle: 'update title',
        convertingToRelease: 'update title: converting unreleased to released',
        addingCast: 'update title: adding cast and characters',
        removingS3Trailer: 'update title: removing s3 trailer',
        updating: 'update title: updating',
        checkingPoster: 'update title: checking poster',
        uploadingPosterToS3: 'update title: uploading poster to s3',
        uploadingJikanPosterToS3: 'update title: uploading jikan poster to s3',
        uploadingKitsuPosterToS3: 'update title: uploading kitsu poster to s3',
        uploadingAmvPosterToS3: 'update title: uploading amv poster to s3',
        uploadingKitsuWidePosterToS3: 'update title: uploading kitsu wide poster to s3',
        uploadingAmvWidePosterToS3: 'update title: uploading amv wide poster to s3',
        uploadingTvmazePosterToS3: 'update title: uploading tvmaze poster to s3',
        uploadingOmdbPosterToS3: 'update title: uploading omdb poster to s3',
        uploadingTvmazeWidePosterToS3: 'update title: uploading tvmaze wide poster to s3',
        callingOmdbTvMazeKitsuAmv: 'update title: calling omdb/tvmaze/kitsu/amv apis',
        handlingSeasonFields: 'update title: handling seasons fields',
        callingJikan: 'update title: calling jikan api',
        uploadingYoutubeTrailerToS3: 'update title: uploading youtube trailer to s3',
        addingRelatedTitles: 'update title: adding related titles',
        addingMoviePosterBlurHashQueue: 'update title: adding moviePoster to blurHashQueue',
        addingMoviePosterS3BlurHashQueue: 'update title: adding moviePosterS3 to blurHashQueue',
        addingMovieWidePosterS3BlurHashQueue:
            'update title: adding movieWidePosterS3 to blurHashQueue',
    }),
    domainChangeHandler: Object.freeze({
        start: 'start',
        checkingUrls: 'checking sources urls',
        retryAxios: 'checking sources urls (retry with axios)',
        crawlingSources: 'crawling sources',
        end: 'end',
    }),
    notification: Object.freeze({
        start: 'start handling movie notification',
        finishedListSpinOffSequel: 'notification: finishedListSpinOffSequel',
        futureList: 'notification: futureList',
        futureListSerialSeasonEnd: 'notification: futureListSerialSeasonEnd',
        followingMovie: 'notification: followingMovie',
        followMovieBetterQuality: 'notification: followMovieBetterQuality',
        followMovieSubtitle: 'notification: followMovieSubtitle',
        futureListSubtitle: 'notification: futureListSubtitle',
    }),
});
