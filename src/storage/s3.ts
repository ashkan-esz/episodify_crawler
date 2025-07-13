import config from '@/config';
import { updateCronJobsStatus } from '@/jobs/job.status';
import { S3FilesRepo } from '@/repo';
import { S3Client } from 'bun';
import { type MovieType, VPNStatus } from '@/types';
import type { MoviePosterS3 } from '@/types/movie';
import { FetchUtils } from '@/utils';
import { getArrayBufferResponse } from '@utils/axios';
import { getDecodedLink } from '@utils/crawler';
import { saveError, saveErrorIfNeeded } from '@utils/logger';
import PQueue from 'p-queue';

const s3 = new S3Client({
    region: 'default',
    // forcePathStyle: false,
    endpoint: config.CLOUAD_STORAGE_ENDPOINT,
    accessKeyId: config.CLOUAD_STORAGE_ACCESS_KEY,
    secretAccessKey: config.CLOUAD_STORAGE_SECRET_ACCESS_KEY,
    retry: 5,
    // maxAttempts: 5, // Not directly supported as an option in Bun.S3Client constructor
    // httpOptions: {
    //     timeout: 5 * 60 * 1000 // 5 minutes - Connection timeout handled differently in Bun
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
    staticFiles: `${config.BUCKET_NAME_PREFIX}serverstatic`,
    cast: `${config.BUCKET_NAME_PREFIX}cast`,
    downloadSubtitle: `${config.BUCKET_NAME_PREFIX}download-subtitle`,
    poster: `${config.BUCKET_NAME_PREFIX}poster`,
    downloadTrailer: `${config.BUCKET_NAME_PREFIX}download-trailer`,
    profileImage: `${config.BUCKET_NAME_PREFIX}profile-image`,
    downloadApp: `${config.BUCKET_NAME_PREFIX}download-app`,
    // backup: `${config.BUCKET_NAME_PREFIX}downloader-db-backup`,
    mediaFile: `${config.BUCKET_NAME_PREFIX}media-file`,
});

export function getS3Client(): S3Client {
    return s3;
}

export const s3VpnStatus = VPNStatus.ALL_OK;

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
    retryCounter = 0,
    retryWithSleepCounter = 0,
): Promise<any> {
    try {
        if (!originalUrl) {
            return null;
        }
        const fileUrl = `https://${bucketNamesObject.downloadSubtitle}.${bucketsEndpointSuffix}/${fileName}`;
        if (retryCounter === 0) {
            const exist = await checkFileExist(bucketNamesObject.downloadSubtitle, fileName);
            if (exist) {
                return {
                    url: fileUrl,
                    originalUrl: '',
                    size: await FetchUtils.getFileSize(fileUrl),
                    vpnStatus: s3VpnStatus,
                };
            }
        }

        const response = await getArrayBufferResponse(originalUrl, cookie);
        if (response === null) {
            return null;
        }

        const s3File = s3.file(fileName, { bucket: bucketNamesObject.downloadSubtitle });
        await s3File.write(response.data, {
            type: response.headers['content-type'], // Maps to ContentType
            // ACL is set via the 'acl' option
            acl: 'public-read',
            // Bun's S3 client automatically handles ContentLength
        });

        return {
            url: fileUrl,
            originalUrl: originalUrl,
            size: Number(response.data.byteLength), // Use byteLength for ArrayBuffer/Uint8Array
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
            error.isFetchError = true;
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
    forceUpload = false,
    isWide = false,
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

export async function uploadImageToS3(
    bucketName: string,
    fileName: string,
    fileUrl: string,
    originalUrl: string,
    forceUpload = false,
    retryCounter = 0,
    retryWithSleepCounter = 0,
): Promise<MoviePosterS3 | null> {
    try {
        if (!originalUrl) {
            return null;
        }

        if (retryCounter === 0 && !forceUpload) {
            const exist = await checkFileExist(bucketName, fileName);
            if (exist) {
                return {
                    url: fileUrl,
                    originalUrl: '',
                    originalSize: 0,
                    size: await FetchUtils.getFileSize(fileUrl),
                    vpnStatus: s3VpnStatus,
                    thumbnail: '',
                    blurHash: '',
                };
            }
        }

        const response = await getArrayBufferResponse(originalUrl);
        if (response === null) {
            return null;
        }
        if (!response.data || response.data?.length === 0) {
            return null;
        }

        const s3File = s3.file(fileName, { bucket: bucketName });
        await s3File.write(response.data, {
            type: 'image/jpeg', // ContentType
            acl: 'public-read', // ACL
            // ContentLength is handled automatically by Bun
        });

        return {
            url: fileUrl,
            originalUrl: originalUrl,
            originalSize: Number(response.data.byteLength),
            size: Number(response.data.byteLength),
            vpnStatus: s3VpnStatus,
            thumbnail: '',
            blurHash: '',
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
                error.isFetchError = true;
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

//------------------------------------------
//------------------------------------------

export async function checkFileExist(
    bucketName: string,
    fileName: string,
    retryCounter = 0,
    retryWithSleepCounter = 0,
): Promise<boolean> {
    try {
        return await s3.exists(fileName, { bucket: bucketName });
    } catch (error: any) {
        if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
            retryWithSleepCounter++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return await checkFileExist(
                bucketName,
                fileName,
                retryCounter,
                retryWithSleepCounter,
            );
        }
        if (error.code === 'ENOTFOUND' && retryCounter < 2) {
            retryCounter++;
            await new Promise((resolve) => setTimeout(resolve, 200));
            return await checkFileExist(
                bucketName,
                fileName,
                retryCounter,
                retryWithSleepCounter,
            );
        }
        error.filePath = 'cloudStorage > checkFileExist';
        saveErrorIfNeeded(error);
        return false;
    }
}

//------------------------------------------
//------------------------------------------

export async function removeProfileImageFromS3(
    fileName: string,
    retryCounter = 0,
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
    retryCounter = 0,
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
    retryCounter = 0,
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
    retryCounter = 0,
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

        //TODO : move this operation into 'episodify_api' project

        const checkBuckets = [
            bucketNamesObject.poster,
            bucketNamesObject.downloadTrailer,
            bucketNamesObject.cast,
        ];

        for (let k = 0; k < checkBuckets.length; k++) {
            updateCronJobsStatus('removeS3UnusedFiles', `checking bucket ${checkBuckets[k]}`);
            let dataBaseFiles: any = [];
            // files that are in use
            if (checkBuckets[k] === bucketNamesObject.poster) {
                dataBaseFiles = await S3FilesRepo.getAllS3PostersDB();
                const widePosters = await S3FilesRepo.getAllS3WidePostersDB();
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
                dataBaseFiles = await S3FilesRepo.getAllS3TrailersDB();
                if (!dataBaseFiles) {
                    continue;
                }
                dataBaseFiles = dataBaseFiles.map((item: any) => item.trailer_s3.url.split('/').pop());
            }
            if (checkBuckets[k] === bucketNamesObject.cast) {
                // Staff images
                const staffImages = await S3FilesRepo.getStaffS3Images();
                if (!staffImages) {
                    continue;
                }

                // Character images
                const characterImages = await S3FilesRepo.getCharacterS3Images();
                if (!characterImages) {
                    continue;
                }

                dataBaseFiles = [
                    staffImages.map((item: any) => item.url.split('/').pop()),
                    characterImages.map((item: any) => item.url.split('/').pop()),
                ];
            }

            let lastKey = '';
            let deleteCounter = 0;
            while (true) {
                const response = await s3.list({
                    maxKeys: 1000,
                    continuationToken: lastKey || undefined,
                }, {
                    bucket: checkBuckets[k],
                });

                lastKey = response.nextContinuationToken || '';
                const files = response.contents;
                if (!files || files.length === 0) {
                    break;
                }

                const promiseQueue = new PQueue({ concurrency: 100 });
                for (let i = 0; i < files.length; i++) {
                    if (dataBaseFiles.includes(files[i].key)) {
                        continue;
                    }

                    deleteCounter++;
                    promiseQueue.add(() => deleteFileFromS3(checkBuckets[k], files[i].key ?? ''));
                }

                await promiseQueue.onIdle();

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
    retryCounter = 0,
    retryWithSleepCounter = 0,
): Promise<string> {
    try {
        await s3.delete(fileName, { bucket: bucketName });
        return 'deleted';
    } catch (error: any) {
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
        saveError(error);
        return 'error';
    }
}

export async function deleteMultipleFilesFromS3(
    bucketName: string,
    filesNames: string[],
    retryCounter = 0,
    retryWithSleepCounter = 0,
): Promise<string> {
    try {
        if (filesNames.length === 0) {
            // return 'no files to delete';
            return 'ok';
        }

        await batchDeleteFiles(filesNames, bucketName);
        return 'deleted';
    } catch (error: any) {
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
        saveError(error);
        return 'error';
    }
}

export async function resetBucket(bucketName: string): Promise<boolean> {
    try {
        console.log(`[S3] Resetting bucket: ${bucketName}`);

        while (true) {
            const listedObjects = await s3.list({}, {
                bucket: bucketName,
            });

            if (!listedObjects.contents || listedObjects.contents.length === 0) {
                break;
            }

            const keysToDelete = listedObjects.contents.map((content) => content.key).filter(Boolean) as string[];
            if (keysToDelete.length > 0) {
                await batchDeleteFiles(keysToDelete, bucketName);
                console.log(`[S3] Successfully deleted ${keysToDelete.length} objects from ${bucketName}`);
            }
        }

        console.log(`[S3] Bucket ${bucketName} is already empty.`);
        return true;
    } catch (error: any) {
        // if (error.code === 'ENOTFOUND' && retryCounter < 2) {
        //     retryCounter++;
        //     await new Promise((resolve) => setTimeout(resolve, 200));
        //     return await createBucket(bucketName, retryCounter, retryWithSleepCounter);
        // }
        // if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
        //     retryWithSleepCounter++;
        //     await new Promise((resolve) => setTimeout(resolve, 1000));
        //     return await createBucket(bucketName, retryCounter, retryWithSleepCounter);
        // }
        // if (error.message === "Cannot read property '#text' of undefined") {
        //     return true;
        // }

        saveError(error);
        return false;
    }
}

async function batchDeleteFiles(fileKeys: string[], bucketName: string): Promise<void> {
    const promiseQueue = new PQueue({ concurrency: 50 });
    for (let i = 0; i < fileKeys.length; i++) {
        promiseQueue.add(() => s3.delete(fileKeys[i], { bucket: bucketName }));
        await promiseQueue.onSizeLessThan(100);
    }
    await promiseQueue.onIdle();
}

// export async function createBuckets() {
//     try {
//         console.log(`creating s3 buckets (${bucketNames.join(', ')})`);
//         const promiseArray = [];
//         for (let i = 0; i < bucketNames.length; i++) {
//             const prom = createBucket(bucketNames[i]);
//             promiseArray.push(prom);
//         }
//         await Promise.allSettled(promiseArray);
//         console.log('creating s3 buckets --done!');
//         console.log();
//     } catch (error) {
//         saveError(error);
//     }
// }

// async function createBucket(
//     bucketName: string,
//     retryCounter = 0,
//     retryWithSleepCounter = 0,
// ): Promise<boolean> {
//     try {
//         const params: CreateBucketCommandInput = {
//             Bucket: bucketName,
//             ACL: bucketName.includes('backup') ? 'private' : 'public-read', // 'private' | 'public-read'
//         };
//         const command = new CreateBucketCommand(params);
//         // const result = await s3.send(command);
//         await s3.send(command);
//         return true;
//     } catch (error: any) {
//         if (error.code === 'ENOTFOUND' && retryCounter < 2) {
//             retryCounter++;
//             await new Promise((resolve) => setTimeout(resolve, 200));
//             return await createBucket(bucketName, retryCounter, retryWithSleepCounter);
//         }
//         if (checkNeedRetryWithSleep(error, retryWithSleepCounter)) {
//             retryWithSleepCounter++;
//             await new Promise((resolve) => setTimeout(resolve, 1000));
//             return await createBucket(bucketName, retryCounter, retryWithSleepCounter);
//         }
//         if (error.message === "Cannot read property '#text' of undefined") {
//             return true;
//         }
//         saveError(error);
//         return false;
//     }
// }

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
