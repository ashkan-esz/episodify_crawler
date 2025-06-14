import * as dynamicConfig from '@/config/dynamicConfig';
import { Jikan } from '@/providers';
import { StaffAndCharacter } from '@/providers';
import { CrawlerRepo, ServerAnalysisRepo } from '@/repo';
import {
    changePageLinkStateFromCrawlerStatus,
    checkForceStopCrawler,
    removePageLinkToCrawlerStatus,
} from '@/status/status';
import { CrawlerErrors, linkStateMessages } from '@/status/warnings';
import { S3Storage } from '@/storage';
import {
    CrawlerExtraConfigs,
    DownloadLink,
    MovieType,
    SourceConfig,
    SourceExtractedData,
    SourceVpnStatus,
    VPNStatus,
} from '@/types';
import { getMovieModel, Movie, MovieReleaseState, TitleObj } from '@/types/movie';
import { GroupedSubtitle } from '@/types/subtitle';
import { LinkUtils } from '@/utils';
import { saveError } from '@/utils/logger';
import {
    DefaultTorrentDownloaderConfig,
    TorrentDownloaderStatus,
    TorrentDownloaderDisabledState,
} from '@config/dynamicConfig';
import { handleLatestDataUpdate } from '@services/crawler/latestData';
import { checkNeedTrailerUpload, handleSubUpdates } from '@services/crawler/posterAndTrailer';
import { addApiData, apiDataUpdate } from '@services/crawler/providersManager';
import {
    getSeasonEpisode,
    getTotalDuration,
    handleSiteSeasonEpisodeUpdate,
} from '@services/crawler/seasonAndEpisode';
import { torrentSourcesNames } from '@services/crawler/sourcesArray';
import { getFileSize } from '@utils/axios';
import {
    convertTypeToAnime,
    getDatesBetween,
    removeAnimeFromType,
    removeDuplicateElements,
} from '@utils/crawler';
import { titlesAndYears } from '@utils/titlesList';
import PQueue from 'p-queue';
import { handleSubtitlesUpdate } from './subtitle';
import { getLinksDoesntMatchLinkRegex } from '@/extractors/downloadLinks';
import { checkCrawledDataForChanges } from '@/status/detector';
import { pauseCrawler } from '@/status/controller';

export default async function save(
    extractedData: SourceExtractedData,
    sourceConfig: SourceConfig,
    extraConfigs: CrawlerExtraConfigs,
): Promise<void> {
    try {
        let year = extractedData.year;
        const {
            title,
            type,
            pageNumber,
            pageLink,
            downloadLinks,
            watchOnlineLinks,
            torrentLinks,
            persianSummary,
            poster,
            // widePoster,
            trailers,
            subtitles,
            rating,
            // cookies,
        } = extractedData;

        let badLinks = [];
        if (pageNumber === 1) {
            badLinks = getLinksDoesntMatchLinkRegex(downloadLinks, type);
            if (badLinks.length > 0) {
                await ServerAnalysisRepo.saveCrawlerBadLink(
                    sourceConfig.config.sourceName,
                    pageLink,
                    badLinks.slice(0, 10),
                );
                await ServerAnalysisRepo.saveCrawlerWarning(
                    CrawlerErrors.crawler.crawlerBadLink(sourceConfig.config.sourceName),
                );
            }
        }

        if (!sourceConfig.config.isTorrent) {
            checkCrawledDataForChanges(
                sourceConfig,
                pageLink,
                downloadLinks,
                badLinks,
                poster,
                persianSummary,
            );
        }

        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.paused);
        await pauseCrawler();

        if (checkForceStopCrawler()) {
            return removePageLinkToCrawlerStatus(pageLink);
        }
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.addFileSize);
        await addFileSizeToDownloadLinks(
            type,
            downloadLinks,
            sourceConfig.config.sourceName,
            sourceConfig.config.vpnStatus,
        );

        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.checkingDB);
        if (checkForceStopCrawler()) {
            return removePageLinkToCrawlerStatus(pageLink);
        }

        const findTitle = titlesAndYears.find((t) => t.title === title);
        if (findTitle) {
            year = findTitle.year;
        }

        const { titleObj, db_data } = await getTitleObjAndDbData(
            title,
            year,
            type,
            downloadLinks,
            torrentLinks,
        );

        const titleModel = getMovieModel(
            titleObj,
            pageLink,
            type,
            downloadLinks,
            torrentLinks,
            sourceConfig.config.sourceName,
            year,
            poster,
            persianSummary,
            trailers,
            watchOnlineLinks,
            subtitles,
            sourceConfig.config.vpnStatus,
        );

        if (db_data === null) {
            //new title
            if (downloadLinks.length > 0 || torrentLinks.length > 0) {
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.paused);
                await pauseCrawler();
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.newTitle);
                if (checkForceStopCrawler()) {
                    return removePageLinkToCrawlerStatus(pageLink);
                }
                const result = await addApiData(
                    titleModel,
                    downloadLinks,
                    watchOnlineLinks,
                    torrentLinks,
                    sourceConfig.config.sourceName,
                    pageLink,
                    rating,
                    extraConfigs,
                );
                if (checkForceStopCrawler()) {
                    return removePageLinkToCrawlerStatus(pageLink);
                }
                if (result.titleModel.type.includes('movie')) {
                    result.titleModel.qualities = LinkUtils.groupMovieLinks(
                        downloadLinks,
                        watchOnlineLinks,
                        torrentLinks,
                    );
                }
                changePageLinkStateFromCrawlerStatus(
                    pageLink,
                    linkStateMessages.newTitle.inserting,
                );

                const { downloadTorrentLinks, removeTorrentLinks } =
                    await checkTorrentAutoDownloaderMustRun(
                        result.titleModel,
                        sourceConfig.config.sourceName,
                        true,
                    );
                result.titleModel.downloadTorrentLinks =
                    removeDuplicateElements(downloadTorrentLinks);
                result.titleModel.removeTorrentLinks = removeDuplicateElements(removeTorrentLinks);

                const insertedId = await CrawlerRepo.insertMovieToDB(result.titleModel);
                if (insertedId) {
                    // TODO : handle
                    // if (result.titleModel.posters.length > 0) {
                    //     await rabbitmqPublisher.addBlurHashToQueue(rabbitmqPublisher.blurHashTypes.movie, insertedId, "")
                    // }
                    // if (result.titleModel.poster_s3) {
                    //     await rabbitmqPublisher.addBlurHashToQueue(rabbitmqPublisher.blurHashTypes.movieS3, insertedId, result.titleModel.poster_s3.url)
                    // }
                    // if (result.titleModel.poster_wide_s3) {
                    //     await rabbitmqPublisher.addBlurHashToQueue(rabbitmqPublisher.blurHashTypes.movieWideS3, insertedId, result.titleModel.poster_wide_s3.url)
                    // }

                    if (type.includes('anime') && result.allApiData.jikanApiFields) {
                        changePageLinkStateFromCrawlerStatus(
                            pageLink,
                            linkStateMessages.newTitle.addingRelatedTitles,
                        );
                        await Jikan.handleAnimeRelatedTitles(
                            insertedId,
                            result.allApiData.jikanApiFields.jikanRelatedTitles,
                        );
                    }

                    // TODO : handle
                    // await handleNewInsertedMovieNotification(insertedId, result.titleModel.posters, pageLink);

                    if (checkForceStopCrawler()) {
                        return removePageLinkToCrawlerStatus(pageLink);
                    }
                    changePageLinkStateFromCrawlerStatus(
                        pageLink,
                        linkStateMessages.newTitle.addingCast,
                    );
                    await StaffAndCharacter.addStaffAndCharacters(
                        pageLink,
                        insertedId,
                        result.allApiData,
                        titleModel.castUpdateDate,
                        extraConfigs,
                    );
                    if (checkForceStopCrawler()) {
                        return removePageLinkToCrawlerStatus(pageLink);
                    }
                    if (extraConfigs?.castUpdateState !== 'ignore') {
                        await CrawlerRepo.updateMovieByIdDB(insertedId, {
                            castUpdateDate: new Date(),
                        });
                    }
                }
            }
            removePageLinkToCrawlerStatus(pageLink);
            return;
        }

        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.paused);
        await pauseCrawler();
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.updateTitle);
        if (checkForceStopCrawler()) {
            return removePageLinkToCrawlerStatus(pageLink);
        }
        const apiData = await apiDataUpdate(
            db_data,
            downloadLinks,
            watchOnlineLinks,
            torrentLinks,
            type,
            poster,
            sourceConfig.config.sourceName,
            pageLink,
            rating,
            extraConfigs,
        );
        if (checkForceStopCrawler()) {
            return removePageLinkToCrawlerStatus(pageLink);
        }
        const subUpdates = await handleSubUpdates(
            db_data,
            poster,
            trailers,
            sourceConfig.config.sourceName,
            sourceConfig.config.vpnStatus,
        );
        await handleDbUpdate(
            db_data,
            persianSummary,
            subUpdates,
            sourceConfig.config.sourceName,
            downloadLinks,
            watchOnlineLinks,
            torrentLinks,
            titleModel.subtitles,
            type,
            apiData,
            pageLink,
            extraConfigs,
        );
        removePageLinkToCrawlerStatus(pageLink);
    } catch (error) {
        await saveError(error);
        removePageLinkToCrawlerStatus(extractedData.pageLink);
    }
}

async function getTitleObjAndDbData(
    title: string,
    year: string,
    type: MovieType,
    siteDownloadLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
): Promise<{ titleObj: TitleObj; db_data: Movie | null }> {
    title = fixTitle(title);
    let titleObj = await getTitleObj(title, year, type, false);
    let db_data = await searchOnCollection(titleObj, year, type);
    if (db_data) {
        titleObj = {
            title: db_data.title,
            rawTitle: db_data.rawTitle,
            alternateTitles: db_data.alternateTitles,
            titleSynonyms: db_data.titleSynonyms,
            jikanID: db_data.apiIds.jikanID,
        };
    } else if (
        type.includes('anime') &&
        (siteDownloadLinks.length > 0 || torrentLinks.length > 0)
    ) {
        titleObj = await getTitleObj(title, year, type, true);
        db_data = await searchOnCollection(titleObj, year, type);
    }
    return { titleObj, db_data };
}

function fixTitle(title: string): string {
    if (title === 'go toubun no hanayome' || title === 'gotoubun no hanayome') {
        title = '5 toubun no hanayome';
    } else if (title === 'mushoku tensei') {
        title = 'mushoku tensei: jobless reincarnation';
    }
    return title;
}

async function getTitleObj(
    title: string,
    year: string,
    type: MovieType,
    useJikanApi: boolean,
): Promise<TitleObj> {
    const rawTitle = title
        .split(' ')
        .map((value) => value.charAt(0).toUpperCase() + value.slice(1))
        .join(' ');
    let titleObj = {
        title: title,
        rawTitle: rawTitle,
        alternateTitles: [],
        titleSynonyms: [],
        jikanID: 0,
    };

    if (useJikanApi) {
        const jikanApiData = await Jikan.getApiData(titleObj.title, [], [], 0, year, type);
        if (jikanApiData) {
            titleObj = jikanApiData.titleObj;
            titleObj.jikanID = jikanApiData.mal_id;
        }
    }

    return titleObj;
}

async function searchOnCollection(
    titleObj: TitleObj,
    year: string,
    type: MovieType,
): Promise<Movie | null> {
    let db_data = null;
    const dataConfig = {
        releaseState: 1,
        rank: 1,
        title: 1,
        type: 1,
        premiered: 1,
        year: 1,
        rawTitle: 1,
        alternateTitles: 1,
        titleSynonyms: 1,
        apiUpdateDate: 1,
        insert_date: 1,
        update_date: 1,
        castUpdateDate: 1,
        status: 1,
        apiIds: 1,
        qualities: 1,
        seasons: 1,
        sources: 1,
        summary: 1,
        posters: 1,
        poster_s3: 1,
        poster_wide_s3: 1,
        trailer_s3: 1,
        trailers: 1,
        trailerDate: 1,
        subtitles: 1,
        genres: 1,
        rating: 1,
        duration: 1,
        totalDuration: 1,
        totalSeasons: 1,
        latestData: 1,
        nextEpisode: 1,
        releaseDay: 1,
        animeType: 1,
        rated: 1,
        seasonEpisode: 1,
        torrentDownloaderConfig: 1,
        removeTorrentLinks: 1,
        downloadTorrentLinks: 1,
    };

    const searchTypes = [type];
    if (type.includes('anime')) {
        searchTypes.push(removeAnimeFromType(type));
    } else {
        searchTypes.push(convertTypeToAnime(type));
    }

    let reSearch = false;
    let searchResults = await CrawlerRepo.searchTitleDB(titleObj, searchTypes, year, dataConfig);
    if (
        searchResults.length === 0 &&
        (searchTypes[0].includes('serial') || searchTypes[0].includes('anime')) &&
        year
    ) {
        reSearch = true;
        searchResults = await CrawlerRepo.searchTitleDB(titleObj, searchTypes, '', dataConfig);
    }

    A: for (let i = 0; i < searchTypes.length; i++) {
        if (reSearch) {
            for (let k = 0; k < 2; k++) {
                for (let j = 0; j < searchResults.length; j++) {
                    const compareYear = Math.abs(Number(searchResults[j].year) - Number(year));
                    if (compareYear <= k && searchTypes[i] === searchResults[j].type) {
                        db_data = searchResults[j];
                        break A;
                    }
                }
            }
        } else {
            for (let j = 0; j < searchResults.length; j++) {
                if (searchTypes[i] === searchResults[j].type) {
                    db_data = searchResults[j];
                    break A;
                }
            }
        }
    }

    return db_data;
}

async function handleDbUpdate(
    db_data: Movie,
    persianSummary: string,
    subUpdates: {
        posterChange: boolean;
        trailerChange: boolean;
        newTrailer: boolean;
    },
    sourceName: string,
    downloadLinks: DownloadLink[],
    watchOnlineLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
    subtitles: GroupedSubtitle[],
    type: MovieType,
    apiData: any,
    pageLink: string,
    extraConfigs: CrawlerExtraConfigs,
): Promise<void> {
    try {
        if (!db_data._id) {
            return;
        }

        const updateFields: any = apiData ? apiData.updateFields : {};

        if (
            db_data.releaseState !== MovieReleaseState.DONE &&
            (downloadLinks.length > 0 || torrentLinks.length > 0)
        ) {
            changePageLinkStateFromCrawlerStatus(
                pageLink,
                linkStateMessages.updateTitle.convertingToRelease,
            );
            db_data.releaseState = MovieReleaseState.DONE;
            updateFields.releaseState = MovieReleaseState.DONE;
            db_data.insert_date = new Date();
            updateFields.insert_date = new Date();

            // TODO : send notification
            // await handleNewInsertedMovieNotification(db_data._id, db_data.posters, pageLink);
        }

        if (type.includes('serial') && !apiData) {
            const seasonsUpdateFlag = handleSiteSeasonEpisodeUpdate(
                db_data,
                sourceName,
                downloadLinks,
                watchOnlineLinks,
                torrentLinks,
            );
            if (seasonsUpdateFlag) {
                updateFields.seasons = db_data.seasons;
                updateFields.totalDuration = getTotalDuration(
                    db_data.seasons,
                    db_data.latestData,
                    db_data.type,
                );
                updateFields.seasonEpisode = getSeasonEpisode(db_data.seasons);
            }
        }

        if (db_data.type.includes('movie')) {
            const prevGroupedLinks = db_data.qualities;
            const currentGroupedLinks = LinkUtils.groupMovieLinks(
                downloadLinks,
                watchOnlineLinks,
                torrentLinks,
            );
            if (
                LinkUtils.updateMoviesGroupedLinks(
                    prevGroupedLinks,
                    currentGroupedLinks,
                    sourceName,
                )
            ) {
                updateFields.qualities = db_data.qualities;
            }
        }

        const subtitleUpdateFlag = handleSubtitlesUpdate(db_data.subtitles, subtitles, sourceName);
        if (subtitleUpdateFlag) {
            updateFields.subtitles = db_data.subtitles;
        }

        if (
            !db_data.sources.find((s) => s.sourceName === sourceName) &&
            (downloadLinks.length > 0 || watchOnlineLinks.length > 0 || torrentLinks.length > 0)
        ) {
            db_data.sources.push({
                sourceName: sourceName,
                pageLink: pageLink,
            });
            updateFields.sources = db_data.sources;
        } else {
            const source = db_data.sources.find((s) => s.sourceName === sourceName);
            if (source) {
                if (
                    downloadLinks.length === 0 &&
                    watchOnlineLinks.length === 0 &&
                    torrentLinks.length === 0
                ) {
                    db_data.sources = db_data.sources.filter(
                        (item) => item.sourceName !== sourceName,
                    );
                    updateFields.sources = db_data.sources;
                } else if (source.pageLink !== pageLink) {
                    source.pageLink = pageLink;
                    updateFields.sources = db_data.sources;
                }
            }
        }

        if (db_data.summary.persian.length < persianSummary.length) {
            let currentSummary = updateFields.summary;
            if (currentSummary === undefined) {
                currentSummary = db_data.summary;
            }
            currentSummary.persian = persianSummary;
            currentSummary.persian_source = sourceName;
            updateFields.summary = currentSummary;
        }

        if (subUpdates.posterChange) {
            updateFields.posters = db_data.posters;
            updateFields.poster_s3 = db_data.poster_s3;
        }
        if (subUpdates.trailerChange || updateFields.trailer_s3) {
            updateFields.trailers = db_data.trailers;
            if (subUpdates.newTrailer) {
                updateFields.trailerDate = Date.now();
            } else if (updateFields.trailers.length === 0) {
                updateFields.trailerDate = 0;
            }
        }

        //handle latestData updates
        const { latestDataChanged, latestDataUpdate, PrimaryLatestDataUpdate } =
            handleLatestDataUpdate(db_data, type);
        if (latestDataChanged) {
            updateFields.latestData = db_data.latestData;
            if (updateFields.totalDuration) {
                updateFields.totalDuration = getTotalDuration(
                    db_data.seasons,
                    db_data.latestData,
                    db_data.type,
                );
            }
        }
        if (latestDataUpdate && PrimaryLatestDataUpdate) {
            // don't update time, if it's new source for abandoned title
            if (
                !updateFields.sources ||
                db_data.sources.length > 1 ||
                db_data.sources[0]?.sourceName !== sourceName ||
                db_data.latestData.updateReason !== 'quality' ||
                getDatesBetween(new Date(), db_data.insert_date).days < 90
            ) {
                if (db_data.type.includes('serial')) {
                    if (
                        db_data.latestData.updateReason !== 'quality' ||
                        (db_data.update_date !== null &&
                            getDatesBetween(new Date(), db_data.update_date).days < 90)
                    ) {
                        updateFields.update_date = new Date();
                    }
                } else if (getDatesBetween(new Date(), db_data.insert_date).hours > 1) {
                    updateFields.update_date = new Date();
                }
            }
        }

        if (checkForceStopCrawler()) {
            return;
        }
        if (apiData) {
            changePageLinkStateFromCrawlerStatus(
                pageLink,
                linkStateMessages.updateTitle.addingCast,
            );
            await StaffAndCharacter.addStaffAndCharacters(
                pageLink,
                db_data._id,
                apiData.allApiData,
                db_data.castUpdateDate,
                extraConfigs,
            );
            if (extraConfigs?.castUpdateState !== 'ignore') {
                updateFields.castUpdateDate = new Date();
            }
        }
        if (checkForceStopCrawler()) {
            return;
        }

        if (db_data.trailer_s3 && db_data.trailers.length > 0) {
            if (!checkNeedTrailerUpload(null, db_data.trailers)) {
                //remove trailer from s3
                changePageLinkStateFromCrawlerStatus(
                    pageLink,
                    linkStateMessages.updateTitle.removingS3Trailer,
                );
                await removeS3Trailer(db_data, updateFields);
            } else if (
                db_data.releaseState === MovieReleaseState.DONE &&
                db_data.insert_date &&
                getDatesBetween(new Date(), db_data.insert_date).days > 90
            ) {
                const dLinksLength = db_data.type.includes('movie')
                    ? db_data.qualities.map((item) => item.links).flat(1).length
                    : db_data.seasons.map((s) => s.episodes.map((e) => e.links).flat(1)).flat(1)
                          .length;
                if (dLinksLength === 0) {
                    // let torrentLinksLength = db_data.type.includes('movie') ?
                    //     db_data.qualities.map(item => item.torrentLinks).flat(1).length
                    //     : db_data.seasons.map(s => s.episodes.map(e => e.torrentLinks).flat(1)).flat(1).length;
                    const onlineLinksLength = db_data.type.includes('movie')
                        ? db_data.qualities.map((item) => item.watchOnlineLinks).flat(1).length
                        : db_data.seasons
                              .map((s) => s.episodes.map((e) => e.watchOnlineLinks).flat(1))
                              .flat(1).length;
                    if (onlineLinksLength === 0) {
                        changePageLinkStateFromCrawlerStatus(
                            pageLink,
                            linkStateMessages.updateTitle.removingS3Trailer,
                        );
                        await removeS3Trailer(db_data, updateFields);
                    }
                }
            }
        }

        if (Object.keys(updateFields).length > 0) {
            const { downloadTorrentLinks, removeTorrentLinks } =
                await checkTorrentAutoDownloaderMustRun(db_data, sourceName, false);
            updateFields.downloadTorrentLinks = removeDuplicateElements(downloadTorrentLinks);
            updateFields.removeTorrentLinks = removeDuplicateElements(removeTorrentLinks);

            changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.updating);
            await CrawlerRepo.updateMovieByIdDB(db_data._id, updateFields);

            if (updateFields.posters && updateFields.posters.length > 0) {
                changePageLinkStateFromCrawlerStatus(
                    pageLink,
                    linkStateMessages.updateTitle.addingMoviePosterBlurHashQueue,
                );
                // TODO : generate blurHash
                // await rabbitmqPublisher.addBlurHashToQueue(
                //     rabbitmqPublisher.blurHashTypes.movie,
                //     db_data._id,
                //     '',
                // );
            }
            if (updateFields.poster_s3) {
                changePageLinkStateFromCrawlerStatus(
                    pageLink,
                    linkStateMessages.updateTitle.addingMoviePosterS3BlurHashQueue,
                );
                // TODO : generate blurHash
                // await rabbitmqPublisher.addBlurHashToQueue(
                //     rabbitmqPublisher.blurHashTypes.movieS3,
                //     db_data._id,
                //     updateFields.poster_s3.url,
                // );
            }
            if (updateFields.poster_wide_s3) {
                changePageLinkStateFromCrawlerStatus(
                    pageLink,
                    linkStateMessages.updateTitle.addingMovieWidePosterS3BlurHashQueue,
                );
                // TODO : generate blurHash
                // await rabbitmqPublisher.addBlurHashToQueue(
                //     rabbitmqPublisher.blurHashTypes.movieWideS3,
                //     db_data._id,
                //     updateFields.poster_wide_s3.url,
                // );
            }

            if (latestDataUpdate && PrimaryLatestDataUpdate) {
                // maybe take some time
                // TODO : send notification
                // await handleMovieNotification(db_data, pageLink);
            }
        }
    } catch (error) {
        saveError(error);
    }
}

//---------------------------------------------
//---------------------------------------------

async function removeS3Trailer(db_data: Movie, updateFields: any): Promise<void> {
    const fileName = db_data.trailer_s3?.url.split('/').pop();
    if (!fileName) {
        return;
    }

    const removeS3Trailer = await S3Storage.deleteTrailerFromS3(fileName);
    if (removeS3Trailer) {
        db_data.trailers = db_data.trailers.filter(
            (item) => !item.info.includes('s3Trailer') && item.url !== db_data.trailer_s3?.url,
        );
        if (db_data.trailers.length === 0) {
            db_data.trailerDate = 0;
            updateFields.trailerDate = 0;
        }
        updateFields.trailers = db_data.trailers;
        db_data.trailer_s3 = null;
        updateFields.trailer_s3 = null;
    }
}

async function addFileSizeToDownloadLinks(
    type: MovieType,
    downloadLinks: DownloadLink[],
    sourceName: string,
    sourceVpnStatus: SourceVpnStatus,
) {
    if (sourceVpnStatus.downloadLink === VPNStatus.NO_VPN) {
        return;
    }

    //TODO : add to db config
    const promiseQueue = new PQueue({ concurrency: 6 });

    let failedCounter = 0;
    if (type.includes('movie')) {
        for (let j = 0, _length = downloadLinks.length; j < _length; j++) {
            if (failedCounter > 5) {
                break;
            }
            if (!downloadLinks[j].info.includes(' - ')) {
                let url = downloadLinks[j].link;
                if (sourceName === 'film2movie') {
                    const temp = url.match(/\/\?s=\d+&f=/gi);
                    if (temp) {
                        const match = temp.pop();
                        const number = Number(match?.match(/\d+/g)?.pop() ?? 0);
                        url = url
                            .replace(/(?<=dl)\d+(?=\.)/, number.toString())
                            .replace(match ?? '', '');
                    }
                }

                promiseQueue.add(() =>
                    getFileSize(url).then((size) => {
                        if (size > 0) {
                            size = Math.ceil(size / 1024 / 1024);
                            const sizeStr =
                                size < 1000 ? `${size}MB` : `${(size / 1024).toFixed(1)}GB`;
                            downloadLinks[j].info = downloadLinks[j].info + ' - ' + sizeStr;
                        } else {
                            failedCounter++;
                        }
                    }),
                );
            }
        }
    } else {
        const gps: string[] = [];
        const groupedDownloadLinks = downloadLinks.reduce((groups, item) => {
            const g = item.info.split(' - ')[0] + '/' + item.season;
            // @ts-expect-error ...
            if (!groups[g]) {
                // @ts-expect-error ...
                groups[g] = [item];
                gps.push(g);
            } else {
                // @ts-expect-error ...
                groups[g].push(item);
            }
            return groups;
        }, {});

        for (let j = 0; j < gps.length; j++) {
            // @ts-expect-error ...
            if (groupedDownloadLinks[gps[j]].every((l) => !l.info.includes(' - '))) {
                if (failedCounter > 5) {
                    break;
                }
                // @ts-expect-error ...
                let url = groupedDownloadLinks[gps[j]][0].link;
                if (sourceName === 'film2movie') {
                    const temp = url.match(/\/\?s=\d+&f=/gi);
                    if (temp) {
                        const match = temp.pop();
                        const number = Number(match.match(/\d+/g).pop());
                        url = url.replace(/(?<=dl)\d+(?=\.)/, number).replace(match, '');
                    }
                }

                promiseQueue.add(() =>
                    getFileSize(url).then((size) => {
                        if (size > 0) {
                            const g = gps[j];
                            size = Math.ceil(size / 1024 / 1024);
                            const sizeStr =
                                size < 1000
                                    ? `${Math.round((size - 50) / 100) * 100 + 50}MB`
                                    : `${(size / 1024).toFixed(1)}GB`;
                            // @ts-expect-error ...
                            for (let k = 0; k < groupedDownloadLinks[g].length; k++) {
                                // @ts-expect-error ...
                                groupedDownloadLinks[g][k].info =
                                    // @ts-expect-error ...
                                    groupedDownloadLinks[g][k].info + ' - ' + sizeStr;
                            }
                        } else {
                            failedCounter++;
                        }
                    }),
                );
            }
        }
    }

    await promiseQueue.onIdle();
    return downloadLinks;
}

//---------------------------------------------
//---------------------------------------------

async function checkTorrentAutoDownloaderMustRun(
    titleModel: Movie,
    sourceName: string,
    isNewTitle: boolean,
): Promise<{ removeTorrentLinks: string[]; downloadTorrentLinks: string[] }> {
    const removeTorrentLinks = titleModel.removeTorrentLinks || [];
    const downloadTorrentLinks = titleModel.downloadTorrentLinks || [];

    const torrentDbConfig = dynamicConfig.getCachedTorrentDbConfigs();
    if (!torrentDbConfig) {
        return {
            downloadTorrentLinks: [],
            removeTorrentLinks: [],
        };
    }

    const defaultConfig = torrentDbConfig.defaultTorrentDownloaderConfig;

    const torrentDownloadSizeLimit =
        (torrentDbConfig.torrentDownloadMaxFileSize || 0) * 1024 * 1024;

    if (
        defaultConfig.disabled.includes(TorrentDownloaderDisabledState.ALL) ||
        defaultConfig.disabled.includes(titleModel.type.split('_').pop() ?? '')
    ) {
        return { removeTorrentLinks, downloadTorrentLinks };
    }

    if (isNewTitle) {
        return checkTorrentAutoDownloaderMustRun_newTitle(
            titleModel,
            sourceName,
            defaultConfig,
            torrentDownloadSizeLimit,
        );
    }

    let titleConfig;
    if (
        defaultConfig.status === TorrentDownloaderStatus.FORCE ||
        (defaultConfig.status === TorrentDownloaderStatus.DEFAULT &&
            !titleModel.torrentDownloaderConfig)
    ) {
        titleConfig = { ...defaultConfig };
        if (
            Number(titleModel.rating.imdb) < defaultConfig.minImdbScore &&
            Number(titleModel.rating.myAnimeList) < defaultConfig.minMalScore
        ) {
            return { removeTorrentLinks, downloadTorrentLinks };
        }
    } else {
        // status: ignore || status:default and validConfig
        titleConfig = titleModel.torrentDownloaderConfig;
        if (titleConfig?.disabled) {
            return { removeTorrentLinks, downloadTorrentLinks };
        }
    }

    if (!titleConfig) {
        return { removeTorrentLinks, downloadTorrentLinks };
    }

    if (titleModel.type.includes('serial')) {
        if (downloadTorrentLinks.length >= titleConfig.newEpisodeLinkLimit) {
            return { removeTorrentLinks, downloadTorrentLinks };
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, s, e] = titleModel.latestData.torrentLinks.split(/[se]/gi);
        const season = Number(s);
        const episode = Number(e);

        const searchQualities = defaultConfig.newEpisodeQualities
            .toLowerCase()
            .split(',')
            .map((item) => item.trim());

        for (let i = 0; i < titleModel.seasons.length; i++) {
            if (titleModel.seasons[i].seasonNumber === season) {
                for (let j = 0; j < titleModel.seasons[i].episodes.length; j++) {
                    if (titleModel.seasons[i].episodes[j].episodeNumber === episode) {
                        // new episode
                        if (
                            titleModel.seasons[i].episodes[j].links.length > 0 &&
                            titleConfig.bypassIfHasDownloadLink
                        ) {
                            return { removeTorrentLinks, downloadTorrentLinks };
                        }

                        const torrentLinks = titleModel.seasons[i].episodes[j].torrentLinks.filter(
                            (l) => l.type === 'torrent',
                        );

                        const countOfTorrentDirected = torrentLinks.filter(
                            (l) => !!l.localLink,
                        ).length;
                        if (countOfTorrentDirected >= titleConfig.newEpisodeLinkLimit) {
                            return { removeTorrentLinks, downloadTorrentLinks };
                        }

                        for (let k = 0; k < torrentLinks.length; k++) {
                            for (let l = 0; l < searchQualities.length; l++) {
                                if (torrentLinks[k].info.includes(searchQualities[l])) {
                                    if (
                                        !downloadTorrentLinks.includes(torrentLinks[k].link) &&
                                        (!torrentDownloadSizeLimit ||
                                            (torrentLinks[k].size ?? 0) <= torrentDownloadSizeLimit)
                                    ) {
                                        downloadTorrentLinks.push(torrentLinks[k].link);
                                    }

                                    if (
                                        downloadTorrentLinks.length >=
                                        titleConfig.newEpisodeLinkLimit
                                    ) {
                                        return {
                                            removeTorrentLinks,
                                            downloadTorrentLinks,
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } else {
        if (downloadTorrentLinks.length >= titleConfig.movieLinkLimit) {
            return { removeTorrentLinks, downloadTorrentLinks };
        }

        const searchQualities = defaultConfig.movieQualities
            .toLowerCase()
            .split(',')
            .map((item) => item.trim());

        for (let i = 0; i < titleModel.qualities.length; i++) {
            if (searchQualities.includes(titleModel.qualities[i].quality.toLowerCase())) {
                // quality is candidate
                if (
                    titleModel.qualities[i].links.length > 0 &&
                    titleConfig.bypassIfHasDownloadLink
                ) {
                    // check another quality
                    continue;
                }

                const torrentLinks = titleModel.qualities[i].torrentLinks.filter(
                    (l) => l.type === 'torrent',
                );

                for (let j = 0; j < torrentLinks.length; j++) {
                    if (
                        !downloadTorrentLinks.includes(torrentLinks[j].link) &&
                        (!torrentDownloadSizeLimit ||
                            (torrentLinks[j].size ?? 0) <= torrentDownloadSizeLimit)
                    ) {
                        downloadTorrentLinks.push(torrentLinks[j].link);
                    }

                    const countOfTorrentDirected = torrentLinks.filter((l) => !!l.localLink).length;
                    if (countOfTorrentDirected >= titleConfig.movieLinkLimit) {
                        return { removeTorrentLinks, downloadTorrentLinks };
                    }

                    if (downloadTorrentLinks.length >= titleConfig.movieLinkLimit) {
                        return { removeTorrentLinks, downloadTorrentLinks };
                    }
                }
            }
        }
    }

    return { removeTorrentLinks, downloadTorrentLinks };
}

function checkTorrentAutoDownloaderMustRun_newTitle(
    titleModel: Movie,
    sourceName: string,
    defaultConfig: DefaultTorrentDownloaderConfig,
    torrentDownloadSizeLimit: number,
): { removeTorrentLinks: string[]; downloadTorrentLinks: string[] } {
    const removeTorrentLinks: string[] = [];
    const downloadTorrentLinks: string[] = [];

    if (defaultConfig.status === TorrentDownloaderStatus.IGNORE) {
        return { removeTorrentLinks, downloadTorrentLinks };
    }
    if (
        Number(titleModel.rating.imdb) < defaultConfig.minImdbScore &&
        Number(titleModel.rating.myAnimeList) < defaultConfig.minMalScore
    ) {
        return { removeTorrentLinks, downloadTorrentLinks };
    }
    if (!torrentSourcesNames.includes(sourceName)) {
        //there is no torrent link to continue
        return { removeTorrentLinks, downloadTorrentLinks };
    }

    if (titleModel.type.includes('serial')) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, s, e] = titleModel.latestData.torrentLinks.split(/[se]/gi);
        const season = Number(s);
        const episode = Number(e);

        const searchQualities = defaultConfig.newEpisodeQualities
            .toLowerCase()
            .split(',')
            .map((item: string) => item.trim());

        for (let i = 0; i < titleModel.seasons.length; i++) {
            if (titleModel.seasons[i].seasonNumber === season) {
                for (let j = 0; j < titleModel.seasons[i].episodes.length; j++) {
                    if (titleModel.seasons[i].episodes[j].episodeNumber === episode) {
                        const torrentLinks = titleModel.seasons[i].episodes[j].torrentLinks.filter(
                            (l) => l.type === 'torrent',
                        );

                        for (let k = 0; k < torrentLinks.length; k++) {
                            for (let l = 0; l < searchQualities.length; l++) {
                                if (torrentLinks[k].info.includes(searchQualities[l])) {
                                    if (
                                        !downloadTorrentLinks.includes(torrentLinks[k].link) &&
                                        (!torrentDownloadSizeLimit ||
                                            (torrentLinks[k]?.size ?? 0) <=
                                                torrentDownloadSizeLimit)
                                    ) {
                                        downloadTorrentLinks.push(torrentLinks[k].link);
                                    }

                                    if (
                                        downloadTorrentLinks.length >=
                                        defaultConfig.newEpisodeLinkLimit
                                    ) {
                                        return {
                                            removeTorrentLinks,
                                            downloadTorrentLinks,
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } else {
        const searchQualities = defaultConfig.movieQualities
            .toLowerCase()
            .split(',')
            .map((item) => item.trim());

        for (let i = 0; i < titleModel.qualities.length; i++) {
            if (searchQualities.includes(titleModel.qualities[i].quality.toLowerCase())) {
                const torrentLinks = titleModel.qualities[i].torrentLinks.filter(
                    (l) => l.type === 'torrent',
                );

                for (let j = 0; j < torrentLinks.length; j++) {
                    if (
                        !downloadTorrentLinks.includes(torrentLinks[j].link) &&
                        (!torrentDownloadSizeLimit ||
                            (torrentLinks[j].size ?? 0) <= torrentDownloadSizeLimit)
                    ) {
                        downloadTorrentLinks.push(torrentLinks[j].link);
                    }

                    if (downloadTorrentLinks.length >= defaultConfig.movieLinkLimit) {
                        return { removeTorrentLinks, downloadTorrentLinks };
                    }
                }
            }
        }
    }

    return { removeTorrentLinks, downloadTorrentLinks };
}
