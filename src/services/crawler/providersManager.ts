import { sortPosters } from '@services/crawler/posterAndTrailer';
import { Jikan, KITSU, OMDB, TVMaze } from '@/providers';
import type { JikanFields } from '@/providers/jikan.provider';
import type { KITSUFields } from '@/providers/kitsu.provider';
import type { OMDBFields } from '@/providers/omdb.provider';
import type { TVMazeFields } from '@/providers/tvmaze.provider';
import {
    changePageLinkStateFromCrawlerStatus, checkForceStopCrawler,
    partialChangePageLinkStateFromCrawlerStatus,
} from '@/status/status';
import { linkStateMessages } from '@/status/warnings';
import { uploadTitlePosterToS3 } from '@/storage/s3';
import {
    type CrawlerExtraConfigs,
    type DownloadLink,
    ExtraConfigsSwitchState,
    type MovieType,
} from '@/types';
import type {
    Movie,
    MoviePoster,
    MoviePosterS3,
    MovieRates,
    TitleObj,
} from '@/types/movie';
import {
    getEndYear, getSeasonEpisode, getTotalDuration,
    handleSeasonEpisodeUpdate,
} from '@services/crawler/seasonAndEpisode';
import { getFileSize } from '@utils/axios';
import {
    convertTypeToAnime,
    getDatesBetween,
    removeDuplicateElements,
    replaceSpecialCharacters,
} from '@utils/crawler';
import { saveError, saveErrorIfNeeded } from '@utils/logger';

export async function addApiData(
    titleModel: Movie | any,
    site_links: DownloadLink[],
    siteWatchOnlineLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
    sourceName: string,
    pageLink: string,
    siteRating: MovieRates | null,
    extraConfigs: CrawlerExtraConfigs,
    ): Promise<any> {

    titleModel.apiUpdateDate = new Date();

    if (titleModel.posters.length > 0) {
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingPosterToS3);
        const s3poster = await uploadTitlePosterToS3(titleModel.title, titleModel.type, titleModel.year, titleModel.posters[0].url);
        if (s3poster) {
            titleModel.poster_s3 = s3poster;
            if (titleModel.posters.length === 1) {
                if (s3poster.originalUrl) {
                    titleModel.posters[0].size = s3poster.originalSize || s3poster.size;
                }
                if (s3poster.thumbnail) {
                    titleModel.posters[0].thumbnail = s3poster.thumbnail;
                }
            }
            titleModel.posters.push({
                url: s3poster.url,
                info: 's3Poster',
                size: s3poster.size,
                vpnStatus: s3poster.vpnStatus,
                thumbnail: s3poster.thumbnail,
                blurHash: s3poster.blurHash,
            });
            titleModel.posters = sortPosters(titleModel.posters);
        }
    }

    if (checkForceStopCrawler()) {
        return;
    }
    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.callingOmdbTvMazeKitsuAmv);
    // let {omdbApiData, tvmazeApiData, kitsuApiData, amvApiData} = await handleApiCalls(titleModel, pageLink);
    const {omdbApiData, tvmazeApiData, kitsuApiData} = await handleApiCalls(titleModel, pageLink);

    let omdbApiFields: OMDBFields | null = null;
    let tvmazeApiFields: TVMazeFields | null = null;
    let jikanApiFields: JikanFields | null = null;
    let kitsuApiFields: KITSUFields | null = null
    const amvApiFields = null;

    if (omdbApiData !== null) {
        omdbApiFields = OMDB.getApiFields(omdbApiData, titleModel.type);
        if (omdbApiFields) {
            titleModel = {...titleModel, ...omdbApiFields.updateFields};
            updateSpecificFields(titleModel, titleModel, omdbApiFields, 'omdb');
            titleModel.rating = {...titleModel.rating, ...omdbApiFields.rating};
            if (omdbApiFields.year) {
                if (titleModel.type.includes('serial') || !titleModel.year) {
                    titleModel.year = omdbApiFields.year;
                }
            }
            if (omdbApiFields.imdbID) {
                titleModel.apiIds.imdbID = omdbApiFields.imdbID;
            }
        }
    }

    if (tvmazeApiData !== null) {
        tvmazeApiFields = TVMaze.getApiFields(tvmazeApiData);
        if (tvmazeApiFields) {
            titleModel = {...titleModel, ...tvmazeApiFields.updateFields};
            updateSpecificFields(titleModel, titleModel, tvmazeApiFields, 'tvmaze');

            // add poster, torrent first released
            if (tvmazeApiFields.posters.length > 0 && titleModel.posters.length === 0) {
                const imageUrl = tvmazeApiFields.posters[1]?.resolutions?.original?.url ||
                    tvmazeApiFields.posters[0].resolutions.original?.url ||
                    tvmazeApiFields.posters[1]?.resolutions?.medium?.url ||
                    tvmazeApiFields.posters[0].resolutions.medium?.url;

                if (imageUrl) {
                    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingTvmazePosterToS3);
                    await uploadPosterAndAddToData(titleModel, imageUrl, false, false);
                }
            }
            if (tvmazeApiFields.backgroundPosters.length > 0 && titleModel.poster_wide_s3 === null) {
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingTvmazeWidePosterToS3);
                const imageUrl = tvmazeApiFields.backgroundPosters[1]?.resolutions?.original?.url ||
                    tvmazeApiFields.backgroundPosters[0].resolutions.original?.url ||
                    tvmazeApiFields.backgroundPosters[1]?.resolutions?.medium?.url ||
                    tvmazeApiFields.backgroundPosters[0].resolutions.medium?.url;
                if (imageUrl) {
                    const s3WidePoster = await uploadTitlePosterToS3(titleModel.title, titleModel.type, titleModel.year, imageUrl, false, true);
                    if (s3WidePoster) {
                        titleModel.poster_wide_s3 = s3WidePoster;
                    }
                }
            }
            if (tvmazeApiFields.imdbID) {
                titleModel.apiIds.imdbID = tvmazeApiFields.imdbID;
            }
            if (tvmazeApiFields.tvmazeID) {
                titleModel.apiIds.tvmazeID = tvmazeApiFields.tvmazeID;
            }
        }
    }


    if (!titleModel.type.includes('anime') && (omdbApiFields?.isAnime || tvmazeApiFields?.isAnime)) {
        // titleModel.type = 'anime_' + titleModel.type;
        titleModel.type = convertTypeToAnime(titleModel.type);
    }

    if (checkForceStopCrawler()) {
        return;
    }
    if (titleModel.type.includes('serial')) {
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.handlingSeasonFields);
        const seasonEpisodeFieldsUpdate = await updateSeasonsField(titleModel, sourceName, site_links, siteWatchOnlineLinks, torrentLinks, titleModel.totalSeasons, omdbApiFields, tvmazeApiFields, false);
        titleModel = {...titleModel, ...seasonEpisodeFieldsUpdate};
    }

    if (checkForceStopCrawler()) {
        return;
    }
    if (titleModel.type.includes('anime')) {
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.callingJikan);
        const jikanApiData = await Jikan.getApiData(
            titleModel.title,
            [],
            [],
            titleModel.apiIds.jikanID,
            titleModel.year,
            titleModel.type,
            );
        if (jikanApiData) {
            jikanApiFields = Jikan.getApiFields(jikanApiData);
            if (jikanApiFields) {
                if (jikanApiFields.jikanPoster && titleModel.poster_s3 === null) {
                    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingJikanPosterToS3);
                    await uploadPosterAndAddToData(titleModel, jikanApiFields.jikanPoster, false, false);
                }

                if (jikanApiFields.youtubeTrailer) {
                    // TODO : save youtube trailer url
                    // titleModel = {...titleModel, ...TTTT};
                }

                titleModel = {...titleModel, ...jikanApiFields.updateFields};
                if (!titleModel.movieLang) {
                    titleModel.movieLang = 'japanese';
                }
                if (!titleModel.country) {
                    titleModel.country = 'japan';
                }
                if (titleModel.status === 'unknown') {
                    titleModel.status = jikanApiFields.status;
                    titleModel.endYear = jikanApiFields.endYear;
                }
                if (jikanApiFields.jikanID) {
                    titleModel.apiIds.jikanID = jikanApiFields.jikanID;
                }
                updateSpecificFields(titleModel, titleModel, jikanApiFields, 'jikan');
                titleModel.rating.myAnimeList = jikanApiFields.myAnimeListScore;
            }
        }
    }


    if (checkForceStopCrawler()) {
        return;
    }
    if (kitsuApiData !== null) {
        kitsuApiFields = KITSU.getApiFields(kitsuApiData);
        if (kitsuApiFields) {
            if (kitsuApiFields.youtubeTrailer) {
                // TODO : save youtube trailer url
                // titleModel = {...titleModel, ...TTTT};
            }

            titleModel.apiIds.kitsuID = kitsuApiFields.kitsuID;
            if (titleModel.status === 'unknown' || !titleModel.type.includes('anime')) {
                titleModel.status = kitsuApiFields.status;
                titleModel.endYear = kitsuApiFields.endYear;
            }
            if (kitsuApiFields.rated && (!titleModel.rated || titleModel.rated === 'Not Rated')) {
                titleModel.rated = kitsuApiFields.rated;
            }
            if (kitsuApiFields.duration && kitsuApiFields.duration !== '0 min' && (!titleModel.duration || titleModel.duration === '0 min')) {
                titleModel.duration = kitsuApiFields.duration;
            }

            const checkKeys = ['year', 'premiered', 'totalDuration', 'animeType'];
            for (let i = 0; i < checkKeys.length; i++) {
                // @ts-expect-error ...
                if (kitsuApiFields[checkKeys[i]] && !titleModel[checkKeys[i]]) {
                    // @ts-expect-error ...
                    titleModel[checkKeys[i]] = kitsuApiFields[checkKeys[i]];
                }
            }

            updateSpecificFields(titleModel, titleModel, kitsuApiFields, 'kitsu');

            if (kitsuApiFields.kitsuPoster && titleModel.poster_s3 === null) {
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingKitsuPosterToS3);
                await uploadPosterAndAddToData(titleModel, kitsuApiFields.kitsuPoster, false, false);
            }

            if (kitsuApiFields.kitsuPosterCover && titleModel.poster_wide_s3 === null) {
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingKitsuWidePosterToS3);
                const s3WidePoster = await uploadTitlePosterToS3(titleModel.title, titleModel.type, titleModel.year, kitsuApiFields.kitsuPosterCover, false, true);
                if (s3WidePoster) {
                    titleModel.poster_wide_s3 = s3WidePoster;
                }
            }
        }
    }

    if (checkForceStopCrawler()) {
        return;
    }
    // if (amvApiData !== null) {
    //     amvApiFields = getAmvApiFields(amvApiData);
    //     if (amvApiFields) {
    //         if (amvApiFields.youtubeTrailer) {
    //             titleModel = {...titleModel, ...TTTT};
    //         }
    //
    //         titleModel.apiIds.amvID = amvApiFields.amvID;
    //         titleModel.apiIds.gogoID = amvApiFields.gogoID;
    //         if (!titleModel.apiIds.jikanID && amvApiFields.jikanID) {
    //             titleModel.apiIds.jikanID = amvApiFields.jikanID;
    //         }
    //         if (titleModel.status === 'unknown' || !titleModel.type.includes('anime')) {
    //             titleModel.status = amvApiFields.status;
    //             titleModel.endYear = amvApiFields.endYear;
    //         }
    //         if (amvApiFields.duration && amvApiFields.duration !== '0 min' && (!titleModel.duration || titleModel.duration === '0 min')) {
    //             titleModel.duration = amvApiFields.duration;
    //         }
    //
    //         const checkKeys = ['year', 'premiered', 'totalDuration', 'animeType', 'officialSite', 'animeSeason'];
    //         for (let i = 0; i < checkKeys.length; i++) {
    //             if (amvApiFields[checkKeys[i]] && !titleModel[checkKeys[i]]) {
    //                 titleModel[checkKeys[i]] = amvApiFields[checkKeys[i]];
    //             }
    //         }
    //
    //         updateSpecificFields(titleModel, titleModel, amvApiFields, 'amv');
    //
    //         if (amvApiFields.amvPoster && titleModel.poster_s3 === null) {
    //             changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingAmvPosterToS3);
    //             await uploadPosterAndAddToData(titleModel, amvApiFields.amvPoster, false, false);
    //         }
    //
    //         if (amvApiFields.amvPosterCover && titleModel.poster_wide_s3 === null) {
    //             changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingAmvWidePosterToS3);
    //             let s3WidePoster = await uploadTitlePosterToS3(titleModel.title, titleModel.type, titleModel.year, amvApiFields.amvPosterCover, false, true);
    //             if (s3WidePoster) {
    //                 titleModel.poster_wide_s3 = s3WidePoster;
    //             }
    //         }
    //     }
    // }

    if (omdbApiFields && omdbApiFields.poster && titleModel.posters.length === 0) {
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.newTitle.uploadingOmdbPosterToS3);
        const imageUrl = omdbApiFields.poster.replace(/_SX\d+(?=\.jpg)/i, '');
        await uploadPosterAndAddToData(titleModel, imageUrl, false, false);
    }

    handleSiteRating(titleModel.rating, siteRating);

    return {
        titleModel,
        allApiData: {
            omdbApiFields, tvmazeApiFields,
            jikanApiFields,
            kitsuApiFields, amvApiFields,
        }
    };
}

export async function apiDataUpdate(
    db_data: Movie,
    site_links: DownloadLink[],
    siteWatchOnlineLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
    siteType: MovieType,
    sitePoster: string,
    sourceName: string,
    pageLink: string,
    siteRating: MovieRates | null,
    extraConfigs: CrawlerExtraConfigs,
    ): Promise<any> {
    
    const now = new Date();
    const apiUpdateDate = new Date(db_data.apiUpdateDate);
    if (extraConfigs?.apiUpdateState === ExtraConfigsSwitchState.IGNORE) {
        return null;
    }
    if (getDatesBetween(now, apiUpdateDate).hours < 8 && extraConfigs?.apiUpdateState !== 'force') {
        return null;
    }

    let updateFields: any = {
        apiUpdateDate: now,
    };

    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.checkingPoster);
    if (sitePoster && (db_data.poster_s3 === null || await checkBetterS3Poster(db_data.posters, sourceName, sitePoster, db_data.poster_s3))) {
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingPosterToS3);
        const s3poster = await uploadTitlePosterToS3(db_data.title, db_data.type, db_data.year, sitePoster, true);
        if (s3poster) {
            db_data.poster_s3 = s3poster;
            updateFields.poster_s3 = s3poster;
        }
    }

    if (checkForceStopCrawler()) {
        return;
    }
    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.callingOmdbTvMazeKitsuAmv);
    // const {omdbApiData, tvmazeApiData, kitsuApiData, amvApiData} = await handleApiCalls(db_data, pageLink);
    const {omdbApiData, tvmazeApiData, kitsuApiData} = await handleApiCalls(db_data, pageLink);
    let omdbApiFields: OMDBFields | null = null;
    let tvmazeApiFields: TVMazeFields | null = null;
    let jikanApiFields: JikanFields | null = null
    let kitsuApiFields: KITSUFields | null = null
    const amvApiFields= null;

    if (omdbApiData !== null) {
        omdbApiFields = OMDB.getApiFields(omdbApiData, db_data.type);
        if (omdbApiFields) {
            updateFields = {...updateFields, ...omdbApiFields.updateFields};
            updateSpecificFields(db_data, updateFields, omdbApiFields, 'omdb');
            db_data.rating = {...db_data.rating, ...omdbApiFields.rating};
            updateFields.rating = db_data.rating;
            if (omdbApiFields.year) {
                if (db_data.type.includes('serial') || !db_data.year) {
                    db_data.year = omdbApiFields.year;
                    updateFields.year = omdbApiFields.year;
                }
            }
            if (db_data.apiIds.imdbID !== omdbApiFields.imdbID && omdbApiFields.imdbID) {
                db_data.apiIds.imdbID = omdbApiFields.imdbID;
                updateFields.apiIds = db_data.apiIds;
            }
        }
    }

    if (tvmazeApiData !== null) {
        tvmazeApiFields = TVMaze.getApiFields(tvmazeApiData);
        if (tvmazeApiFields) {
            updateFields = {...updateFields, ...tvmazeApiFields.updateFields};
            updateSpecificFields(db_data, updateFields, tvmazeApiFields, 'tvmaze');

            // add poster, torrent first released
            if (tvmazeApiFields.posters.length > 0 && db_data.posters.length === 0) {
                const imageUrl = tvmazeApiFields.posters[1]?.resolutions?.original?.url ||
                    tvmazeApiFields.posters[0].resolutions.original?.url ||
                    tvmazeApiFields.posters[1]?.resolutions?.medium?.url ||
                    tvmazeApiFields.posters[0].resolutions.medium?.url;
                if (imageUrl && db_data.poster_s3 === null) {
                    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingTvmazePosterToS3);
                    let posterAdded = await uploadPosterAndAddToData(db_data, imageUrl, true, false);
                    if (posterAdded) {
                        updateFields.poster_s3 = db_data.poster_s3;
                        updateFields.posters = db_data.posters;
                    }
                }
            }
            if (tvmazeApiFields.backgroundPosters.length > 0) {
                const imageUrl = tvmazeApiFields.backgroundPosters[1]?.resolutions?.original?.url ||
                    tvmazeApiFields.backgroundPosters[0].resolutions.original?.url ||
                    tvmazeApiFields.backgroundPosters[1]?.resolutions?.medium?.url ||
                    tvmazeApiFields.backgroundPosters[0].resolutions.medium?.url;
                if (imageUrl && (db_data.poster_wide_s3 === null || (db_data.poster_wide_s3.originalUrl && db_data.poster_wide_s3.originalUrl !== imageUrl))) {
                    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingTvmazeWidePosterToS3);
                    let s3WidePoster = await uploadTitlePosterToS3(db_data.title, db_data.type, db_data.year, imageUrl, true, true);
                    if (s3WidePoster) {
                        db_data.poster_wide_s3 = s3WidePoster;
                        updateFields.poster_wide_s3 = s3WidePoster;
                    }
                }
            }
            if (db_data.apiIds.imdbID !== tvmazeApiFields.imdbID && tvmazeApiFields.imdbID) {
                db_data.apiIds.imdbID = tvmazeApiFields.imdbID;
                updateFields.apiIds = db_data.apiIds;
            }
            if (db_data.apiIds.tvmazeID !== tvmazeApiFields.tvmazeID && tvmazeApiFields.tvmazeID) {
                db_data.apiIds.tvmazeID = tvmazeApiFields.tvmazeID;
                updateFields.apiIds = db_data.apiIds;
            }
        }
    }

    if (!db_data.type.includes('anime') && (omdbApiFields?.isAnime || tvmazeApiFields?.isAnime)) {
        // db_data.type = 'anime_' + db_data.type;
        db_data.type = convertTypeToAnime(db_data.type);
        updateFields.type = db_data.type;
    }

    if (checkForceStopCrawler()) {
        return;
    }
    if (db_data.type.includes('serial')) {
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.handlingSeasonFields);
        const seasonEpisodeFieldsUpdate = await updateSeasonsField(
            db_data, sourceName, site_links, siteWatchOnlineLinks, torrentLinks,
            updateFields.totalSeasons, omdbApiFields, tvmazeApiFields, true);
        updateFields = {...updateFields, ...seasonEpisodeFieldsUpdate};
    }

    if (checkForceStopCrawler()) {
        return;
    }
    if (db_data.type.includes('anime') || siteType.includes('anime')) {
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.callingJikan);
        const jikanApiData = await Jikan.getApiData(
            db_data.title,
            [],
            [],
            db_data.apiIds.jikanID,
            db_data.year,
            db_data.type,
            );
        if (jikanApiData) {
            const temp = handleTypeAndTitleUpdate(db_data, jikanApiData.titleObj, siteType);
            db_data = {...db_data, ...temp};
            updateFields = {...updateFields, ...temp};
            jikanApiFields = Jikan.getApiFields(jikanApiData);
            if (jikanApiFields) {
                if (jikanApiFields.jikanPoster && db_data.posters.length === 0 && db_data.poster_s3 === null) {
                    changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingJikanPosterToS3);
                    const posterAdded = await uploadPosterAndAddToData(db_data, jikanApiFields.jikanPoster, false, false);
                    if (posterAdded) {
                        updateFields.poster_s3 = db_data.poster_s3;
                        updateFields.posters = db_data.posters;
                    }
                }

                if (jikanApiFields.youtubeTrailer) {
                    // TODO : save youtube trailer url
                    // db_data = {...db_data, ...TTTT};
                    // updateFields = {...updateFields, ...TTTT};
                }

                updateFields = {...updateFields, ...jikanApiFields.updateFields};
                if (db_data.type.includes('movie') && updateFields.year) {
                    updateFields.endYear = updateFields.year;
                }

                if (db_data.apiIds.jikanID !== jikanApiFields.jikanID && jikanApiFields.jikanID) {
                    db_data.apiIds.jikanID = jikanApiFields.jikanID;
                    updateFields.apiIds = db_data.apiIds;
                }

                updateSpecificFields(db_data, updateFields, jikanApiFields, 'jikan');
                const currentRating = updateFields.rating ? updateFields.rating : db_data.rating;
                currentRating.myAnimeList = jikanApiFields.myAnimeListScore;
                db_data.rating = currentRating;
                updateFields.rating = currentRating;
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.addingRelatedTitles);
                await Jikan.handleAnimeRelatedTitles(db_data._id, jikanApiFields.jikanRelatedTitles);
            }
        }
    }

    if (checkForceStopCrawler()) {
        return;
    }
    if (kitsuApiData !== null) {
        kitsuApiFields = KITSU.getApiFields(kitsuApiData);
        if (kitsuApiFields) {
            if (kitsuApiFields.youtubeTrailer) {
                // TODO : save youtube trailer url
                // db_data = {...db_data, ...TTTT};
                // updateFields = {...updateFields, ...TTTT};
            }

            if (db_data.apiIds.kitsuID !== kitsuApiFields.kitsuID && kitsuApiFields.kitsuID) {
                db_data.apiIds.kitsuID = kitsuApiFields.kitsuID;
                updateFields.apiIds = db_data.apiIds;
            }
            if (db_data.status === 'unknown' || !db_data.type.includes('anime')) {
                db_data.status = kitsuApiFields.status;
                updateFields.status = kitsuApiFields.status;
                db_data.endYear = kitsuApiFields.endYear;
                updateFields.endYear = kitsuApiFields.endYear;
            }
            if (kitsuApiFields.rated && (!db_data.rated || db_data.rated === 'Not Rated')) {
                db_data.rated = kitsuApiFields.rated;
                updateFields.rated = kitsuApiFields.rated;
            }
            if (kitsuApiFields.duration && kitsuApiFields.duration !== '0 min' && (!db_data.duration || db_data.duration === '0 min')) {
                db_data.duration = kitsuApiFields.duration;
                updateFields.duration = kitsuApiFields.duration;
            }

            const checkKeys = ['year', 'premiered', 'totalDuration', 'animeType'];
            for (let i = 0; i < checkKeys.length; i++) {
                // @ts-expect-error ...
                if (kitsuApiFields[checkKeys[i]] && !db_data[checkKeys[i]]) {
                    // @ts-expect-error ...
                    db_data[checkKeys[i]] = kitsuApiFields[checkKeys[i]];
                    // @ts-expect-error ...
                    updateFields[checkKeys[i]] = kitsuApiFields[checkKeys[i]];
                }
            }

            updateSpecificFields(db_data, updateFields, kitsuApiFields, 'kitsu');

            if (kitsuApiFields.kitsuPoster && (
                (db_data.poster_s3 === null) ||
                (db_data.type.includes('anime') && await checkBetterS3Poster(db_data.posters, sourceName, sitePoster, db_data.poster_s3))
            )) {
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingKitsuPosterToS3);
                const posterAdded = await uploadPosterAndAddToData(db_data, kitsuApiFields.kitsuPoster, false, false);
                if (posterAdded) {
                    updateFields.poster_s3 = db_data.poster_s3;
                    updateFields.posters = db_data.posters;
                }
            }

            if (kitsuApiFields.kitsuPosterCover && db_data.poster_wide_s3 === null) {
                changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingKitsuWidePosterToS3);
                const s3WidePoster = await uploadTitlePosterToS3(db_data.title, db_data.type, db_data.year, kitsuApiFields.kitsuPosterCover, false, true);
                if (s3WidePoster) {
                    db_data.poster_wide_s3 = s3WidePoster;
                    updateFields.poster_wide_s3 = s3WidePoster;
                }
            }
        }
    }

    if (checkForceStopCrawler()) {
        return;
    }
    // if (amvApiData !== null) {
    //     amvApiFields = getAmvApiFields(amvApiData);
    //     if (amvApiFields) {
    //         if (amvApiFields.youtubeTrailer) {
    //             db_data = {...db_data, ...TTTT};
    //             updateFields = {...updateFields, ...TTTT};
    //         }
    //
    //         if (db_data.apiIds.amvID !== amvApiFields.amvID && amvApiFields.amvID) {
    //             db_data.apiIds.amvID = amvApiFields.amvID;
    //             updateFields.apiIds = db_data.apiIds;
    //         }
    //         if (!db_data.apiIds.jikanID && amvApiFields.jikanID) {
    //             db_data.apiIds.jikanID = amvApiFields.jikanID;
    //             updateFields.apiIds = db_data.apiIds;
    //         }
    //         if (db_data.apiIds.gogoID !== amvApiFields.gogoID && amvApiFields.gogoID) {
    //             db_data.apiIds.gogoID = amvApiFields.gogoID;
    //             updateFields.apiIds = db_data.apiIds;
    //         }
    //         if (db_data.status === 'unknown' || !db_data.type.includes('anime')) {
    //             db_data.status = amvApiFields.status;
    //             updateFields.status = amvApiFields.status;
    //             db_data.endYear = amvApiFields.endYear;
    //             updateFields.endYear = amvApiFields.endYear;
    //         }
    //
    //         if (amvApiFields.duration && amvApiFields.duration !== '0 min' && (!db_data.duration || db_data.duration === '0 min')) {
    //             db_data.duration = amvApiFields.duration;
    //             updateFields.duration = amvApiFields.duration;
    //         }
    //
    //         const checkKeys = ['year', 'premiered', 'totalDuration', 'animeType', 'officialSite', 'animeSeason'];
    //         for (let i = 0; i < checkKeys.length; i++) {
    //             if (amvApiFields[checkKeys[i]] && !db_data[checkKeys[i]]) {
    //                 db_data[checkKeys[i]] = amvApiFields[checkKeys[i]];
    //                 updateFields[checkKeys[i]] = amvApiFields[checkKeys[i]];
    //             }
    //         }
    //
    //         updateSpecificFields(db_data, updateFields, amvApiFields, 'amv');
    //
    //         if (amvApiFields.amvPoster && (
    //             (db_data.poster_s3 === null) ||
    //             (db_data.type.includes('anime') && await checkBetterS3Poster(db_data.posters, sourceName, sitePoster, db_data.poster_s3))
    //         )) {
    //             changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingAmvPosterToS3);
    //             let posterAdded = await uploadPosterAndAddToData(db_data, amvApiFields.amvPoster, false, false);
    //             if (posterAdded) {
    //                 updateFields.poster_s3 = db_data.poster_s3;
    //                 updateFields.posters = db_data.posters;
    //             }
    //         }
    //
    //         if (amvApiFields.amvPosterCover && db_data.poster_wide_s3 === null) {
    //             changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingAmvWidePosterToS3);
    //             let s3WidePoster = await uploadTitlePosterToS3(db_data.title, db_data.type, db_data.year, amvApiFields.amvPosterCover, false, true);
    //             if (s3WidePoster) {
    //                 db_data.poster_wide_s3 = s3WidePoster;
    //                 updateFields.poster_wide_s3 = s3WidePoster;
    //             }
    //         }
    //     }
    // }

    if (omdbApiFields && omdbApiFields.poster && db_data.posters.length === 0 && db_data.poster_s3 === null) {
        const imageUrl = omdbApiFields.poster.replace(/_SX\d+(?=\.jpg)/i, '');
        changePageLinkStateFromCrawlerStatus(pageLink, linkStateMessages.updateTitle.uploadingOmdbPosterToS3);
        const posterAdded = await uploadPosterAndAddToData(db_data, imageUrl, true, false);
        if (posterAdded) {
            updateFields.poster_s3 = db_data.poster_s3;
            updateFields.posters = db_data.posters;
        }
    }

    const ratingUpdated = handleSiteRating(db_data.rating, siteRating);
    if (ratingUpdated) {
        updateFields.rating = db_data.rating;
    }

    return {
        updateFields,
        allApiData: {
            omdbApiFields, tvmazeApiFields,
            jikanApiFields,
            kitsuApiFields, amvApiFields,
        }
    };
}


async function checkBetterS3Poster(
    prevPosters: MoviePoster[],
    sourceName: string,
    newPosterUrl: string,
    prevS3Poster: MoviePosterS3,
    retryCounter: number = 0,
    ): Promise<boolean> {
    try {
        if (!newPosterUrl) {
            return false;
        }
        //replace low quality poster of myAnimeList
        if (prevS3Poster.originalUrl.includes('cdn.myanimelist.net')) {
            return true;
        }
        const prevS3SourceName = prevS3Poster.originalUrl
            .replace(/https:|http:|\/\/|www\./g, '')
            .split('.')[0]
            .replace(/\d+/g, '');
        const newSourceName = newPosterUrl
            .replace(/https:|http:|\/\/|www\./g, '')
            .split('.')[0]
            .replace(/\d+/g, '');
        if (prevS3SourceName === newSourceName || prevS3Poster.size > 300 * 1024) {
            return false;
        }

        let newPosterSize = 0;
        for (let i = 0; i < prevPosters.length; i++) {
            if (prevPosters[i].info.includes(sourceName)) {
                newPosterSize = prevPosters[i].size;
            }
        }
        if (newPosterSize === 0) {
            newPosterSize = await getFileSize(newPosterUrl);
        }
        if (newPosterSize > 0) {
            const diff = ((newPosterSize - prevS3Poster.size) / prevS3Poster.size) * 100;
            if (diff > 25 && newPosterSize < 700 * 1024) { //700kb
                return true;
            }
        }
        return false;
    } catch (error: any) {
        if (((error.response && error.response.status === 404) || error.code === 'ERR_UNESCAPED_CHARACTERS') &&
            decodeURIComponent(newPosterUrl) === newPosterUrl && retryCounter < 1) {
            retryCounter++;
            const fileName = newPosterUrl.replace(/\/$/, '').split('/').pop() ?? '';
            newPosterUrl = newPosterUrl.replace(fileName, encodeURIComponent(fileName));
            return await checkBetterS3Poster(prevPosters, sourceName, newPosterUrl, prevS3Poster, retryCounter);
        }
        saveErrorIfNeeded(error);
        return false;
    }
}

function handleTypeAndTitleUpdate(
    db_data: Movie,
    titleObj: TitleObj,
    siteType: MovieType,
    ): TitleObj {
    const temp = {
        //dont override serial on anime_serial, like 'vinland saga' tagged as serial on some sources
        type: db_data.type.includes('anime') ? db_data.type : siteType,
        ...titleObj,
    };
    //if this anime detected as movie before , add alternate title if needed.
    if (db_data.title !== titleObj.title) {
        temp.alternateTitles.push(db_data.title);
        temp.alternateTitles = removeDuplicateElements(temp.alternateTitles);
    }
    return temp;
}

async function handleApiCalls(
    titleData: Movie,
    pageLink: string,
    ): Promise<any> {

    let omdbApiData, tvmazeApiData, kitsuApiData, amvApiData;
    if (titleData.type.includes('serial')) {
        const results = await Promise.allSettled([
            handle_OMDB_TvMaze_ApiCall(titleData, 'omdb', pageLink),
            handle_OMDB_TvMaze_ApiCall(titleData, 'tvmaze', pageLink),
            handle_OMDB_TvMaze_ApiCall(titleData, 'kitsu', pageLink),
            handle_OMDB_TvMaze_ApiCall(titleData, 'amv', pageLink),
        ]);
        omdbApiData = results[0].status === 'fulfilled' ? results[0].value : null;
        tvmazeApiData = results[1].status === 'fulfilled' ? results[1].value : null;
        kitsuApiData = results[2].status === 'fulfilled' ? results[2].value : null;
        amvApiData = results[3].status === 'fulfilled' ? results[3].value : null;
    } else {
        const results = await Promise.allSettled([
            handle_OMDB_TvMaze_ApiCall(titleData, 'omdb', pageLink),
            handle_OMDB_TvMaze_ApiCall(titleData, 'kitsu', pageLink),
            handle_OMDB_TvMaze_ApiCall(titleData, 'amv', pageLink),
        ]);
        omdbApiData = results[0].status === 'fulfilled' ? results[0].value : null;
        kitsuApiData = results[1].status === 'fulfilled' ? results[1].value : null;
        amvApiData = results[2].status === 'fulfilled' ? results[2].value : null;
        tvmazeApiData = null;
    }
    return {omdbApiData, tvmazeApiData, kitsuApiData, amvApiData};
}

async function handle_OMDB_TvMaze_ApiCall(
    titleData: Movie,
    apiName: string,
    pageLink: string,
    ): Promise<any> {
    let searchTitle = (apiName === 'omdb') ? titleData.rawTitle || titleData.title : titleData.title;
    let result;
    if (apiName === 'omdb') {
        result = await OMDB.getApiData(
            searchTitle,
            titleData.alternateTitles,
            titleData.titleSynonyms,
            '',
            titleData.premiered,
            titleData.type,
            true);
    } else if (apiName === 'tvmaze') {
        result = await TVMaze.getApiData(
            searchTitle,
            titleData.alternateTitles,
            titleData.titleSynonyms,
            titleData.apiIds.imdbID,
            titleData.premiered,
            titleData.type,
            true);
    } else if (apiName === 'kitsu') {
        result = await KITSU.getApiData(
            searchTitle,
            [],
            [],
            titleData.apiIds.kitsuID,
            titleData.year,
            titleData.type,
            );
    } else if (apiName === 'amv') {
        // result = await getAmvApiData(searchTitle, titleData.alternateTitles, titleData.year, titleData.type, titleData.apiIds.amvID);
        result = null
    }

    if (result || apiName === 'kitsu' || apiName === 'amv') {
        partialChangePageLinkStateFromCrawlerStatus(pageLink, apiName, apiName + ':done');
        return result;
    } else {
        const japaneseRegex = /[\u3000-\u303F]|[\u3040-\u309F]|[\u30A0-\u30FF]|[\uFF00-\uFFEF]|[\u4E00-\u9FAF]|[\u2605-\u2606]|[\u2190-\u2195]|\u203B/gi;
        searchTitle = replaceSpecialCharacters(searchTitle.toLowerCase());
        let alternateTitles = titleData.alternateTitles
            .map(item => replaceSpecialCharacters(item.toLowerCase()))
            .filter(item => item !== searchTitle && !item.match(japaneseRegex));
        alternateTitles = removeDuplicateElements(alternateTitles);

        const newAlternateTitles = [...alternateTitles, titleData.rawTitle];
        for (let i = 0; i < alternateTitles.length; i++) {
            result = (apiName === 'omdb')
                ? await OMDB.getApiData(
                    alternateTitles[i],
                    newAlternateTitles,
                    titleData.titleSynonyms,
                    '',
                    titleData.premiered,
                    titleData.type,
                    true)
                : await TVMaze.getApiData(
                    alternateTitles[i],
                    newAlternateTitles,
                    titleData.titleSynonyms,
                    titleData.apiIds.imdbID,
                    titleData.premiered,
                    titleData.type,
                    true);
            if (result) {
                partialChangePageLinkStateFromCrawlerStatus(pageLink, apiName, apiName + ':done');
                return result;
            }
        }
    }
    partialChangePageLinkStateFromCrawlerStatus(pageLink, apiName, apiName + ':done');
    return null;
}

function updateSpecificFields(
    oldData: Movie,
    updateFields: any,
    apiFields: any,
    apiName: string,
    ): void {
    if (
        (apiName === 'jikan' && apiFields.summary_en) ||
        ((!oldData.summary.english || oldData.summary.english.length < apiFields.summary_en.replace(/([.…])+$/, '')) && apiFields.summary_en)
    ) {
        oldData.summary.english = apiFields.summary_en.replace(/([.…])+$/, '');
        oldData.summary.english_source = apiName;
        updateFields.summary = oldData.summary;
    }
    //---------------------
    const isAnime = (apiName === 'jikan' || apiName === 'kitsu' || apiName === 'amv' || ((apiName === 'tvmaze' || apiName === 'omdb') && apiFields.isAnime));
    const isAnimation = (apiName === 'tvmaze' && apiFields.isAnimation);
    const newGenres = getNewGenres(oldData, apiFields.genres || [], isAnime, isAnimation);
    if (newGenres) {
        oldData.genres = newGenres;
        updateFields.genres = newGenres;
    }
    //--------------------
    if (apiName === 'jikan') {
        if ((!updateFields.status && oldData.status === 'unknown') ||
            (updateFields.status && updateFields.status === 'unknown')) {
            updateFields.status = apiFields.status;
            updateFields.endYear = apiFields.endYear;
        }
    }
}

function getNewGenres(
    data: Movie,
    apiGenres: string[],
    isAnime: boolean,
    isAnimation: boolean,
    ): string[] | null {
    let newGenres = [...data.genres, ...apiGenres];
    if (isAnimation && !isAnime) {
        newGenres.push('animation');
    }
    newGenres = removeDuplicateElements(newGenres);
    if (newGenres.length !== data.genres.length) {
        return newGenres;
    } else {
        const oldGenres = data.genres;
        for (let i = 0; i < newGenres.length; i++) {
            if (newGenres[i] !== oldGenres[i]) {
                return newGenres;
            }
        }
        return null;
    }
}

async function updateSeasonsField(
    db_data: Movie,
    sourceName: string,
    site_links: DownloadLink[],
    siteWatchOnlineLinks: DownloadLink[],
    torrentLinks: DownloadLink[],
    totalSeasons: number,
    omdbApiFields: OMDBFields | null,
    tvmazeApiFields: TVMazeFields | null,
    titleExist: boolean,
    ): Promise<any> {

    const fields: any = {};
    const {
        seasonsUpdateFlag,
        nextEpisodeUpdateFlag
    } = await handleSeasonEpisodeUpdate(db_data, sourceName, site_links, siteWatchOnlineLinks, torrentLinks, totalSeasons, omdbApiFields, tvmazeApiFields, titleExist);

    if (seasonsUpdateFlag) {
        fields.seasons = db_data.seasons;
        fields.endYear = getEndYear(db_data.seasons, db_data.status, db_data.year);
        fields.seasonEpisode = getSeasonEpisode(db_data.seasons);
    }

    const newTotalDuration = getTotalDuration(db_data.seasons, db_data.latestData, db_data.type);
    if (db_data.totalDuration !== newTotalDuration) {
        fields.totalDuration = newTotalDuration;
    }

    if (nextEpisodeUpdateFlag) {
        fields.nextEpisode = db_data.nextEpisode;
    }
    return fields;
}

function handleSiteRating(
    rating: MovieRates,
    siteRating: MovieRates | null,
    ): boolean {
    try {
        if (!siteRating) {
            return false;
        }

        let update = false;
        if (rating.imdb === 0 && siteRating.imdb) {
            rating.imdb = siteRating.imdb;
            update = true;
        }
        if (rating.rottenTomatoes === 0 && siteRating.rottenTomatoes) {
            rating.rottenTomatoes = siteRating.rottenTomatoes;
            update = true;
        }
        if (rating.metacritic === 0 && siteRating.metacritic) {
            rating.metacritic = siteRating.metacritic;
            update = true;
        }
        if (rating.myAnimeList === 0 && siteRating.myAnimeList) {
            rating.myAnimeList = siteRating.myAnimeList;
            update = true;
        }
        return update;
    } catch (error) {
        saveError(error);
        return false;
    }
}

async function uploadPosterAndAddToData(
    data: Movie,
    imageUrl: string,
    forceUpload: boolean = false,
    isWide: boolean = false,
    ): Promise<boolean> {
    const s3poster = await uploadTitlePosterToS3(data.title, data.type, data.year, imageUrl, forceUpload, isWide);
    if (s3poster) {
        data.poster_s3 = s3poster;
        data.posters.push({
            url: s3poster.url,
            info: 's3Poster',
            size: s3poster.size,
            vpnStatus: s3poster.vpnStatus,
            thumbnail: s3poster.thumbnail,
            blurHash: s3poster.blurHash,
        });
        data.posters = sortPosters(data.posters);
        return true;
    }
    return false;
}
