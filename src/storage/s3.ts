import config from '@/config';
import { updateCronJobsStatus } from '@/jobs/job.status';
import {
    getAllS3CastImageDB,
    getAllS3PostersDB,
    getAllS3TrailersDB,
    getAllS3WidePostersDB,
} from '@/repo/s3file';
import { saveCrawlerWarning } from '@/repo/serverAnalysis';
import {
    changePageLinkStateFromCrawlerStatus,
    updateTrailerUploadLimit,
} from '@/status/status';
import { CrawlerErrorMessages } from '@/status/warnings';
import { AbortController } from '@aws-sdk/abort-controller';
import {
    CreateBucketCommand,
    CreateBucketCommandInput,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand, HeadObjectCommandInput,
    ListObjectsCommand,
    ListObjectsCommandInput,
    PutObjectCommand, PutObjectCommandInput,
    S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { MovieType, VPNStatus } from '@/types';
import { MoviePosterS3, MovieTrailerS3 } from '@/types/movie';
import { getArrayBufferResponse, getFileSize } from '@utils/axios';
import { getDecodedLink } from '@utils/crawler';
import { compressImage, getImageThumbnail } from '@utils/image';
import { saveError, saveErrorIfNeeded } from '@utils/logger';
// import axios from 'axios';
import ytdl from "@distube/ytdl-core";

const s3 = new S3Client({
    region: 'default',
    forcePathStyle: false,
    endpoint: config.CLOUAD_STORAGE_ENDPOINT,
    credentials: {
        accessKeyId: config.CLOUAD_STORAGE_ACCESS_KEY,
        secretAccessKey: config.CLOUAD_STORAGE_SECRET_ACCESS_KEY,
    },
    maxAttempts: 5,
    // httpOptions: {
    //     timeout: 5 * 60 * 1000 // 5 minutes
    // }
});

// s3 error codes:
// 408: unknown/timeout error
// 500: internal error
// 502: gateway error
// 503: too many request to prefix
// 504: gateway timeout

export const bucketsEndpointSuffix = config.CLOUAD_STORAGE_WEBSITE_ENDPOINT.replace(
    /https?:\/\//,
    '',
);

export const bucketNames = Object.freeze(
    [
        'serverstatic',
        'cast',
        'download-subtitle',
        'poster',
        'download-trailer',
        'profile-image',
        'download-app',
        'downloader-db-backup',
        'media-file',
    ].map((item) => config.BUCKET_NAME_PREFIX + item),
);

export const bucketNamesObject = Object.freeze({
    staticFiles: config.BUCKET_NAME_PREFIX + 'serverstatic',
    cast: config.BUCKET_NAME_PREFIX + 'cast',
    downloadSubtitle: config.BUCKET_NAME_PREFIX + 'download-subtitle',
    poster: config.BUCKET_NAME_PREFIX + 'poster',
    downloadTrailer: config.BUCKET_NAME_PREFIX + 'download-trailer',
    profileImage: config.BUCKET_NAME_PREFIX + 'profile-image',
    downloadApp: config.BUCKET_NAME_PREFIX + 'download-app',
    backup: config.BUCKET_NAME_PREFIX + 'downloader-db-backup',
    mediaFile: config.BUCKET_NAME_PREFIX + 'media-file',
});

export function getS3Client(): S3Client {
    return s3;
}

export const s3VpnStatus = VPNStatus.ALL_OK;
export const trailerUploadConcurrency = 6;
export const saveWarningTimeout = 180 * 1000; //180s

let uploadingTrailer = 0;

async function waitForTrailerUpload(): Promise<void> {
    let start = Date.now();
    while (uploadingTrailer >= trailerUploadConcurrency) {
        updateTrailerUploadLimit(uploadingTrailer, trailerUploadConcurrency);
        if (Date.now() - start > saveWarningTimeout) {
            start = Date.now();
            saveCrawlerWarning(CrawlerErrorMessages.trailerUploadHighWait(180));
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    uploadingTrailer++;
    updateTrailerUploadLimit(uploadingTrailer, trailerUploadConcurrency);
}

function decreaseUploadingTrailerNumber(): void {
    uploadingTrailer--;
    updateTrailerUploadLimit(uploadingTrailer, trailerUploadConcurrency);
}

//------------------------------------------
//------------------------------------------

export async function uploadCastImageToS3ByURl(
    name: string,
    castType: string,
    id: number,
    originalUrl: string,
    ): Promise<MoviePosterS3 | null> {
    try {
        const fileName = getFileName(name, '', castType, id.toString(), 'jpg');
        const fileUrl = `https://${bucketNamesObject.cast}.${bucketsEndpointSuffix}/${fileName}`;
        return await uploadImageToS3(bucketNamesObject.cast, fileName, fileUrl, originalUrl);
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function uploadSubtitleToS3ByURl(
    fileName: string,
    cookie: any,
    originalUrl: string,
    retryCounter: number = 0,
    retryWithSleepCounter: number = 0,
): Promise<any> {
    try {
        if (!originalUrl) {
            return null;
        }
        const fileUrl = `https://${bucketNamesObject.downloadSubtitle}.${bucketsEndpointSuffix}/${fileName}`;
        if (retryCounter === 0) {
            const s3Subtitle = await checkFileExist(bucketNamesObject.downloadSubtitle, fileName, fileUrl);
            if (s3Subtitle) {
                return {
                    url: s3Subtitle,
                    originalUrl: "",
                    size: await getFileSize(s3Subtitle),
                    vpnStatus: s3VpnStatus,
                };
            }
        }

        const response = await getArrayBufferResponse(originalUrl, cookie);
        if (response === null) {
            return null;
        }
        const params: PutObjectCommandInput = {
            ContentType: response.headers["content-type"],
            ContentLength: response.data.length.toString(),
            Bucket: bucketNamesObject.downloadSubtitle,
            Body: response.data,
            Key: fileName,
            ACL: 'public-read',
        };
        const command = new PutObjectCommand(params);
        await s3.send(command);
        return {
            url: fileUrl,
            originalUrl: originalUrl,
            size: Number(response.data.length),
            vpnStatus: s3VpnStatus,
        };
    } catch (error: any) {
        if (error.code === 'ENOTFOUND' && retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve => setTimeout(resolve, 200)));
            return await uploadSubtitleToS3ByURl(originalUrl, fileName, cookie, retryCounter, retryWithSleepCounter);
        }
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve => setTimeout(resolve, 1000)));
            return await uploadSubtitleToS3ByURl(originalUrl, fileName, cookie, retryCounter, retryWithSleepCounter);
        }
        if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
            error.isAxiosError = true;
            error.url = originalUrl;
            error.filePath = 'cloudStorage > uploadSubtitleToS3ByURl';
        }
        saveError(error);
        return null;
    }
}

export async function uploadTitlePosterToS3(
    title: string,
    type: MovieType,
    year: string,
    originalUrl: string,
    forceUpload: boolean = false,
    isWide: boolean = false,
    ): Promise<MoviePosterS3 | null> {
    try {
        const extra = isWide ? 'wide' : '';
        const fileName = getFileName(title, type, year, extra, 'jpg');
        const fileUrl = `https://${bucketNamesObject.poster}.${bucketsEndpointSuffix}/${fileName}`;
        return await uploadImageToS3(bucketNamesObject.poster, fileName, fileUrl, originalUrl, forceUpload);
    } catch (error) {
        saveError(error);
        return null;
    }
}

//------------------------------------------
//------------------------------------------

export async function uploadTitleTrailerFromYoutubeToS3(
    pageLink: string,
    title: string,
    type: MovieType,
    year: string,
    originalUrl: string,
    retryCounter: number = 0,
    retryWithSleepCounter: number = 0,
    ): Promise<MovieTrailerS3 | null> {
    try {
        if (!originalUrl) {
            return null;
        }
        const fileName = getFileName(title, type, year, '', 'mp4');
        const fileUrl = `https://${bucketNamesObject.downloadTrailer}.${bucketsEndpointSuffix}/${fileName}`;
        if (retryCounter === 0) {
            let s3Trailer = await checkFileExist(bucketNamesObject.downloadTrailer, fileName, fileUrl);
            if (!s3Trailer && year) {
                const fileName2 = getFileName(title, type, '', '', 'mp4');
                s3Trailer = await checkFileExist(bucketNamesObject.downloadTrailer, fileName2, fileUrl);
            }
            if (s3Trailer) {
                return {
                    url: s3Trailer,
                    originalUrl: "",
                    size: await getFileSize(s3Trailer),
                    vpnStatus: s3VpnStatus,
                };
            }
        }

        await waitForTrailerUpload();
        // eslint-disable-next-line no-async-promise-executor
        return await new Promise(async (resolve, reject) => {
            const abortController = new AbortController();
            let videoReadStream: any = null;
            try {
                if (!ytdl.validateURL(originalUrl)) {
                    return resolve(null);
                }
                videoReadStream = ytdl(originalUrl, {
                    filter: 'audioandvideo',
                    quality: "highestvideo",
                    highWaterMark: 1 << 25,
                });

                videoReadStream.on('error', (err: any) => {
                    videoReadStream.destroy();
                    videoReadStream.emit('close');
                    abortController.abort();
                    reject(err);
                });

                const fileSize = await uploadFileToS3(bucketNamesObject.downloadTrailer, videoReadStream, fileName, fileUrl, true, pageLink);
                decreaseUploadingTrailerNumber();
                resolve({
                    url: fileUrl,
                    originalUrl: originalUrl,
                    size: fileSize,
                    vpnStatus: s3VpnStatus,
                });
            } catch (error2) {
                if (videoReadStream) {
                    videoReadStream.destroy();
                }
                reject(error2);
            }
        });

    } catch (error: any) {
        decreaseUploadingTrailerNumber();
        if (
            ((error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') && retryCounter < 4) ||
            (error.statusCode === 410 && retryCounter < 1)
        ) {
            retryCounter++;
            await new Promise((resolve => setTimeout(resolve, 2000)));
            return await uploadTitleTrailerFromYoutubeToS3(pageLink, title, type, year, originalUrl, retryCounter, retryWithSleepCounter);
        }
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve => setTimeout(resolve, 2000)));
            return await uploadTitleTrailerFromYoutubeToS3(pageLink, title, type, year, originalUrl, retryCounter, retryWithSleepCounter);
        }
        if (error.$metadata?.httpStatusCode === 408 && retryWithSleepCounter < 5) {
            retryWithSleepCounter++;
            await new Promise((resolve => setTimeout(resolve, 15000)));
            return await uploadTitleTrailerFromYoutubeToS3(pageLink, title, type, year, originalUrl, retryCounter, retryWithSleepCounter);
        }
        // if (error.statusCode === 410 || error.statusCode === 403) {
        //     return await uploadTitleTrailerFromYoutubeToS3_youtubeDownloader(pageLink, title, type, year, originalUrl, false);
        // }
        if (error.name !== "AbortError" && error.message !== 'Video unavailable' && !error.message.includes('This is a private video')) {
            saveError(error);
        }
        return null;
    }
}

// export async function uploadTitleTrailerFromYoutubeToS3_youtubeDownloader(
//     pageLink: string,
//     title: string,
//     type: MovieType,
//     year: string,
//     originalUrl: string,
//     checkTrailerExist: boolean = true,
//     retryCounter: number = 0,
//     retryWithSleepCounter: number = 0,
// ): Promise<MovieTrailerS3 | null> {
//     try {
//         if (!originalUrl) {
//             return null;
//         }
//         const fileName = getFileName(title, type, year, '', 'mp4');
//         const fileUrl = `https://${bucketNamesObject.downloadTrailer}.${bucketsEndpointSuffix}/${fileName}`;
//         if (retryCounter === 0 && checkTrailerExist) {
//             let s3Trailer = await checkFileExist(bucketNamesObject.downloadTrailer, fileName, fileUrl);
//             if (!s3Trailer && year) {
//                 const fileName2 = getFileName(title, type, '', '', 'mp4');
//                 s3Trailer = await checkFileExist(bucketNamesObject.downloadTrailer, fileName2, fileUrl);
//             }
//             if (s3Trailer) {
//                 return {
//                     url: s3Trailer,
//                     originalUrl: "",
//                     size: await getFileSize(s3Trailer),
//                     vpnStatus: s3VpnStatus,
//                 };
//             }
//         }
//
//         await waitForTrailerUpload();
//
//         const remoteBrowserData = await getYoutubeDownloadLink(originalUrl);
//         if (!remoteBrowserData) {
//             decreaseUploadingTrailerNumber();
//             return null;
//         }
//
//         const response = await axios.get(remoteBrowserData.downloadUrl, {
//             responseType: "arraybuffer",
//             responseEncoding: "binary"
//         });
//
//         const fileSize = await uploadFileToS3(bucketNamesObject.downloadTrailer, response.data, fileName, fileUrl, true, pageLink);
//         decreaseUploadingTrailerNumber();
//         return ({
//             url: fileUrl,
//             originalUrl: originalUrl,
//             size: fileSize,
//             vpnStatus: s3VpnStatus,
//         });
//     } catch (error: any) {
//         decreaseUploadingTrailerNumber();
//         if ((error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') && retryCounter < 2) {
//             retryCounter++;
//             await new Promise((resolve => setTimeout(resolve, 2000)));
//             return await uploadTitleTrailerFromYoutubeToS3_youtubeDownloader(pageLink, title, type, year, originalUrl, checkTrailerExist, retryCounter, retryWithSleepCounter);
//         }
//         if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
//             retryWithSleepCounter++;
//             await new Promise((resolve => setTimeout(resolve, 2000)));
//             return await uploadTitleTrailerFromYoutubeToS3_youtubeDownloader(pageLink, title, type, year, originalUrl, checkTrailerExist, retryCounter, retryWithSleepCounter);
//         }
//         if (error.$metadata?.httpStatusCode === 408 && retryWithSleepCounter < 5) {
//             retryWithSleepCounter++;
//             await new Promise((resolve => setTimeout(resolve, 15000)));
//             return await uploadTitleTrailerFromYoutubeToS3_youtubeDownloader(pageLink, title, type, year, originalUrl, checkTrailerExist, retryCounter, retryWithSleepCounter);
//         }
//         if (error.response.status !== 403) {
//             saveError(error);
//         }
//         return null;
//     }
// }

//------------------------------------------
//------------------------------------------

export async function uploadImageToS3(
    bucketName: string,
    fileName: string,
    fileUrl: string,
    originalUrl: string,
    forceUpload: boolean = false,
    retryCounter: number = 0,
    retryWithSleepCounter: number = 0,
    ): Promise<MoviePosterS3 | null> {
    try {
        if (!originalUrl) {
            return null;
        }

        if (retryCounter === 0 && !forceUpload) {
            const s3Image = await checkFileExist(bucketName, fileName, fileUrl);
            if (s3Image) {
                const thumbnailData = await getImageThumbnail(s3Image, true);
                return {
                    url: s3Image,
                    originalUrl: "",
                    originalSize: 0,
                    size: (thumbnailData && thumbnailData.fileSize) ? thumbnailData.fileSize : await getFileSize(s3Image),
                    vpnStatus: s3VpnStatus,
                    thumbnail: thumbnailData ? thumbnailData.dataURIBase64 : '',
                    blurHash: "",
                };
            }
        }

        const response = await getArrayBufferResponse(originalUrl);
        if (response === null) {
            return null;
        }
        if (response.data?.length === 0) {
            return null;
        }
        const dataBuffer = await compressImage(response.data);
        if (dataBuffer === null) {
            return null;
        }

        const params: PutObjectCommandInput = {
            ContentType: 'image/jpeg',
            ContentLength: dataBuffer.length.toString(),
            Bucket: bucketName,
            Body: dataBuffer,
            Key: fileName,
            ACL: 'public-read',
        };
        const command = new PutObjectCommand(params);
        await s3.send(command);

        const thumbnailData = await getImageThumbnail(response.data);
        return {
            url: fileUrl,
            originalUrl: originalUrl,
            originalSize: Number(response.data.length),
            size: Number(dataBuffer.length),
            vpnStatus: s3VpnStatus,
            thumbnail: thumbnailData ? thumbnailData.dataURIBase64 : '',
            blurHash: "",
        };
    } catch (error: any) {
        if ((error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') && retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve => setTimeout(resolve, 200)));
            return await uploadImageToS3(bucketName, fileName, fileUrl, originalUrl, forceUpload, retryCounter, retryWithSleepCounter);
        }
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve => setTimeout(resolve, 1000)));
            return await uploadImageToS3(bucketName, fileName, fileUrl, originalUrl, forceUpload, retryCounter, retryWithSleepCounter);
        }
        if ((error.response && error.response.status === 404) || error.code === 'ERR_UNESCAPED_CHARACTERS') {
            if (decodeURIComponent(originalUrl) === originalUrl && retryCounter < 3) {
                const temp = originalUrl.replace(/\/$/, '').split('/').pop();
                if (temp) {
                    const url = originalUrl.replace(temp, encodeURIComponent(temp));
                    retryCounter++;
                    await new Promise((resolve => setTimeout(resolve, 200)));
                    return await uploadImageToS3(bucketName, fileName, fileUrl, url, forceUpload, retryCounter, retryWithSleepCounter);
                }
            }
            if (error.response?.status !== 404) {
                error.isAxiosError = true;
                error.url = originalUrl;
                error.filePath = 'cloudStorage > uploadImageToS3 > ' + bucketName;
                await saveError(error);
            }
            return null;
        }
        if (error.code !== 'EAI_AGAIN') {
            saveErrorIfNeeded(error);
        }
        return null;
    }
}

async function uploadFileToS3(
    bucketName: string,
    file: any,
    fileName: string,
    fileUrl: string,
    extraCheckFileSize: boolean = true,
    pageLink: string): Promise<number> {
    const parallelUploads3 = new Upload({
        client: s3,
        params: {
            Bucket: bucketName,
            Body: file,
            Key: fileName,
            ACL: 'public-read',
        },
        queueSize: 4, // optional concurrency configuration
        partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
        leavePartsOnError: false, // optional manually handle dropped parts
    });

    let fileSize = 0;
    parallelUploads3.on("httpUploadProgress", (progress) => {
        const uploaded = ((progress?.loaded ?? 0) / (1024 * 1024)).toFixed(1);
        if (pageLink) {
            changePageLinkStateFromCrawlerStatus(pageLink, `  (Uploading ${uploaded}/??)`, true);
        }
        fileSize = progress.total ?? 0;
    });

    // let uploadResult = await parallelUploads3.done();
    await parallelUploads3.done();

    if (!fileSize && extraCheckFileSize) {
        fileSize = await getFileSize(fileUrl);
    }
    return fileSize;
}

//------------------------------------------
//------------------------------------------

export async function getDbBackupFilesList(): Promise<any[]> {
    try {
        const params: ListObjectsCommandInput = {
            Bucket: bucketNamesObject.backup,
            MaxKeys: 1000,
        };
        const command = new ListObjectsCommand(params);
        const response = await s3.send(command);
        const files = response.Contents;
        return files || [];
    } catch (error) {
        saveError(error);
        return [];
    }
}

export async function removeDbBackupFileFromS3(
    fileName: string,
    retryCounter: number = 0,
): Promise<string> {
    fileName = getDecodedLink(fileName);
    const result = await deleteFileFromS3(bucketNamesObject.backup, fileName);
    if (result === 'error' && retryCounter < 2) {
        retryCounter++;
        await new Promise((resolve => setTimeout(resolve, 200)));
        return await removeDbBackupFileFromS3(fileName, retryCounter);
    }
    return result;
}

//------------------------------------------
//------------------------------------------

export async function checkFileExist(
    bucketName: string,
    fileName: string,
    fileUrl: string,
    retryCounter: number = 0,
    retryWithSleepCounter: number = 0,
): Promise<string> {
    try {
        const params: HeadObjectCommandInput = {
            Bucket: bucketName,
            Key: fileName,
        };
        const command = new HeadObjectCommand(params);
        const result = await s3.send(command);
        if (result['$metadata'].httpStatusCode === 200) {
            return fileUrl;
        }
        return '';
    } catch (error: any) {
        if (error.code === 'ENOTFOUND' && retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve => setTimeout(resolve, 200)));
            return await checkFileExist(bucketName, fileName,fileUrl, retryCounter, retryWithSleepCounter);
        }
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve => setTimeout(resolve, 1000)));
            return await checkFileExist(bucketName, fileName,fileUrl, retryCounter, retryWithSleepCounter);
        }
        const statusCode = error['$metadata'].httpStatusCode;
        if (statusCode !== 404 && statusCode !== 200) {
            saveError(error);
        }
        return statusCode !== 404 ? fileUrl : '';
    }
}

//------------------------------------------
//------------------------------------------

export async function removeProfileImageFromS3(
    fileName: string,
    retryCounter: number = 0,
): Promise<string> {
    fileName = getDecodedLink(fileName);
    const result = await deleteFileFromS3(bucketNamesObject.profileImage, fileName);
    if (result === 'error' && retryCounter < 2) {
        retryCounter++;
        await new Promise((resolve => setTimeout(resolve, 200)));
        return await removeProfileImageFromS3(fileName, retryCounter);
    }
    return result;
}

export async function deletePosterFromS3(
    fileName: string,
    retryCounter: number = 0,
): Promise<boolean> {
    const result = await deleteFileFromS3(bucketNamesObject.poster, fileName);
    if (result === 'error' && retryCounter < 2) {
        retryCounter++;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return await deletePosterFromS3(fileName, retryCounter);
    }
    return result === 'ok';
}

export async function deleteTrailerFromS3(
    fileName: string,
    retryCounter: number = 0,
): Promise<boolean> {
    const result = await deleteFileFromS3(bucketNamesObject.downloadTrailer, fileName);
    if (result === 'error' && retryCounter < 2) {
        retryCounter++;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return await deleteTrailerFromS3(fileName, retryCounter);
    }
    return result === 'ok';
}

export async function removeAppFileFromS3(
    fileName: string,
    retryCounter: number = 0,
): Promise<string> {
    fileName = getDecodedLink(fileName);
    const result = await deleteFileFromS3(bucketNamesObject.downloadApp, fileName);
    if (result === 'error' && retryCounter < 2) {
        retryCounter++;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return await removeAppFileFromS3(fileName, retryCounter);
    }
    return result;
}

export async function deleteUnusedFiles(retryCounter = 0): Promise<string> {
    try {
        const checkBuckets = [
            bucketNamesObject.poster,
            bucketNamesObject.downloadTrailer,
            bucketNamesObject.cast,
        ];

        for (let k = 0; k < checkBuckets.length; k++) {
            updateCronJobsStatus('removeS3UnusedFiles', 'checking bucket ' + checkBuckets[k]);
            let dataBaseFiles: any = [];
            // files that are in use
            if (checkBuckets[k] === bucketNamesObject.poster) {
                dataBaseFiles = await getAllS3PostersDB();
                const widePosters = await getAllS3WidePostersDB();
                if (!dataBaseFiles && !widePosters) {
                    continue;
                }
                dataBaseFiles = [
                    ...(dataBaseFiles || []).map((item: any) =>
                        item.poster_s3.url.split('/').pop(),
                    ),
                    ...(widePosters || []).map((item: any) =>
                        item.poster_wide_s3.url.split('/').pop(),
                    ),
                ];
            } else if (checkBuckets[k] === bucketNamesObject.downloadTrailer) {
                dataBaseFiles = await getAllS3TrailersDB();
                if (!dataBaseFiles) {
                    continue;
                }
                dataBaseFiles = dataBaseFiles.map((item: any) => item.trailer_s3.url.split('/').pop());
            }
            if (checkBuckets[k] === bucketNamesObject.cast) {
                dataBaseFiles = await getAllS3CastImageDB();
                if (!dataBaseFiles) {
                    continue;
                }
                dataBaseFiles = dataBaseFiles.map((item: any) => item.url.split('/').pop());
            }

            let lastKey = '';
            let deleteCounter = 0;
            while (true) {
                const params: ListObjectsCommandInput = {
                    Bucket: checkBuckets[k],
                    MaxKeys: 1000,
                };
                if (lastKey) {
                    params.Marker = lastKey;
                }
                const command = new ListObjectsCommand(params);
                const response = await s3.send(command);
                const files = response.Contents;
                if (!files || files.length === 0) {
                    break;
                }
                const promiseArray = [];
                for (let i = 0; i < files.length; i++) {
                    if (dataBaseFiles.includes(files[i].Key)) {
                        lastKey = files[i].Key ?? '';
                    } else {
                        deleteCounter++;
                        const deletePromise = deleteFileFromS3(checkBuckets[k], files[i].Key ?? '');
                        promiseArray.push(deletePromise);
                    }
                }
                await Promise.allSettled(promiseArray);
                updateCronJobsStatus(
                    'removeS3UnusedFiles',
                    `checking bucket ${checkBuckets[k]} deleted ${deleteCounter}`,
                );
            }
        }
        return 'ok';
    } catch (error) {
        if (retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return deleteUnusedFiles(retryCounter);
        }
        saveError(error);
        return 'error';
    }
}

export async function deleteFileFromS3(
    bucketName: string,
    fileName: string,
    retryCounter: number = 0,
    retryWithSleepCounter: number = 0,
): Promise<string> {
    try {
        const params = {
            Bucket: bucketName,
            Key: fileName,
        };
        const command = new DeleteObjectCommand(params);
        await s3.send(command);
        return 'ok';
    } catch (error: any) {
        if (error.code === 'ENOTFOUND' && retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve) => setTimeout(resolve, 200));
            return await deleteFileFromS3(
                bucketName,
                fileName,
                retryCounter,
                retryWithSleepCounter,
            );
        }
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return await deleteFileFromS3(
                bucketName,
                fileName,
                retryCounter,
                retryWithSleepCounter,
            );
        }
        saveError(error);
        return 'error';
    }
}

export async function deleteMultipleFilesFromS3(
    bucketName: string,
    filesNames: string[],
    retryCounter: number = 0,
    retryWithSleepCounter: number = 0,
): Promise<string> {
    try {
        const params = {
            Bucket: bucketName,
            Delete: {
                Objects: filesNames.map((item) => ({ Key: item })),
            },
        };
        const command = new DeleteObjectsCommand(params);
        await s3.send(command);
        return 'ok';
    } catch (error: any) {
        if (error.code === 'ENOTFOUND' && retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve) => setTimeout(resolve, 200));
            return await deleteMultipleFilesFromS3(
                bucketName,
                filesNames,
                retryCounter,
                retryWithSleepCounter,
            );
        }
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return await deleteMultipleFilesFromS3(
                bucketName,
                filesNames,
                retryCounter,
                retryWithSleepCounter,
            );
        }
        saveError(error);
        return 'error';
    }
}

export async function resetBucket(bucketName: string): Promise<boolean> {
    //use with caution
    const params = {
        Bucket: bucketName,
    };
    const command = new ListObjectsCommand(params);
    while (true) {
        try {
            const response = await s3.send(command);
            const files = response.Contents;
            if (!files || files.length === 0) {
                return true;
            }
            const promiseArray = [];
            for (let i = 0; i < files.length; i++) {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: bucketName,
                    Key: files[i].Key,
                });
                const deletePromise = s3.send(deleteCommand);
                promiseArray.push(deletePromise);
            }
            await Promise.allSettled(promiseArray);
        } catch (error) {
            saveError(error);
            return false;
        }
    }
}

//------------------------------------------
//------------------------------------------

export async function createBuckets() {
    try {
        console.log(`creating s3 buckets (${bucketNames.join(', ')})`);
        const promiseArray = [];
        for (let i = 0; i < bucketNames.length; i++) {
            const prom = createBucket(bucketNames[i]);
            promiseArray.push(prom);
        }
        await Promise.allSettled(promiseArray);
        console.log('creating s3 buckets --done!');
        console.log();
    } catch (error) {
        saveError(error);
    }
}

async function createBucket(
    bucketName: string,
    retryCounter: number = 0,
    retryWithSleepCounter: number = 0,
): Promise<boolean> {
    try {
        const params: CreateBucketCommandInput = {
            Bucket: bucketName,
            ACL: bucketName.includes('backup') ? 'private' : 'public-read', // 'private' | 'public-read'
        };
        const command = new CreateBucketCommand(params);
        // const result = await s3.send(command);
        await s3.send(command);
        return true;
    } catch (error: any) {
        if (error.code === 'ENOTFOUND' && retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve) => setTimeout(resolve, 200));
            return await createBucket(bucketName, retryCounter, retryWithSleepCounter);
        }
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return await createBucket(bucketName, retryCounter, retryWithSleepCounter);
        }
        if (error.message === "Cannot read property '#text' of undefined") {
            return true;
        }
        saveError(error);
        return false;
    }
}

//------------------------------------------
//------------------------------------------

function checkNeedRetryWithSleep(error: any, retryWithSleepCounter: number): boolean {
    return (
        retryWithSleepCounter < 3 &&
        (error.message === 'S3ServiceException: UnknownError' ||
            error.message === '403: UnknownError' ||
            error.message === '504: UnknownError' ||
            error.message === 'RequestTimeTooSkewed: UnknownError' ||
            (error.response && (error.response.status === 429 || error.response.status >= 500)) ||
            error.statusCode === 429 ||
            error.statusCode >= 500)
    );
}

//------------------------------------------
//------------------------------------------

function getFileName(
    title: string,
    titleType: string,
    year: string,
    extra: string,
    fileType: string,
): string {
    let fileName = titleType + '-' + title + '-' + year + '-' + extra + '.' + fileType;
    fileName = fileName
        .trim()
        .replace(/\s+/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-/g, '')
        .replace('-.', '.');
    if (year && title.endsWith(year)) {
        fileName = fileName.replace('-' + year, '');
    }
    return fileName;
}
