import { sortPostersOrder, sortTrailersOrder } from '@/sourcesArray';
import { SourceVpnStatus } from '@/types';
import {
    Movie, MoviePoster,
    MoviePosterS3,
    MovieTrailer,
    MovieTrailerS3,
} from '@/types/movie';
import { S3Storage } from '@/storage';
import { getFileSize } from '@utils/axios';
import { removeDuplicateLinks } from '@utils/crawler';
import { getImageThumbnail } from '@utils/image';
import { saveError } from '@utils/logger';

const posterSources = sortPostersOrder;
const trailerSources = sortTrailersOrder;
const trailerQualities = ['1080', '720', '360'];

export async function handleSubUpdates(
    db_data: Movie,
    poster: string,
    trailers: MovieTrailer[],
    sourceName: string,
    sourceVpnStatus: SourceVpnStatus,
    ): Promise<{posterChange: boolean, trailerChange: boolean, newTrailer: boolean }> {
    try {
        const posterChange = await handlePosterUpdate(db_data, poster, sourceName, sourceVpnStatus);
        const {trailerChange, newTrailer} = handleTrailerUpdate(db_data, trailers, sourceName);

        return {
            posterChange,
            trailerChange,
            newTrailer,
        };
    } catch (error) {
        saveError(error);
        return {
            posterChange: false,
            trailerChange: false,
            newTrailer: false,
        };
    }
}

async function handlePosterUpdate(
    db_data: Movie,
    poster: string,
    sourceName: string,
    sourceVpnStatus: SourceVpnStatus,
    ): Promise<boolean> {
    if (poster === '') {
        return false;
    }

    let posterExist = false;
    let posterUpdated = false;
    for (let i = 0; i < db_data.posters.length; i++) {
        //found poster
        if (db_data.posters[i].info.includes(sourceName)) {//this poster source exist
            if (db_data.posters[i].url !== poster) { //replace link
                db_data.posters[i].url = poster;
                posterUpdated = true;
            }
            if (db_data.posters[i].vpnStatus !== sourceVpnStatus.poster) { //replace vpnStatus
                db_data.posters[i].vpnStatus = sourceVpnStatus.poster;
                posterUpdated = true;
            }
            posterExist = true;
        }
        //add thumbnail
        if (!db_data.posters[i].thumbnail && db_data.posters[i].info !== 's3Poster') {
            const thumbnailData = await getImageThumbnail(db_data.posters[i].url, true);
            if (thumbnailData) {
                posterUpdated = true;
                db_data.posters[i].thumbnail = thumbnailData.dataURIBase64;
                if (db_data.posters[i].size === 0 && thumbnailData.fileSize) {
                    db_data.posters[i].size = thumbnailData.fileSize;
                }
            }
        }
        //add size
        if (db_data.posters[i].size === 0 && db_data.posters[i].info !== 's3Poster') {
            db_data.posters[i].size = await getFileSize(db_data.posters[i].url);
            posterUpdated = true;
        }
    }

    if (!posterExist) {  //new poster
        const thumbnailData = await getImageThumbnail(poster, true);
        const thumbnail = thumbnailData ? thumbnailData.dataURIBase64 : '';
        const fileSize = (thumbnailData && thumbnailData.fileSize)
            ? thumbnailData.fileSize
            : await getFileSize(poster);

        db_data.posters.push({
            url: poster,
            info: sourceName,
            size: fileSize,
            vpnStatus: sourceVpnStatus.poster,
            thumbnail: thumbnail,
            blurHash: "",
        });
    }

    //-------------------------------------
    //-------------------------------------

    const prevLength = db_data.posters.length;
    let s3PosterUpdate = false;
    if (db_data.poster_s3) {
        const prevS3Poster = db_data.posters.find(item => item.info === 's3Poster');
        if (!prevS3Poster) {
            //s3Poster doesn't exist in posters array
            posterUpdated = true;
            if (!db_data.poster_s3.thumbnail) {
                const thumbnailData = await getImageThumbnail(db_data.poster_s3.url, true);
                if (thumbnailData) {
                    s3PosterUpdate = true;
                    db_data.poster_s3.thumbnail = thumbnailData.dataURIBase64;
                    if (!db_data.poster_s3.size) {
                        db_data.poster_s3.size = thumbnailData.fileSize;
                    }
                }
            }
            db_data.posters.push({
                url: db_data.poster_s3.url,
                info: 's3Poster',
                size: db_data.poster_s3.size,
                vpnStatus: db_data.poster_s3.vpnStatus,
                thumbnail: db_data.poster_s3.thumbnail,
                blurHash: db_data.poster_s3.blurHash,
            });
        } else {
            //check s3Poster updated/changed or need update
            if (!db_data.poster_s3.thumbnail) {
                const findPoster = db_data.posters.find(item => item.url === db_data.poster_s3?.originalUrl);
                if (findPoster && findPoster.thumbnail) {
                    s3PosterUpdate = true;
                    db_data.poster_s3.thumbnail = findPoster.thumbnail;
                    if (!db_data.poster_s3.size && findPoster.size && findPoster.size < 1024 * 1024) {
                        db_data.poster_s3.size = findPoster.size;
                        db_data.poster_s3.originalSize = findPoster.size;
                    }
                } else {
                    const thumbnailData = await getImageThumbnail(db_data.poster_s3.url, true);
                    if (thumbnailData) {
                        s3PosterUpdate = true;
                        db_data.poster_s3.thumbnail = thumbnailData.dataURIBase64;
                        if (!db_data.poster_s3.size) {
                            db_data.poster_s3.size = thumbnailData.fileSize;
                        }
                    }
                }
            }
            if (
                prevS3Poster.url !== db_data.poster_s3.url ||
                prevS3Poster.size !== db_data.poster_s3.size ||
                prevS3Poster.vpnStatus !== db_data.poster_s3.vpnStatus ||
                prevS3Poster.thumbnail !== db_data.poster_s3.thumbnail
            ) {
                s3PosterUpdate = true;
                prevS3Poster.url = db_data.poster_s3.url;
                prevS3Poster.size = db_data.poster_s3.size;
                prevS3Poster.vpnStatus = db_data.poster_s3.vpnStatus;
                prevS3Poster.thumbnail = db_data.poster_s3.thumbnail;
            }
        }
    }
    db_data.posters = removeDuplicateLinks(db_data.posters);
    const prevSort = db_data.posters.map(item => item.url).join(',');
    db_data.posters = sortPosters(db_data.posters);
    const newSort = db_data.posters.map(item => item.url).join(',');
    return (posterUpdated || !posterExist || s3PosterUpdate || prevLength !== db_data.posters.length || prevSort !== newSort);
}

function handleTrailerUpdate(
    db_data: Movie,
    site_trailers: MovieTrailer[],
    sourceName: string,
    ): {trailerChange: boolean, newTrailer: boolean } {

    let trailerChange = false;
    let newTrailer = false;
    for (let i = 0; i < site_trailers.length; i++) {
        let trailer_exist = false;
        for (let j = 0; j < db_data.trailers.length; j++) {
            if (site_trailers[i].info === db_data.trailers[j].info) {//this trailer exist
                if (site_trailers[i].url !== db_data.trailers[j].url) { //replace link
                    db_data.trailers[j].url = site_trailers[i].url;
                    trailerChange = true;
                }
                if (site_trailers[i].vpnStatus !== db_data.trailers[j].vpnStatus) { //replace vpnStatus
                    db_data.trailers[j].vpnStatus = site_trailers[i].vpnStatus;
                    trailerChange = true;
                }
                trailer_exist = true;
                break;
            }
        }
        if (!trailer_exist) { //new trailer
            db_data.trailers.push(site_trailers[i]);
            trailerChange = true;
            newTrailer = true;
        }
    }

    db_data.trailers = removeDuplicateLinks(db_data.trailers);
    const prevSort = db_data.trailers.map(item => item.url).join(',');
    if (site_trailers.length === 0) {
        //remove prev source trailers
        db_data.trailers = db_data.trailers.filter(item => !item.info.includes(sourceName));
    }
    db_data.trailers = sortTrailers(db_data.trailers);
    const newSort = db_data.trailers.map(item => item.url).join(',');
    if (prevSort !== newSort) {
        trailerChange = true;
    }

    return {trailerChange, newTrailer};
}

export async function uploadTitlePosterAndAddToTitleModel(
    titleModel: Movie,
    posterUrl: string,
    updateFields: any = null,
    forceUpload: boolean = false,
    ): Promise<any> {

    if (posterUrl && !posterUrl.includes('/icon/') && !posterUrl.includes('nopicture.')) {
        const s3Poster = await S3Storage.uploadTitlePosterToS3(titleModel.title, titleModel.type, titleModel.year, posterUrl, forceUpload);
        if (s3Poster) {
            if (updateFields) {
                addS3PosterToTitleModel(updateFields, s3Poster);
                return updateFields;
            } else {
                addS3PosterToTitleModel(titleModel, s3Poster);
                return titleModel;
            }
        }
    }
    return updateFields || titleModel;
}

export async function uploadTitleYoutubeTrailerAndAddToTitleModel(
    pageLink: string,
    titleModel: Movie,
    trailerUrl: string,
    updateFields: any = null,
    ): Promise<any> {

    if (trailerUrl) {
        const s3Trailer = await S3Storage.uploadTitleTrailerFromYoutubeToS3(pageLink, titleModel.title, titleModel.type, titleModel.year, trailerUrl);
        if (s3Trailer) {
            if (updateFields) {
                addS3TrailerToTitleModel(updateFields, s3Trailer, titleModel.trailers);
                return updateFields;
            } else {
                addS3TrailerToTitleModel(titleModel, s3Trailer, []);
                return titleModel;
            }
        }
    }

    return updateFields || titleModel;
}

export function addS3PosterToTitleModel(
    titleModel: Movie,
    s3Poster: MoviePosterS3,
    ): Movie {

    if (s3Poster) {
        titleModel.poster_s3 = s3Poster;
        titleModel.posters = [{
            url: s3Poster.url,
            info: 's3Poster',
            size: s3Poster.size,
            vpnStatus: s3Poster.vpnStatus,
            thumbnail: s3Poster.thumbnail,
            blurHash: s3Poster.blurHash,
        }];
    }

    return titleModel;
}

export function addS3TrailerToTitleModel(
    titleModel: Movie,
    s3Trailer: MovieTrailerS3,
    prevTrailers: MovieTrailer[] = [],
    ): Movie {

    if (s3Trailer) {
        titleModel.trailer_s3 = s3Trailer;
        prevTrailers.push({
            url: s3Trailer.url,
            info: 's3Trailer-720p',
            vpnStatus: s3Trailer.vpnStatus,
        });
        titleModel.trailers = sortTrailers(prevTrailers);
        titleModel.trailerDate = Date.now();
    }

    return titleModel;
}

export function checkNeedTrailerUpload(
    s3Trailer: MovieTrailerS3,
    trailers: MovieTrailer[],
    ): boolean {
    if (s3Trailer) {
        return false;
    }
    if (trailers.length === 0) {
        return true;
    }

    const sources: string[] = [];
    for (let i = 0; i < trailers.length; i++) {
        const sourceName = trailers[i].info.split('-')[0];
        if (trailers[i].vpnStatus === 'allOk' && sourceName !== 's3Trailer' && !sources.includes(sourceName)) {
            sources.push(sourceName);
            if (sources.length === 3) {
                return false;
            }
        }
    }
    return true;
}

export function sortPosters(posters: MoviePoster[]): MoviePoster[] {
    const sortedPosters = [];
    for (let i = 0; i < posterSources.length; i++) {
        for (let j = 0; j < posters.length; j++) {
            if (posters[j].info.includes(posterSources[i])) {
                sortedPosters.push(posters[j]);
            }
        }
    }
    if (
        sortedPosters.length > 1 &&
        sortedPosters[0].vpnStatus === 'allOk' && sortedPosters[1].vpnStatus === 'allOk' &&
        !sortedPosters[0].info.includes('s3Poster') && !sortedPosters[1].info.includes('s3Poster') &&
        (sortedPosters[0].size - sortedPosters[1].size) > 200 * 1024 //200kb
    ) {
        const temp = sortedPosters[0];
        sortedPosters[0] = sortedPosters[1];
        sortedPosters[1] = temp;
    }
    return sortedPosters;
}

export function sortTrailers(trailers: MovieTrailer[]): MovieTrailer[] {
    const sortedTrailers = [];

    for (let i = 0; i < trailerSources.length; i++) {
        for (let j = 0; j < trailerQualities.length; j++) {
            for (let k = 0; k < trailers.length; k++) {
                if (trailers[k].info.includes(trailerSources[i]) &&
                    trailers[k].info.includes(trailerQualities[j])) {
                    sortedTrailers.push(trailers[k]);
                }
            }
        }
    }
    return sortedTrailers;
}
