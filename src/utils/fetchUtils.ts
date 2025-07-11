import { $fetch, createFetch } from 'ofetch';
import { saveErrorIfNeeded } from '@utils/logger';
import { CookieJar } from 'tough-cookie';
// import { LRUCache } from 'lru-cache';

// const dnsCache =  new LRUCache({
//     max: 100,
//     maxSize: 100,
//     sizeCalculation: () => {
//         return 1;
//     },
//     ttl: 300000,
//     // ttlResolution: 5 * 1000,
// });

const cookieJar = new CookieJar();

//TODO : improve speed, optimize

export const myFetch = createFetch({
    // async onRequest({ request }) {
    //     const url = new URL(request.url);
    //     const hostname = url.hostname;
    //
    //     if (!dnsCache.has(hostname)) {
    //         const { address } = await dns.lookup(hostname);
    //         dnsCache.set(hostname, address);
    //     }
    //
    //     url.hostname = dnsCache.get(hostname);
    //     request.url = url.toString();
    // }
});

export default myFetch;

// Get the size of a file in
export async function getFileSize(url: string, opt: any = {}): Promise<number> {
    opt = {
        retryCounter: 0,
        retryWithSleepCounter: 0,
        ignoreError: false,
        timeout: 5000,
        errorReturnValue: 0,
        ...opt,
    };

    try {
        if (url.match(/^https?:\/\/ww\d+\./)) {
            return opt.errorReturnValue;
        }

        const headers: Record<string, string> = {};
        // Get cookies for current URL
        const cookieString = await cookieJar.getCookieString(url);
        if (cookieString) {
            headers.Cookie = cookieString;
        }

        const response = await $fetch.raw(url, {
            method: 'HEAD',
            timeout: opt.timeout,
            ignoreResponseError: true,
            redirect: 'follow',
            headers,
        });

        // Store received cookies
        const setCookies = response.headers.getAll('set-cookie');
        if (setCookies) {
            await Promise.all(
                setCookies.map(cookie =>
                    cookieJar.setCookie(cookie, response.url),
                ),
            );
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            return 0;
        }

        const contentLength = response.headers.get('content-length') || '0';
        return Number(contentLength) || 0;

    } catch (error: any) {
        if (
            checkErrStatusCodeTimeout(error) ||
            error.message === 'socket hang up' ||
            checkErrStatusCodeEAI(error) ||
            [502, 503].includes(getErrStatusCode(error))
        ) {
            return opt.errorReturnValue;
        }

        if (
            (checkErrStatusCode(error, 404) || checkErrStatusCodeBadUrl(error)) &&
            decodeURIComponent(url) === url &&
            opt.retryCounter < 1
        ) {
            opt.retryCounter++;
            const fileName = url.replace(/\/$/, '').split('/').pop() ?? '';
            const prevUrl = url;
            url = url.replace(fileName, encodeURIComponent(fileName));
            if (prevUrl !== url) {
                return await getFileSize(url, opt);
            }
        }

        if (checkNeedRetryWithSleep(error, opt.retryWithSleepCounter)) {
            opt.retryWithSleepCounter++;
            await new Promise((resolve) => setTimeout(resolve, 3000));
            return await getFileSize(url, opt);
        }

        if (!opt.ignoreError) {
            saveErrorIfNeeded(error);
        }

        return opt.errorReturnValue;
    }
}

//--------------------------------------------------------
//--------------------------------------------------------

export function getErrStatusCode(error: any): number {
    return error.status ?? error.statusCode ?? error.response?.status ?? 0;
}

export function checkErrStatusCode(error: any, code: number): boolean {
    return error.status === code ||
        error.statusCode === code ||
        error.response?.status === code;
}

export function checkErrStatusCodeTimeout(error: any): boolean {
    return error.message?.includes('operation was aborted') ||
        error.message?.includes('timeout');
}

export function checkErrStatusCodeEAI(error: any): boolean {
    return error.code === 'EAI_AGAIN' ||
        error.message?.includes('EAI_AGAIN');
}

export function checkErrStatusCodeBadUrl(error: any): boolean {
    return error.code === 'ERR_UNESCAPED_CHARACTERS' ||
        error.message.includes('Invalid URL') ||
        error.message.includes('URI malformed');
}

export function checkErrStatusRateLimit(error: any): boolean {
    return error.response?.data?.Error === 'Request limit reached!' ||
        error.response?.Error === 'Request limit reached!' ||
        error.data?.Error === 'Request limit reached!' ||
        error.message === 'Request failed with status code 429';
}

function checkNeedRetryWithSleep(error: any, retryWithSleepCounter: number): boolean {
    if (retryWithSleepCounter >= 2) {
        return false;
    }

    return (
        error.message === 'S3ServiceException: UnknownError' ||
        error.data?.message === 'S3ServiceException: UnknownError' ||

        error.message === '403: UnknownError' ||
        error.data?.message === '403: UnknownError' ||

        error.message === '504: UnknownError' ||
        error.data?.message === '504: UnknownError' ||

        error.message === 'RequestTimeTooSkewed: UnknownError' ||
        error.data?.message === 'RequestTimeTooSkewed: UnknownError' ||

        checkErrStatusCode(error, 429) ||
        getErrStatusCode(error) >= 500
    );
}
