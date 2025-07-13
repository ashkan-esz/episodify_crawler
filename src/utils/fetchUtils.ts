import https from 'node:https';
import { createFetch, type FetchOptions } from 'ofetch';
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

export const myFetch = createFetch({
    defaults: {
        keepalive: true,
        timeout: 3000,
        retry: 2,
        retryDelay: 5000,
        headers: {
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        },
        redirect: 'follow',
        // Bun-specific optimizations
        // duplex: 'half',
        // verbose: false,
    },

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

// Get the response url
export async function getResponseUrl(url: string, opt: any = {}): Promise<string> {
    opt = {
        timeout: 5000,
        headers: {
            cookie: opt.cookie || '',
        },
        ...opt,
    };

    if (opt.headers.cookie) {
        await cookieJar.setCookie(opt.headers.cookie, url);
    } else {
        opt.headers.cookie = await cookieJar.getCookieString(url);
    }

    const response = await myFetch.raw(url, {
        timeout: opt.timeout,
        ignoreResponseError: true,
        redirect: 'follow',
        headers: opt.headers,
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

    return response.url || url;
}

export async function getResponseWithCookie(
    url: string,
    cookie: any,
    sourceHeaders: [],
    timeout?: number,
    agent?: https.Agent,
): Promise<{
    data: string;
    responseUrl: string;
}> {
    try {
        if (cookie) {
            await cookieJar.setCookie(cookie, url);
        } else {
            cookie = await cookieJar.getCookieString(url);
        }

        let responseUrl = '';

        const headers = { Cookie: cookie, ...sourceHeaders };
        const fetchOptions: FetchOptions = {
            headers,
            redirect: 'follow',
            timeout: timeout || 5000,
            retry: 2,
            retryDelay: 5000,
            // retryStatusCodes: [408, 409, 425, 429, 500, 502, 503, 504],
            retryStatusCodes: [408, 409, 425, 429, 502, 504],
            ignoreResponseError: true,
            agent: agent || undefined,
            responseType: 'text',
            onResponse: async ({ response }) => { // Adjusted to access response
                // Update cookie jar with response cookies
                const setCookies = response.headers.getSetCookie?.() || [];
                if (setCookies.length) {
                    const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
                    await Promise.all(cookies.map(c => cookieJar.setCookie(c, response.url)));
                }

                responseUrl = response.url;
            },
        };

        const response = await myFetch(url, fetchOptions);

        return {
            data: response,
            responseUrl: responseUrl || url,
        };
    } catch (error: any) {
        if (!agent) {
            if (
                checkErrStatusCertExpired(error) ||
                checkErrStatusAltNameInvalid(error) ||
                error.name === 'SSL_ERROR' ||
                error.code === 'SSL_ERROR') {
                const agent = new https.Agent({
                    rejectUnauthorized: false,
                });

                return await getResponseWithCookie(url, cookie, sourceHeaders, timeout, agent);
            }
        }

        throw error;
    }
}

// Get the size of a file
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

        const response = await myFetch.raw(url, {
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

export async function getArrayBufferResponse(url: string, cookie = ''): Promise<{
    data: any;
    headers: any;
} | null> {
    try {
        if (cookie) {
            await cookieJar.setCookie(cookie, url);
        } else {
            cookie = await cookieJar.getCookieString(url);
        }

        let responseHeaders: any = null;

        const response = await myFetch(url, {
            headers: {
                Cookie: cookie,
            },
            retry: 2,
            retryDelay: 5000,
            ignoreResponseError: true,
            redirect: 'follow',
            responseType: 'arrayBuffer',
            onResponse: async ({ response }) => {
                // Update cookie jar from response headers
                const setCookies = response.headers.getSetCookie();
                if (setCookies?.length) {
                    await Promise.all(setCookies.map(cookie =>
                        cookieJar.setCookie(cookie, response.url),
                    ));
                }

                responseHeaders = response.headers;
            },
        });

        // Check content type
        const contentType = responseHeaders?.get('content-type');
        if (contentType?.includes('text/html')) {
            return null;
        }

        return {
            data: response,
            headers: responseHeaders,
        };
    } catch (error: any) {
        if (
            checkErrStatusCertExpired(error) ||
            checkErrStatusAltNameInvalid(error)
        ) {
            return null;
        }
        throw error;
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

export function checkErrStatusCodeAborted(error: any): boolean {
    return error.name === 'AbortError' ||
        error.message?.includes('aborted');
}

export function checkErrStatusCodeTimeout(error: any): boolean {
    return error.message?.includes('operation was aborted') ||
        error.message?.includes('timeout') ||
        error.message?.startsWith('Request timed out after');
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

export function checkErrStatusCertExpired(error: any): boolean {
    return error.message?.includes('certificate has expired') ||
        error.cause?.code === 'CERT_HAS_EXPIRED';
}

export function checkErrStatusAltNameInvalid(error: any): boolean {
    return error.message?.includes('Hostname/IP') ||
        error.cause?.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
        error.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
        error.message?.includes('altname');
}

export function checkErrStatusNetworkError(error: any): boolean {
    const networkErrorCodes = [
        'ENOTFOUND',    // DNS lookup failed
        'ECONNRESET',   // Connection reset
        'ECONNREFUSED', // Connection refused
        'ETIMEDOUT',    // Connection timed out
        'EAI_AGAIN',     // Temporary DNS failure
        // 'UND_ERR_CONNECT_TIMEOUT',
    ];

    return error.name === 'FetchError' && (
        networkErrorCodes.includes(error.cause?.code) ||
        error.message.includes('getaddrinfo') ||
        error.message.includes('connection reset') ||
        error.message.includes('socket hang up')
    );
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
