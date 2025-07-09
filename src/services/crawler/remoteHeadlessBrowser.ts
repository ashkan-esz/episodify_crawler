// import config from "@/config";
// import axios from "axios";
// import * as cheerio from "cheerio";
// import {v4 as uuidv4} from "uuid";
// import {getSourcesObjDB} from "../data/db/crawlerMethodsDB.js";
// import {getDecodedLink} from "./utils/utils.js"
// import {getResponseWithCookie} from "./utils/axiosUtils.js";
// import {saveError, saveErrorIfNeeded} from "../error/saveError.js";
// import {saveCrawlerWarning} from "../data/db/serverAnalysisDbMethods.js";
// import {getCrawlerWarningMessages} from "./status/crawlerWarnings.js";
// import {removeScriptAndStyle} from "./searchTools.js";

export type RemoteBrowser = {
    password: string;
    endpoint: string;
    apiCallCount: number;
    urls: string[];
    sourcesData: any[];
    disabledTime: number;
    disabled: boolean;
    manualDisabledTime: number;
    manualDisabled: boolean;
};


export const remoteBrowsers: RemoteBrowser[] = [];

// export const remoteBrowsers = config.remoteBrowser.map(item => {
//     item.password = encodeURIComponent(item.password);
//     item.apiCallCount = 0;
//     item.urls = [];
//     item.sourcesData = [];
//     item.disabledTime = 0;
//     item.disabled = false;
//     item.manualDisabledTime = 0;
//     item.manualDisabled = false;
//     item.bid = uuidv4();
//     return item;
// });

// let sourcesObject = await getSourcesObjDB();
// let sourcesObject = {};
// let sourcesObject_date = Date.now();
export let blackListSources = [];

// type ErrorAndTime = {
//     errorMessage: string,
//     savedTime: Date,
// }

// let errorsAndTimes: ErrorAndTime[] = [];

// export async function getPageData(url, sourceName, extraConfigs, sourceAuthStatus = 'ok', pageType = '', useAxiosFirst = false, cookieOnly = false, prevUsedBrowsers = []) {
//     let decodedUrl = getDecodedLink(url);
//     if (decodedUrl === url) {
//         url = encodeURIComponent(url);
//     }
//
//     let axiosResult = null;
//     if (useAxiosFirst && !cookieOnly && !decodedUrl.match(/page([=\/])\d+/i) && !decodedUrl.match(/((\.[a-zA-Z]+)|((?<!-)series?\/?))$/i)) {
//         axiosResult = await useAxiosGet(decodedUrl, sourceName, sourceAuthStatus, pageType);
//         if (axiosResult && axiosResult.pageContent && !axiosResult.isSus) {
//             return axiosResult;
//         }
//     }
//
//     let selectedBrowser;
//     try {
//         if (remoteBrowsers.length === 0) {
//             // no remote browser provided
//             return axiosResult;
//         }
//
//         while (true) {
//             freeBlockedSourcesFromBrowserServers();
//             reactivateDisabledServers();
//             if (!checkAnyBrowserServerCanHandleSource(sourceName)) {
//                 //this source is blocked on all browsers
//                 return axiosResult;
//             }
//
//             let notUsedBrowsers = remoteBrowsers
//                 .filter(item => !item.disabled && !item.manualDisabled)
//                 .filter(item => !prevUsedBrowsers.includes(item.endpoint));
//             if (notUsedBrowsers.length === 0) {
//                 //if there is only 1 browser, retry the same browser
//                 if (remoteBrowsers.length === 1 && prevUsedBrowsers.length === 1) {
//                     await new Promise(resolve => setTimeout(resolve, 2000));
//                     notUsedBrowsers = remoteBrowsers;
//                 } else {
//                     return axiosResult;
//                 }
//             }
//
//             selectedBrowser = notUsedBrowsers
//                 //tabsCount - apiCallCount :: server capability
//                 .sort((a, b) => (b.tabsCount - b.apiCallCount) - (a.tabsCount - a.apiCallCount))
//                 .filter(item => item.apiCallCount < 1.5 * item.tabsCount)
//                 .find(item => {
//                     let source = item.sourcesData.find(s => s.sourceName === sourceName);
//                     return !source || !source.isBlocked;
//                 });
//             if (selectedBrowser) {
//                 break;
//             }
//             await new Promise(resolve => setTimeout(resolve, 200));
//         }
//
//         selectedBrowser.apiCallCount++;
//         selectedBrowser.urls.push({url: decodedUrl, time: Date.now()});
//         let sourceCookies = sourcesObject
//             ? sourcesObject[sourceName].cookies.map(item => item.name + '=' + item.value + ';').join(' ')
//             : "";
//         sourceCookies = sourceCookies ? ("&sourceCookies=" + sourceCookies) : "";
//         let response = await axios.get(
//             `${selectedBrowser.endpoint}/headlessBrowser/?password=${selectedBrowser.password}&url=${url}&cookieOnly=${cookieOnly}` + sourceCookies,
//             {
//                 timeout: 50 * 1000, //50s timeout
//             },
//         );
//         selectedBrowser.apiCallCount--;
//         selectedBrowser.urls = selectedBrowser.urls.filter(item => item.url !== decodedUrl);
//
//         let data = response.data;
//         if (!data || !data.pageContent || data.error) {
//             addSourceErrorToBrowserServer(selectedBrowser, sourceName, extraConfigs);
//             prevUsedBrowsers.push(selectedBrowser.endpoint);
//             await new Promise(resolve => setTimeout(resolve, 2000));
//             return await getPageData(url, sourceName, extraConfigs, sourceAuthStatus, pageType, useAxiosFirst, cookieOnly, prevUsedBrowsers);
//         } else {
//             resetSourceErrorOfBrowserServer(selectedBrowser, sourceName);
//         }
//
//         data.isAxiosResult = false;
//         data.isAxiosCalled = axiosResult ? axiosResult.isAxiosCalled : false;
//         if (axiosResult && axiosResult.pageContent && axiosResult.isSus) {
//             if (extraConfigs.removeScriptAndStyleFromHtml) {
//                 data.pageContent = removeScriptAndStyle(data.pageContent);
//             }
//             let $ = cheerio.load(data.pageContent);
//             let links = $('a');
//             if (Math.abs(links.length - axiosResult.linksCount) > 2) {
//                 addSourceToAxiosBlackList(sourceName);
//             }
//         }
//
//         return data;
//     } catch (error) {
//         let handleErrorResult = await handleBrowserCallErrors(error, selectedBrowser, url, prevUsedBrowsers, sourceName, extraConfigs);
//         if (selectedBrowser) {
//             selectedBrowser.apiCallCount--;
//             selectedBrowser.urls = selectedBrowser.urls.filter(item => item.url !== decodedUrl);
//         }
//         if (handleErrorResult === "retry") {
//             await new Promise(resolve => setTimeout(resolve, 3000));
//             return await getPageData(url, sourceName, extraConfigs, sourceAuthStatus, pageType, useAxiosFirst, cookieOnly, prevUsedBrowsers);
//         }
//         return null;
//     }
// }

// export async function getYoutubeDownloadLink(
//     youtubeUrl: string,
//     prevUsedBrowsers: RemoteBrowser[] = [],
//     extraConfigs: CrawlerExtraConfigs = null,
//     ): Promise<null> {
//     return null;
// }

// export async function getYoutubeDownloadLink(youtubeUrl, prevUsedBrowsers = [], extraConfigs = null) {
//     let decodedUrl = getDecodedLink(youtubeUrl);
//     if (decodedUrl === youtubeUrl) {
//         youtubeUrl = encodeURIComponent(youtubeUrl);
//     }
//
//     let selectedBrowser;
//     try {
//         if (remoteBrowsers.length === 0) {
//             // no remote browser provided
//             return null;
//         }
//
//         while (true) {
//             let notUsedBrowsers = remoteBrowsers
//                 .filter(item => !item.disabled && !item.manualDisabled)
//                 .filter(item => !prevUsedBrowsers.includes(item.endpoint));
//             if (notUsedBrowsers.length === 0) {
//                 //if there is only 1 browser, retry the same browser
//                 if (remoteBrowsers.length === 1 && prevUsedBrowsers.length === 1) {
//                     await new Promise(resolve => setTimeout(resolve, 2000));
//                     notUsedBrowsers = remoteBrowsers;
//                 } else {
//                     return null;
//                 }
//             }
//             selectedBrowser = notUsedBrowsers
//                 //tabsCount - apiCallCount :: server capability
//                 .sort((a, b) => (b.tabsCount - b.apiCallCount) - (a.tabsCount - a.apiCallCount))
//                 .find(item => item.apiCallCount < 1.5 * item.tabsCount);
//             if (selectedBrowser) {
//                 break;
//             }
//             await new Promise(resolve => setTimeout(resolve, 200));
//         }
//
//         selectedBrowser.apiCallCount++;
//         selectedBrowser.urls.push({url: decodedUrl, time: Date.now()});
//         let response = await axios.get(
//             `${selectedBrowser.endpoint}/youtube/getDownloadLink/?password=${selectedBrowser.password}&youtubeUrl=${youtubeUrl}`,
//             {
//                 timeout: 70 * 1000, //70s timeout
//             },
//         );
//         selectedBrowser.apiCallCount--;
//         selectedBrowser.urls = selectedBrowser.urls.filter(item => item.url !== decodedUrl);
//
//         let data = response.data;
//         if (!data || data.error) {
//             prevUsedBrowsers.push(selectedBrowser.endpoint);
//             await new Promise(resolve => setTimeout(resolve, 2000));
//             return await getYoutubeDownloadLink(youtubeUrl, prevUsedBrowsers, extraConfigs);
//         }
//         //{downloadUrl, youtubeUrl}
//         return data.res;
//     } catch (error) {
//         let handleErrorResult = await handleBrowserCallErrors(error, selectedBrowser, youtubeUrl, prevUsedBrowsers, "", extraConfigs);
//         if (selectedBrowser) {
//             selectedBrowser.apiCallCount--;
//             selectedBrowser.urls = selectedBrowser.urls.filter(item => item.url !== decodedUrl);
//         }
//         if (handleErrorResult === "retry") {
//             await new Promise(resolve => setTimeout(resolve, 3000));
//             return await getYoutubeDownloadLink(youtubeUrl, prevUsedBrowsers, extraConfigs);
//         }
//         return null;
//     }
// }

// export async function getAllRemoteBrowsersStatus() {
//     try {
//         let promise = await Promise.allSettled(remoteBrowsers.map(b => axios.get(
//             `${b.endpoint}/serverStatus/?password=${b.password}`,
//             {
//                 timeout: 50 * 1000, //50s timeout
//             },
//         )));
//         let result = [];
//         for (let i = 0; i < remoteBrowsers.length; i++) {
//             let data = promise.find(item => item.value?.config?.url.includes(remoteBrowsers[i].endpoint))?.value?.data;
//             if (data) {
//                 result.push(data);
//             } else {
//                 result.push({
//                     error: true,
//                     endpoint: remoteBrowsers[i].endpoint,
//                 });
//             }
//         }
//         return result;
//     } catch (error) {
//         saveError(error);
//         return 'error';
//     }
// }

// export async function checkSourceOnAllRemoteBrowsers(sourceName, url) {
//     try {
//         let result = [];
//         let promiseArray = [];
//         for (let i = 0; i < remoteBrowsers.length; i++) {
//             let promise = axios.get(
//                 `${remoteBrowsers[i].endpoint}/headlessBrowser/?password=${remoteBrowsers[i].password}&url=${encodeURIComponent(url)}`,
//                 {
//                     timeout: 50 * 1000, //50s timeout
//                 },
//             ).then(res => {
//                 result.push({
//                     sourceName: sourceName,
//                     url: url,
//                     endpoint: remoteBrowsers[i].endpoint,
//                     error: false,
//                     errorMessage: '',
//                 });
//             }).catch(err => {
//                 let errorMessage = 'Error';
//                 if (err.message && err.message.match(/timeout of .+ exceeded/i)) {
//                     errorMessage = err.message;
//                 } else if (err.response && err.response.status >= 500) {
//                     errorMessage = 'RemoteBrowser Internal Error';
//                 } else if (err.response && err.response.status === 404) {
//                     errorMessage = 'Url Not Found';
//                 }
//                 result.push({
//                     sourceName: sourceName,
//                     url: url,
//                     endpoint: remoteBrowsers[i].endpoint,
//                     error: true,
//                     errorMessage: errorMessage,
//                 });
//             });
//             promiseArray.push(promise);
//         }
//         await Promise.allSettled(promiseArray);
//         return result;
//     } catch (error) {
//         saveError(error);
//         return 'error';
//     }
// }

// async function handleBrowserCallErrors(error, selectedBrowser, url, prevUsedBrowsers, sourceName, extraConfigs) {
//     if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
//         error.isFetchError2 = true;
//         error.isFetchError = true;
//         error.url = url;
//         error.filePath = 'remoteHeadlessBrowser';
//     }
//     if (selectedBrowser && (error.message === "timeout of 50000ms exceeded" || error.message === "timeout of 70000ms exceeded")) {
//         if (sourceName) {
//             addSourceErrorToBrowserServer(selectedBrowser, sourceName, extraConfigs);
//         }
//         await checkAndSaveErrorIfNeed(error, url, sourceName, selectedBrowser, prevUsedBrowsers);
//         prevUsedBrowsers.push(selectedBrowser.endpoint);
//         return "retry";
//     }
//     if (selectedBrowser && error.response && (error.response.status === 404 || error.response.status >= 500)) {
//         try {
//             let r = await axios.get(selectedBrowser.endpoint, {
//                 timeout: 40 * 1000, //40s timeout
//             });
//             if (sourceName) {
//                 addSourceErrorToBrowserServer(selectedBrowser, sourceName, extraConfigs);
//             }
//             await checkAndSaveErrorIfNeed(error, url, sourceName, selectedBrowser, prevUsedBrowsers);
//             prevUsedBrowsers.push(selectedBrowser.endpoint);
//             return "retry";
//         } catch (err) {
//             if (selectedBrowser && error.response && (error.response.status === 404 || error.response.status >= 500)) {
//                 //remote server got deactivated or removed from server
//                 if (selectedBrowser.disabled) {
//                     return "retry";
//                 }
//                 selectedBrowser.disabled = true;
//                 selectedBrowser.disabledTime = Date.now();
//                 await checkAndSaveErrorIfNeed(error, url, sourceName, selectedBrowser, prevUsedBrowsers, true);
//                 prevUsedBrowsers.push(selectedBrowser.endpoint);
//                 return "retry";
//             }
//         }
//     }
//     await saveError(error);
//     return "return null";
// }

//--------------------------------------------------
//--------------------------------------------------

// export function manualMutateRemoteBrowser(mutateType, bid, all = false) {
//     if (all === true) {
//         for (let i = 0; i < remoteBrowsers.length; i++) {
//             if (mutateType === 'enable') {
//                 remoteBrowsers[i].manualDisabled = false;
//                 remoteBrowsers[i].manualDisabledTime = 0;
//             } else {
//                 remoteBrowsers[i].manualDisabled = true;
//                 remoteBrowsers[i].manualDisabledTime = Date.now();
//             }
//         }
//         return 'ok';
//     } else {
//         for (let i = 0; i < remoteBrowsers.length; i++) {
//             if (remoteBrowsers[i].bid === bid) {
//                 if (mutateType === 'enable') {
//                     remoteBrowsers[i].manualDisabled = false;
//                     remoteBrowsers[i].manualDisabledTime = 0;
//                 } else {
//                     remoteBrowsers[i].manualDisabled = true;
//                     remoteBrowsers[i].manualDisabledTime = Date.now();
//                 }
//                 return 'ok';
//             }
//         }
//         return 'not found';
//     }
// }

//--------------------------------------------------
//--------------------------------------------------

// async function useAxiosGet(url, sourceName, sourceAuthStatus, pageType, retryCounter = 0) {
//     let result = {
//         pageContent: null,
//         responseUrl: '',
//         pageTitle: '',
//         cookies: [],
//         isAxiosResult: true,
//         isAxiosCalled: true,
//         isSus: false,
//         linksCount: 0,
//     };
//     try {
//         await refreshAxiosSourcesObject();
//         freeAxiosBlackListSources();
//         let sourceData = blackListSources.find(item => item.sourceName === sourceName);
//         if (sourceData && sourceData.isBlocked) {
//             result.isAxiosCalled = false;
//             return result;
//         }
//         let sourceCookies = sourcesObject ? sourcesObject[sourceName].cookies : [];
//         let sourceHeaders = sourcesObject ? sourcesObject[sourceName].headers : '';
//         sourceHeaders = sourceHeaders ? JSON.parse(sourceHeaders) : {};
//         const cookie = sourceCookies.map(item => item.name + '=' + item.value + ';').join(' ');
//         // let timeout = sourceAuthStatus === 'login-cookie' ? 7000 : 4000;
//         let timeout = 10000;
//         let response = await getResponseWithCookie(url, cookie, sourceHeaders, timeout);
//         // if (extraConfigs.removeScriptAndStyleFromHtml) {
//         //     response.data = removeScriptAndStyle(response.data);
//         // }
//         let $ = cheerio.load(response.data);
//         let links = $('a');
//         result.pageContent = response.data;
//         result.responseUrl = response.request.res.responseUrl;
//         result.isSus = links.length < 90;
//         result.linksCount = links.length;
//         return result;
//     } catch (error) {
//         if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
//             if (decodeURIComponent(url) === url) {
//                 let temp = url.replace(/\/$/, '').split('/').pop();
//                 if (temp) {
//                     url = url.replace(temp, encodeURIComponent(temp));
//                     return await useAxiosGet(url, sourceName, sourceAuthStatus, pageType, retryCounter);
//                 }
//             }
//             error.isFetchError = true;
//             error.url = url;
//             error.filePath = 'remoteHeadlessBrowser > useAxiosGet';
//         } else if (error.response && error.response.status) {
//             addSourceToAxiosBlackList(sourceName);
//         }
//
//         if (error.message === 'timeout of 10000ms exceeded') {
//             const warningMessages = getCrawlerWarningMessages('10s', sourceName);
//             saveCrawlerWarning(warningMessages.axios.timeoutError);
//             if (pageType === 'sourcePage' && retryCounter < 2) {
//                 retryCounter++;
//                 return await useAxiosGet(url, sourceName, sourceAuthStatus, pageType, retryCounter);
//             }
//         } else if (error.message === 'aborted') {
//             const warningMessages = getCrawlerWarningMessages(sourceName);
//             saveCrawlerWarning(warningMessages.axios.abortError);
//             if (pageType === 'sourcePage' && retryCounter < 2) {
//                 retryCounter++;
//                 return await useAxiosGet(url, sourceName, sourceAuthStatus, pageType, retryCounter);
//             }
//         } else if (error.code === 'EAI_AGAIN') {
//             const warningMessages = getCrawlerWarningMessages(sourceName);
//             saveCrawlerWarning(warningMessages.axios.eaiError);
//         } else if (error.message === 'Request failed with status code 403') {
//             const warningMessages = getCrawlerWarningMessages(sourceName);
//             saveCrawlerWarning(warningMessages.source.fetch403);
//         } else if (error.message !== 'certificate has expired' && error.code !== "ERR_TLS_CERT_ALTNAME_INVALID") {
//             if (Object.isExtensible(error) && !Object.isFrozen(error) && !Object.isSealed(error)) {
//                 error.isFetchError = true;
//                 error.url = url;
//                 error.filePath = 'remoteHeadlessBrowser > useAxiosGet 2';
//             } else {
//                 //sometimes error object is read-only
//                 let temp = error;
//                 error = new Error(temp.message);
//                 Object.assign(error, temp);
//                 error.stack0 = temp.stack;
//                 error.message0 = temp.message;
//                 error.isFetchError2 = true;
//                 error.url = url;
//                 error.filePath = 'remoteHeadlessBrowser > useAxiosGet 2';
//             }
//             saveErrorIfNeeded(error);
//         }
//         return result;
//     }
// }

//---------------------------------------------
//---------------------------------------------

// function checkAnyBrowserServerCanHandleSource(sourceName) {
//     for (let i = 0; i < remoteBrowsers.length; i++) {
//         let sources = remoteBrowsers[i].sourcesData;
//         let foundSource = false;
//         for (let j = 0; j < sources.length; j++) {
//             if (sources[j].sourceName === sourceName) {
//                 foundSource = true;
//                 if (!sources[j].isBlocked) {
//                     return true;
//                 }
//                 if (Date.now() - sources[j].lastErrorTime > 29 * 60 * 1000) {
//                     //the source is near to get free, (1min left)
//                     return true;
//                 }
//             }
//         }
//         if (!foundSource) {
//             return true;
//         }
//     }
//     return false;
// }

// function addSourceErrorToBrowserServer(selectedBrowser, sourceName, extraConfigs) {
//     let sourceData = selectedBrowser.sourcesData.find(item => item.sourceName === sourceName);
//     if (sourceData) {
//         sourceData.errorCounter++;
//         sourceData.totalErrorCounter++;
//         sourceData.lastErrorTime = Date.now();
//         const errorBlockCount = Number(extraConfigs?.remoteBrowserBlockThreshHold || 15);
//         if (sourceData.errorCounter >= errorBlockCount) {
//             sourceData.isBlocked = true;
//         }
//     } else {
//         selectedBrowser.sourcesData.push({
//             sourceName: sourceName,
//             errorCounter: 1,
//             lastErrorTime: Date.now(),
//             isBlocked: false,
//             totalErrorCounter: 1,
//         });
//     }
// }

// function resetSourceErrorOfBrowserServer(selectedBrowser, sourceName) {
//     let sourceData = selectedBrowser.sourcesData.find(item => item.sourceName === sourceName);
//     if (sourceData) {
//         sourceData.errorCounter = 0;
//         sourceData.lastErrorTime = 0;
//         sourceData.isBlocked = false;
//     }
// }

// function freeBlockedSourcesFromBrowserServers() {
//     for (let i = 0; i < remoteBrowsers.length; i++) {
//         let sources = remoteBrowsers[i].sourcesData;
//         for (let j = 0; j < sources.length; j++) {
//             if (Date.now() - sources[j].lastErrorTime > 30 * 60 * 1000) {
//                 sources[j].errorCounter = 0;
//                 sources[j].lastErrorTime = 0;
//                 sources[j].isBlocked = false;
//             }
//         }
//     }
// }

//---------------------------------------------
//---------------------------------------------

// async function refreshAxiosSourcesObject(): Promise<void> {
//     let now = Date.now();
//     if (now - sourcesObject_date > 10 * 60 * 1000) {
//         //every 10min
//         // sourcesObject = await getSourcesObjDB();
//         sourcesObject = {};
//         sourcesObject_date = now;
//     }
// }

// export async function getAxiosSourcesObject(): Promise<any> {
//     await refreshAxiosSourcesObject();
//     return sourcesObject;
// }

// function addSourceToAxiosBlackList(sourceName: string): void {
//     let sourceData = blackListSources.find(item => item.sourceName === sourceName);
//     if (sourceData) {
//         sourceData.lastErrorTime = Date.now();
//         sourceData.isBlocked = true;
//     } else {
//         blackListSources.push({
//             sourceName: sourceName,
//             lastErrorTime: Date.now(),
//             isBlocked: true,
//             linksCount: 0,
//         });
//     }
// }

// function freeAxiosBlackListSources(): void {
//     for (let i = 0; i < blackListSources.length; i++) {
//         //free source after 3 hour
//         blackListSources[i].isBlocked = (Date.now() - blackListSources[i].lastErrorTime) < 2 * 60 * 60 * 1000; //2h
//     }
// }

// function reactivateDisabledServers(): void {
//     for (let i = 0; i < remoteBrowsers.length; i++) {
//         //reActivate browser server after 2 hour
//         if (remoteBrowsers[i].disabled) {
//             remoteBrowsers[i].disabled = (Date.now() - remoteBrowsers[i].disabledTime) < 2 * 60 * 60 * 1000; //2h
//             if (!remoteBrowsers[i].disabled) {
//                 remoteBrowsers[i].disabledTime = 0;
//             }
//         }
//     }
// }

//---------------------------------------------
//---------------------------------------------

// async function checkAndSaveErrorIfNeed(error, url, sourceName, selectedBrowser, prevUsedBrowsers, checkingBrowser = false) {
//     if (error.response && error.response.status === 503) {
//         const baseCall = !checkingBrowser ? ` (${sourceName})` : '';
//         const warningMessages = getCrawlerWarningMessages(selectedBrowser.endpoint);
//         saveCrawlerWarning(warningMessages.remoteBrowser.notWorking + baseCall);
//         return;
//     }
//     if ((error.message === "timeout of 50000ms exceeded" || error.message === "timeout of 70000ms exceeded")) {
//         const baseCall = !checkingBrowser ? ` (${sourceName})` : '';
//         const warningMessages = getCrawlerWarningMessages(selectedBrowser.endpoint);
//         saveCrawlerWarning(warningMessages.remoteBrowser.timeoutError + baseCall);
//         return;
//     }
//
//     let errorMessage = error.message + '|' + error.code + '|' + error.response?.status + '|' + selectedBrowser.endpoint;
//     let errDataTime = errorsAndTimes.find(item => item.errorMessage === errorMessage);
//     let needSave = false;
//     if (errDataTime) {
//         if (Date.now() - errDataTime.savedTime > 30 * 60 * 1000) {
//             //save errors every 30min, dont save duplicate errors
//             errDataTime.savedTime = Date.now();
//             needSave = true;
//         }
//     } else {
//         errorsAndTimes.push({
//             errorMessage: errorMessage,
//             savedTime: Date.now(),
//         });
//         needSave = true;
//     }
//     if (needSave) {
//         error.isFetchError2 = true;
//         error.url = url;
//         error.browserServer = selectedBrowser.endpoint;
//         error.prevUsedBrowsers = prevUsedBrowsers;
//         await saveError(error);
//     }
// }
