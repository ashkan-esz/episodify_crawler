export const CrawlerErrors = Object.freeze({
    crawler: {
        pauseLimit: (minute: number, info: string) => {
            return `Maximum duration for crawler pause exceeded (${minute}min) [${info}]`;
        },
        cancelled: 'Crawling cancelled : sourcesObj is null',
        cycleCancelled: 'Crawler cycle cancelled : sourcesObj is null',
        crawlerBadLink: (sourceName: string) => `Crawler generated badLink (${sourceName})`,
    },
    source: {
        badDownloadLinks: (source: string) => `Source (${source}): badDownloadLinks`,
        badPosters: (source: string) => `Source (${source}): badPosters`,
        badPersianSummary: (source: string) => `Source (${source}): badPersianSummary`,
        possibleVip: (source: string) => `Source (${source}): possible vip conversion`,
        fetch403: (sourceName: string) => `Source (${sourceName}): 403 Error (Fetch)`,
        disabled: (sourceName: string, err: string) =>
            `Source (${sourceName}): Disabled, reasons: ${err}`,
        disabledSkip: (sourceName: string) =>
            `source (${sourceName}) is disabled (crawler skipped).`,
        expireCookie: (sourceName: string) => `Source (${sourceName}) has expired cookie(s)`,
        expireCookieSkip: (sourceName: string) =>
            `source (${sourceName}) cookies expired (crawler skipped).`,
        lastPage: (sourceName: string, page: number | null) =>
            `Source (${sourceName}) lastPage: ${page}`,
        expireCookieSkip_domainChange: (sourceName: string) =>
            `source (${sourceName}) cookies expired (crawler skipped --domainChangeHandler).`,
        disabledSourceSkip_domainChange: (sourceName: string) =>
            `source (${sourceName}) is disabled (crawler skipped --domainChangeHandler).`,
        notWorking: (sourceName: string) => `Source (${sourceName}) url not working`,
        domainChange: (sourceName: string, url: string) =>
            `Source (${sourceName}) domain changed to (${url})`,
    },
    remoteBrowser: {
        notWorking: (url: string) => `Remote Browser not working: ${url}`,
        timeoutError: (url: string) => `Remote Browser timeout error (50s/70s): ${url}`,
    },
    api: {
        omdb: {
            invalid: (d1: string, d2: string) => `Invalid omdb api key: ${d1}, (${d2})`,
            moreApiKeyNeeded: 'More omdb api keys are needed',
            eaiError: 'EAI_AGAIN error on omdb api call',
        },
        tvmaze: {
            lotsOfApiCall: "lots of tvmaze api call",
        },
        jikan: {
            lotsOfApiCall: "lots of jikan api call",
            eaiError: 'EAI_AGAIN error on jikan api call',
        },
        kitsu: {
            lotsOfApiCall: "lots of kitsu api call",
        },
        amv: {
            lotsOfApiCall: "lots of amv api call",
            eaiError: 'EAI_AGAIN error on amv api call',
        },
    },
    fetch: {
        timeoutError: (time: string, sourceName: string) =>
            `Fetch timeout error (${time}): ${sourceName}`,
        abortError: (sourceName: string) => `Fetch aborted error: ${sourceName}`,
        eaiError: (sourceName: string) => `Fetch EAI_AGAIN error: ${sourceName}`,
    },
    operations: {
        imageHighWait: (seconds: number) => `High wait for image operation to start (${seconds})`,
        trailerUploadHighWait: (seconds: number) =>
            `High wait for trailer upload to start (${seconds})`,
    },
});

export const linkStateMessages = Object.freeze({
    start: 'start',
    paused: 'paused',
    sourcePage: Object.freeze({
        start: 'start',
        fetchingStart: 'fetching start',
        fetchingStart_fetch: 'fetching start (fetch)',
        retryFetchCookie: 'fetching, retry with fetch and cookies',
        retryOnNotFound: 'fetching, retry with not found error',
        retryUnEscapedCharacters: 'fetching, retry on unEscaped characters url',
        fromCache: 'fetching page data from google cache',
        fetchingEnd: 'fetching end',
    }),
    gettingPageData: Object.freeze({
        gettingPageData: 'getting page data',
        gettingPageData_fetch: 'getting page data (fetch)',
        retryFetchCookie: 'getting page data, retry with fetch and cookies',
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
        retryFetch: 'checking sources urls (retry with fetch)',
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
