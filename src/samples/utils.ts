// import { saveError } from '@utils/logger';
// import fs from 'node:fs';
// import Path from 'node:path';
// import JSZip from 'jszip';
//
// const _fileSizeLimit = 20 * 1024 * 1024;
//
// export async function getDataFileIndex(
//     pathToFiles: string,
//     sourceName: string,
//     pageLink: string,
// ): Promise<{ exist: boolean; index: number }> {
//     const folderPath = Path.join(pathToFiles, sourceName);
//     const indexFilePath = Path.join(folderPath, sourceName + '_index.json');
//     if (!fs.existsSync(folderPath)) {
//         //create folder for source
//         await fs.promises.mkdir(folderPath);
//     }
//     if (fs.existsSync(indexFilePath)) {
//         const indexFile = await fs.promises.readFile(indexFilePath, 'utf8');
//         const indexes = JSON.parse(indexFile);
//         pageLink = decodeURIComponent(pageLink.replace(/\/$/, '').split('/').pop() ?? '');
//         const findIndex = indexes.find((item: any) => item.link === pageLink);
//         if (findIndex) {
//             return {
//                 exist: true,
//                 index: findIndex.index,
//             };
//         } else {
//             return {
//                 exist: false,
//                 index: indexes.sort((a: any, b: any) => a.index - b.index).pop()?.index || 1,
//             };
//         }
//     } else {
//         //create index file and first data file
//         await fs.promises.writeFile(indexFilePath, JSON.stringify([]), 'utf8');
//         const dataFilePath = Path.join(folderPath, sourceName + '_1.json');
//         await fs.promises.writeFile(dataFilePath, JSON.stringify([]), 'utf8');
//         return {
//             exist: false,
//             index: 1,
//         };
//     }
// }
//
// export async function updateSampleData(
//     pathToFiles: string,
//     sourceName: string,
//     pageLink: string,
//     data: any,
//     fileIndex: number,
//     updateFieldNames: string[] = [],
// ): Promise<void> {
//     const pathToFile = getPathToFile(pathToFiles, sourceName, fileIndex);
//     const samplesFile = await readFile(pathToFile);
//     const samples = JSON.parse(samplesFile);
//     const link = pageLink.replace(/\/$/, '').split('/').pop();
//     for (let i = 0; i < samples.length; i++) {
//         if (samples[i].pageLink.replace(/\/$/, '').split('/').pop() === link) {
//             if (updateFieldNames.length === 0) {
//                 samples[i] = data;
//             } else {
//                 for (let j = 0; j < updateFieldNames.length; j++) {
//                     samples[i][updateFieldNames[j]] = data[updateFieldNames[j]];
//                 }
//             }
//
//             const stringifySamples = JSON.stringify(samples);
//             if (pathToFile.endsWith('.zip')) {
//                 await createZipFile(pathToFile, stringifySamples);
//             } else {
//                 if (stringifySamples.length >= _fileSizeLimit) {
//                     await convertJsonToZip(pathToFile, stringifySamples);
//                 } else {
//                     await fs.promises.writeFile(pathToFile, stringifySamples, 'utf8');
//                 }
//             }
//             break;
//         }
//     }
// }
//
// export async function updateSampleData_batch(
//     pathToFiles: string,
//     sourceName: string,
//     dataArray: any[],
//     fileIndex: number,
//     updateFieldNames: string[] = [],
// ) {
//     const pathToFile = getPathToFile(pathToFiles, sourceName, fileIndex);
//     const samplesFile = await readFile(pathToFile);
//     const samples = JSON.parse(samplesFile);
//     for (let i = 0; i < dataArray.length; i++) {
//         const link = dataArray[i].pageLink.replace(/\/$/, '').split('/').pop();
//         for (let j = 0; j < samples.length; j++) {
//             if (samples[j].pageLink.replace(/\/$/, '').split('/').pop() === link) {
//                 if (updateFieldNames.length === 0) {
//                     samples[j] = dataArray[i];
//                 } else {
//                     for (let k = 0; k < updateFieldNames.length; k++) {
//                         samples[j][updateFieldNames[k]] = dataArray[i][updateFieldNames[k]];
//                     }
//                 }
//                 break;
//             }
//         }
//     }
//     const stringifySamples = JSON.stringify(samples);
//     if (pathToFile.endsWith('.zip')) {
//         await createZipFile(pathToFile, stringifySamples);
//     } else {
//         if (stringifySamples.length >= _fileSizeLimit) {
//             await convertJsonToZip(pathToFile, stringifySamples);
//         } else {
//             await fs.promises.writeFile(pathToFile, stringifySamples, 'utf8');
//         }
//     }
// }
//
// export async function saveNewSampleData(
//     pathToFiles: string,
//     sourceName: string,
//     data: any,
//     lastFileIndex: number,
// ): Promise<void> {
//     const pathToFile = getPathToFile(pathToFiles, sourceName, lastFileIndex);
//     //check last data file reached file size limit
//     let fileStats = await fs.promises.stat(pathToFile);
//     if (fileStats.size < _fileSizeLimit && !pathToFile.endsWith('.zip')) {
//         //good
//         const samplesFile = await fs.promises.readFile(pathToFile, 'utf8');
//         const samples = JSON.parse(samplesFile);
//         samples.push(data);
//         await Promise.all([
//             fs.promises.writeFile(pathToFile, JSON.stringify(samples), 'utf8'),
//             updateIndexFile(pathToFiles, sourceName, data.pageLink, lastFileIndex),
//         ]);
//         fileStats = await fs.promises.stat(pathToFile);
//         if (fileStats.size >= _fileSizeLimit) {
//             await convertJsonToZip(pathToFile);
//         }
//     } else {
//         if (!pathToFile.endsWith('.zip')) {
//             await convertJsonToZip(pathToFile);
//         }
//         const pathToNewFile = Path.join(
//             pathToFiles,
//             sourceName,
//             `${sourceName}_${lastFileIndex + 1}.json`,
//         );
//         await Promise.all([
//             fs.promises.writeFile(pathToNewFile, JSON.stringify([data]), 'utf8'),
//             updateIndexFile(pathToFiles, sourceName, data.pageLink, lastFileIndex + 1),
//         ]);
//     }
// }
//
// async function updateIndexFile(
//     pathToFiles: string,
//     sourceName: string,
//     pageLink: string,
//     index: number,
// ): Promise<void> {
//     const indexFilePath = Path.join(pathToFiles, sourceName, sourceName + '_index.json');
//     const indexFile = await fs.promises.readFile(indexFilePath, 'utf8');
//     const indexes = JSON.parse(indexFile);
//     indexes.push({
//         link: decodeURIComponent(pageLink.replace(/\/$/, '').split('/').pop() ?? ''),
//         index: index,
//     });
//     await fs.promises.writeFile(indexFilePath, JSON.stringify(indexes), 'utf8');
// }
//
// export async function getDataFiles(
//     pathToFiles: string,
//     sourceNames: string[] | string | null = null,
// ): Promise<string[]> {
//     try {
//         const dirs = await fs.promises.readdir(pathToFiles);
//         const folderCheckPromises = await Promise.allSettled(
//             dirs.map(async (d) =>
//                 (await fs.promises.lstat(Path.join(pathToFiles, d))).isDirectory(),
//             ),
//         );
//         let folders = dirs.filter((d, index) => {
//             if (folderCheckPromises[index].status === 'fulfilled') {
//                 return folderCheckPromises[index].value;
//             }
//             return false;
//         });
//         if (sourceNames) {
//             folders = folders.filter((item) => sourceNames.includes(item));
//         }
//         const readFilesPromises = await Promise.allSettled(
//             folders.map(async (d) => await fs.promises.readdir(Path.join(pathToFiles, d))),
//         );
//         const files = readFilesPromises
//             .map((item) => {
//                 if (item.status === 'fulfilled') {
//                     return item.value;
//                 }
//                 return [];
//             })
//             .flat(1);
//         return files.filter((file) => !file.includes('_index'));
//     } catch (error) {
//         saveError(error);
//         return [];
//     }
// }
//
// export async function getSamplesFromFiles(pathToFiles: string, files: string[]): Promise<any[]> {
//     const paths = files.map((f) => Path.join(pathToFiles, f.split('_')[0], f));
//
//     let samples: any[] = [];
//     const promiseArray = [];
//     for (let i = 0; i < files.length; i++) {
//         let temp = readFile(paths[i]).then((f) => {
//             let t = JSON.parse(f).map((item: any) => {
//                 item.sourceName = files[i].split('_')[0];
//                 item.fileIndex = Number(files[i].split('_').pop()?.split('.')[0]);
//                 return item;
//             });
//             samples = samples.concat(...t);
//         });
//         promiseArray.push(temp);
//     }
//     await Promise.allSettled(promiseArray);
//     return samples;
// }
//
// async function readFile(path: string): Promise<any> {
//     if (path.endsWith('.zip')) {
//         const zip = new JSZip();
//         const zipFile = await fs.promises.readFile(path);
//         const temp = await zip.loadAsync(zipFile);
//         path = path.split('/').pop() ?? '';
//         if (!path) {
//             return null;
//         }
//
//         return temp.file(path.replace('.zip', '.json'))?.async('string');
//     } else {
//         return await fs.promises.readFile(path, 'utf8');
//     }
// }
//
// function getPathToFile(pathToFiles: string, sourceName: string, fileIndex: number): string {
//     let pathToFile = Path.join(pathToFiles, sourceName, `${sourceName}_${fileIndex}.json`);
//     if (!fs.existsSync(pathToFile)) {
//         pathToFile = pathToFile.replace('.json', '.zip');
//     }
//     return pathToFile;
// }
//
// async function convertJsonToZip(pathToFile: string, content: any = null): Promise<void> {
//     const zip = new JSZip();
//     content = content || (await fs.promises.readFile(pathToFile, 'utf8'));
//     const path = pathToFile.split('/').pop();
//     if (!path) {
//         return;
//     }
//
//     zip.file(path, content);
//     const zipFile = await zip.generateAsync({
//         type: 'nodebuffer',
//         compression: 'DEFLATE',
//     });
//     await Promise.all([
//         fs.promises.writeFile(pathToFile.replace('.json', '.zip'), zipFile),
//         fs.promises.rm(pathToFile),
//     ]);
// }
//
// async function createZipFile(pathToFile: string, content: any): Promise<void> {
//     const zip = new JSZip();
//     const path = pathToFile.split('/').pop();
//     if (!path) {
//         return;
//     }
//
//     zip.file(path.replace('.zip', '.json'), content);
//     const zipFile = await zip.generateAsync({
//         type: 'nodebuffer',
//         compression: 'DEFLATE',
//     });
//     await fs.promises.writeFile(pathToFile, zipFile);
// }
