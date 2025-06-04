import config from '@/config';
import { saveGoogleCacheCall } from '@/repo/serverAnalysis';
import { removeScriptAndStyle } from '@/searchTools';
import { getDecodedLink } from '@utils/crawler';
import { saveError } from '@utils/logger';
import axios from 'axios';
import * as cheerio from "cheerio";

let callCounter = 0;
let error429Time = 0;

export async function getFromGoogleCache(
    url: string, retryCounter:number = 0): Promise<{$: any, links: any}> {
    try {
        while (callCounter > 4) {
            await new Promise((resolve => setTimeout(resolve, 200)));
        }
        if (Date.now() - error429Time < 20 * 60 * 1000) {
            //prevent call for 20min after getting 429 error
            return {$: null, links: []};
        }
        callCounter++;

        const decodedLink = getDecodedLink(url);
        if (config.DEBUG_MODE) {
            console.log('google cache: ', decodedLink);
        }

        saveGoogleCacheCall(decodedLink);
        const cacheUrl = "http://webcache.googleusercontent.com/search?channel=fs&client=ubuntu&q=cache%3A";
        const webCacheUrl = cacheUrl + decodedLink;
        const response = await axios.get(webCacheUrl);
        await new Promise((resolve => setTimeout(resolve, 200)));
        callCounter--;
        response.data = removeScriptAndStyle(response.data);
        const $ = cheerio.load(response.data);
        const links = $('a');
        return {$, links};
    } catch (error: any) {
        callCounter--;
        if (error.message === 'Request failed with status code 429') {
            error429Time = Date.now();
        }
        if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
            if (retryCounter === 0) {
                const temp = url.replace(/\/$/, '').split('/').pop();
                if (temp) {
                    const tempEncode = encodeURIComponent(encodeURIComponent(temp));
                    url = url.replace(temp, tempEncode);
                    retryCounter++;
                    return await getFromGoogleCache(url, retryCounter);
                }
            }
            error.isAxiosError = true;
            error.url = getDecodedLink(url);
            error.filePath = 'searchTools';
            await saveError(error);
        } else if (!error.response || (error.response.status !== 404 && error.response.status !== 429)) {
            saveError(error);
        }
        return {$: null, links: []};
    }
}
