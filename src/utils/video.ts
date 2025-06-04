// import config from "@/config";
// import fs from 'fs';
// import ffmpeg from 'fluent-ffmpeg';
// import {saveError} from "@/utils/logger";
//
// await createTempDir();
//
// export async function compressVideo(inputBuffer, name) {
//     return new Promise(async (resolve, reject) => {
//
//         await fs.promises.writeFile('./temp-video/' + name, inputBuffer);
//         ffmpeg('./temp-video/' + name)
//
//             .addOptions(["-crf 28"])
//             .videoCodec("libx264")
//             .audioCodec('aac')
//             .audioBitrate('128k')
//             .videoBitrate(`1k`)
//             // .fps(30)
//             // .outputOptions('-vf', 'scale=-2:720')
//             .on('progress', (progress) => {
//                 if (config.nodeEnv === 'dev') {
//                     console.log(`Processing (${name}): ${progress.percent?.toFixed(1)}% done`);
//                 }
//             })
//             .on("end", async () => {
//                 let resultBuffer = await fs.promises.readFile('./temp-video/compressed--' + name);
//                 await removeTempFile(name);
//                 resolve(resultBuffer);
//             })
//             .on("error", async (err) => {
//                 saveError(err);
//                 await removeTempFile(name);
//                 reject('shit error');
//             })
//             .save('./temp-video/compressed--' + name)
//     });
// }
//
// async function removeTempFile(name) {
//     await Promise.allSettled([
//         fs.promises.unlink('./temp-video/' + name),
//         fs.promises.unlink('./temp-video/compressed--' + name),
//     ]);
// }
//
// async function createTempDir() {
//     try {
//         await fs.promises.mkdir('./temp-video/');
//     } catch (e) {
//     }
// }
