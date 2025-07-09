import config from '@/config';
import { ServerAnalysisRepo } from '@/repo';
import { removeScriptAndStyle } from '@services/crawler/searchTools';
import { getDecodedLink } from '@utils/crawler';
import { saveError } from '@utils/logger';
import * as FetchUtils from '@utils/fetchUtils';
import * as cheerio from 'cheerio';

let callCounter = 0;
let error429Time = 0;

export async function getFromGoogleCache(
    url: string, retryCounter = 0): Promise<{ $: any, links: any }> {
    try {
        while (callCounter > 4) {
            await new Promise((resolve => setTimeout(resolve, 200)));
        }
        if (Date.now() - error429Time < 20 * 60 * 1000) {
            //prevent call for 20min after getting 429 error
            return { $: null, links: [] };
        }
        callCounter++;

        const decodedLink = getDecodedLink(url);
        if (config.DEBUG_MODE) {
            console.log('google cache: ', decodedLink);
        }

        ServerAnalysisRepo.saveGoogleCacheCall(decodedLink);
        const cacheUrl = 'http://webcache.googleusercontent.com/search?channel=fs&client=ubuntu&q=cache%3A';
        const webCacheUrl = cacheUrl + decodedLink;
        let response = await FetchUtils.myFetch(webCacheUrl);
        await new Promise((resolve => setTimeout(resolve, 200)));
        callCounter--;
        response = removeScriptAndStyle(response);
        const $ = cheerio.load(response);
        const links = $('a');
        return { $, links };
    } catch (error: any) {
        callCounter--;
        if (FetchUtils.checkErrStatusRateLimit(error)) {
            error429Time = Date.now();
        }
        if (FetchUtils.checkErrStatusCodeBadUrl(error)) {
            if (retryCounter === 0) {
                const temp = url.replace(/\/$/, '').split('/').pop();
                if (temp) {
                    const tempEncode = encodeURIComponent(encodeURIComponent(temp));
                    url = url.replace(temp, tempEncode);
                    retryCounter++;
                    return await getFromGoogleCache(url, retryCounter);
                }
            }
            error.isFetchError = true;
            error.url = getDecodedLink(url);
            error.filePath = 'searchTools';
            await saveError(error);
        } else if (![404, 429].includes(FetchUtils.getErrStatusCode(error))) {
            saveError(error);
        }
        return { $: null, links: [] };
    }
}
