import config from '@/config';
import { ServerAnalysisRepo } from '@/repo';
import { updateImageOperationsLimit } from '@/status/status';
import { CrawlerErrors } from '@/status/warnings';
import { downloadImage } from '@utils/axios';
import { saveError } from '@utils/logger';
import sharp from "sharp";
import * as Sentry from "@sentry/bun";


export const imageOperationsConcurrency = 100;
export const saveWarningTimeout = 90 * 1000; //90s
let imageOperations = 0;

//TODO: remove / deactivate
async function waitForImageOperation() {
    let start = Date.now();
    while (imageOperations >= imageOperationsConcurrency) {
        updateImageOperationsLimit(imageOperations, imageOperationsConcurrency);
        if (Date.now() - start > saveWarningTimeout) {
            start = Date.now();
            ServerAnalysisRepo.saveCrawlerWarning(CrawlerErrors.operations.imageHighWait(saveWarningTimeout/1000));
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    imageOperations++;
    updateImageOperationsLimit(imageOperations, imageOperationsConcurrency);
}

function decreaseImageOperationNumber() {
    imageOperations--;
    updateImageOperationsLimit(imageOperations, imageOperationsConcurrency);
}

//------------------------------------------
//------------------------------------------

export async function compressImage(
    responseData: any,
    activeSize: number = 1024,
    ): Promise<any> {

    await waitForImageOperation();
    try {
        let dataBuffer = responseData;
        if (responseData?.length === null || responseData?.length === 0) {
            return null;
        }
        // reduce image size if size > 1MB
        if (responseData.length > activeSize * 1024) {
            const tempQuality = 50 - (Math.ceil(responseData.length / (1024 * 1024)) - 2) * 5;
            let sharpQuality = Math.max(Math.min(35, tempQuality), 10);
            let temp = await sharp(responseData, {failOn: 'error'}).jpeg({
                quality: sharpQuality,
                mozjpeg: true
            }).toBuffer();
            let counter = 0;
            while ((temp.length / (1024 * 1024)) > 1 && counter < 4 && sharpQuality > 10) {
                counter++;
                sharpQuality -= 20;
                if (sharpQuality <= 0) {
                    sharpQuality = 10;
                }
                temp = await sharp(responseData, {failOn: 'error'}).jpeg({
                    quality: sharpQuality,
                    mozjpeg: true
                }).toBuffer();
            }
            dataBuffer = temp;
        } else {
            const metadata = await sharp(responseData).metadata();
            if (metadata.format !== 'jpg' && metadata.format !== 'jpeg') {
                dataBuffer = await sharp(responseData, {failOn: 'error'}).jpeg({quality: 75, mozjpeg: true}).toBuffer();
            }
        }
        decreaseImageOperationNumber();
        return dataBuffer;
    } catch (error: any) {
        decreaseImageOperationNumber();
        if (error.message !== 'Input buffer contains unsupported image format' && error.message !== "VipsJpeg: Premature end of input file") {
            saveError(error);
        }
        throw error;
    }
}

export async function getImageThumbnail(
    inputImage: any,
    downloadFile: boolean = false,
    ): Promise<{
    content: any,
    width: number,
    height: number,
    type: string,
    fileSize: number,
    dataURIBase64: string,
} | null> {
    //copied from https://github.com/transitive-bullshit/lqip-modern
    try {
        if (config.DISABLE_THUMBNAIL_CREATE) {
            return null;
        }

        await waitForImageOperation();
        let fileSize = 0;
        if (downloadFile) {
            const downloadResult = await downloadImage(inputImage);
            if (!downloadResult || !downloadResult.data) {
                decreaseImageOperationNumber();
                return null;
            }
            inputImage = downloadResult.data;
            fileSize = Number(downloadResult.headers['content-length']) || 0;
        }

        const image = sharp(inputImage, {failOn: 'error'}).rotate();
        const metadata = await image.metadata();

        const size = Math.min(metadata.width, 128);
        const blur = size < 128 ? 16 : 18;

        const resized = image.resize(size, size, {fit: 'inside'});

        const output = resized.webp({
            quality: 20,
            alphaQuality: 20,
            smartSubsample: true,
        })

        const {data, info} = await output.blur(blur).toBuffer({resolveWithObject: true});
        decreaseImageOperationNumber();
        return {
            content: data,
            width: info.width,
            height: info.height,
            type: 'webp',
            fileSize: fileSize,
            dataURIBase64: `data:image/webp;base64,${data.toString('base64')}`,
        };
    } catch (error: any) {
        decreaseImageOperationNumber();
        //todo : temporal, remove later
        if (downloadFile && error.message === "VipsJpeg: Premature end of input file") {
            Sentry.captureMessage("VipsJpeg: Premature end of input file :: " + inputImage);
        }
        if (error.message !== 'Input buffer contains unsupported image format' && error.message !== "VipsJpeg: Premature end of input file") {
            saveError(error);
        }
        return null;
    }
}
