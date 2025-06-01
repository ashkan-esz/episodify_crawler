import { MovieType } from '@/types';
import * as Path from 'path';
import { saveError } from '@utils/logger';
import { fileURLToPath } from 'url';
import {
    getDataFileIndex,
    getDataFiles,
    getSamplesFromFiles,
    saveNewSampleData,
    updateSampleData,
    updateSampleData_batch,
} from '@/samples/utils';

const __filename = fileURLToPath(import.meta.url);
const pathToFiles = Path.dirname(__filename);

let isFileOpen = false;

async function waitForFileClose(): Promise<void> {
    while (isFileOpen) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

export async function saveSourcePageSample(
    pageContent: any,
    sourceData: any,
    title: string,
    type: MovieType,
    year: string,
    updateFieldNames: string[] = [],
    replace: boolean = false,
): Promise<void> {
    try {
        await waitForFileClose();
        isFileOpen = true;

        const data = {
            pageContent,
            pageLink: sourceData.pageLink,
            title,
            type,
            year,
            downloadLinks: sourceData.downloadLinks,
            watchOnlineLinks: sourceData.watchOnlineLinks,
            torrentLinks: sourceData.torrentLinks,
            subtitles: sourceData.subtitles,
            poster: sourceData.poster,
            trailers: sourceData.trailers,
            persianSummary: sourceData.persianSummary,
        };

        const dataFileIndex = await getDataFileIndex(
            pathToFiles,
            sourceData.sourceConfig.sourceName,
            sourceData.pageLink,
        );
        if (dataFileIndex.exist) {
            if (replace) {
                await updateSampleData(
                    pathToFiles,
                    sourceData.sourceConfig.sourceName,
                    sourceData.pageLink,
                    data,
                    dataFileIndex.index,
                    updateFieldNames,
                );
            }
        } else {
            await saveNewSampleData(
                pathToFiles,
                sourceData.sourceConfig.sourceName,
                data,
                dataFileIndex.index,
            );
        }

        isFileOpen = false;
    } catch (error) {
        saveError(error);
        isFileOpen = false;
    }
}

export async function updateSourcePageData(
    sourcePageData: any,
    updateFieldNames: string[],
): Promise<void> {
    try {
        await waitForFileClose();
        isFileOpen = true;

        const { sourceName, fileIndex } = sourcePageData;
        delete sourcePageData.sourceName;
        delete sourcePageData.fileIndex;
        await updateSampleData(
            pathToFiles,
            sourceName,
            sourcePageData.pageLink,
            sourcePageData,
            fileIndex,
            updateFieldNames,
        );
        sourcePageData.sourceName = sourceName;
        sourcePageData.fileIndex = fileIndex;
        isFileOpen = false;
    } catch (error) {
        saveError(error);
        isFileOpen = false;
    }
}

export async function updateSourcePageData_batch(
    sourcePageDataArray: any[],
    updateFieldNames: string[],
): Promise<void> {
    try {
        await waitForFileClose();
        isFileOpen = true;
        if (
            sourcePageDataArray.length &&
            sourcePageDataArray.every(
                (item) =>
                    item.sourceName === sourcePageDataArray[0].sourceName &&
                    item.fileIndex === sourcePageDataArray[0].fileIndex,
            )
        ) {
            const { sourceName, fileIndex } = sourcePageDataArray[0];
            for (let i = 0; i < sourcePageDataArray.length; i++) {
                delete sourcePageDataArray[i].sourceName;
                delete sourcePageDataArray[i].fileIndex;
            }
            await updateSampleData_batch(
                pathToFiles,
                sourceName,
                sourcePageDataArray,
                fileIndex,
                updateFieldNames,
            );
            for (let i = 0; i < sourcePageDataArray.length; i++) {
                sourcePageDataArray[i].sourceName = sourceName;
                sourcePageDataArray[i].fileIndex = fileIndex;
            }
        }
        isFileOpen = false;
    } catch (error) {
        saveError(error);
        isFileOpen = false;
    }
}

export async function getSourcePagesSamples(
    sourceNames: string[] | string | null = null,
    start: number | null = null,
    end: number | null = null,
): Promise<any[] | string> {
    try {
        await waitForFileClose();
        isFileOpen = true;
        let files = await getDataFiles(pathToFiles, sourceNames);
        if ((start || start === 0) && (end || end === 0)) {
            files = files.filter((item) => {
                const n = Number(item.split('_').pop()?.split('.')[0]);
                return n >= start && n <= end;
            });
        }
        const samples = await getSamplesFromFiles(pathToFiles, files);
        isFileOpen = false;
        return samples;
    } catch (error) {
        saveError(error);
        isFileOpen = false;
        return 'error';
    }
}
