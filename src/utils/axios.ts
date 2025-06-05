import https from 'https';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { saveErrorIfNeeded } from '@utils/logger';

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
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar }));
        const response = await client.head(url, { timeout: opt.timeout });
        if (response.headers['content-type'].includes('text/html')) {
            return 0;
        }
        return Number(response.headers['content-length']) || 0;
    } catch (error: any) {
        if (
            error.message === 'timeout of 5000ms exceeded' ||
            error.message === 'socket hang up' ||
            error.code === 'EAI_AGAIN' ||
            error.response?.status === 502 ||
            error.response?.status === 503
        ) {
            return opt.errorReturnValue;
        }
        if (
            ((error.response && error.response.status === 404) ||
                error.code === 'ERR_UNESCAPED_CHARACTERS') &&
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

export async function downloadImage(url: string, retryCounter = 0): Promise<any> {
    try {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar }));
        const timeout = url.includes('.s3.') ? 8000 : 5000;
        const response = await client.get(url, {
            responseType: 'arraybuffer',
            responseEncoding: 'binary',
            timeout: timeout,
            // Size limits
            maxContentLength: 50 * 1024 * 1024, // 50MB
            maxBodyLength: 50 * 1024 * 1024, // 50MB
        });
        if (response.headers['content-type'].includes('text/html')) {
            return null;
        }
        return response;
    } catch (error: any) {
        if (error.response?.statusText === 'Forbidden') {
            return null;
        }
        if (
            (error.response?.status === 404 ||
                error.code === 'ERR_UNESCAPED_CHARACTERS' ||
                error.message === 'socket hang up' ||
                error.code === 'EAI_AGAIN') &&
            decodeURIComponent(url) === url &&
            retryCounter < 1
        ) {
            retryCounter++;
            const fileName = url.replace(/\/$/, '').split('/').pop() ?? '';
            url = url.replace(fileName, encodeURIComponent(fileName));
            return await downloadImage(url, retryCounter);
        }
        if (
            (error.message === 'timeout of 8000ms exceeded' ||
                error.message === 'timeout of 5000ms exceeded') &&
            retryCounter < 2
        ) {
            retryCounter++;
            return await downloadImage(url, retryCounter);
        }
        if (error.code !== 'EAI_AGAIN') {
            saveErrorIfNeeded(error);
        }
        return null;
    }
}

export async function getResponseWithCookie(
    url: string,
    cookie: any,
    sourceHeaders: [],
    timeout?: number,
): Promise<any> {
    const config: any = {
        headers: {
            Cookie: cookie,
            ...sourceHeaders,
        },
    };
    if (timeout) {
        config.timeout = timeout;
    }
    try {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar }));
        return await client.get(url, config);
    } catch (error: any) {
        if (
            error.message === 'certificate has expired' ||
            error.code === 'ERR_TLS_CERT_ALTNAME_INVALID'
        ) {
            const agent = new https.Agent({
                rejectUnauthorized: false,
            });
            return await axios.get(url, {
                ...config,
                httpsAgent: agent,
            });
        } else {
            throw error;
        }
    }
}

export async function getArrayBufferResponse(url: string, cookie: any = null): Promise<any> {
    try {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar }));

        const config: any = {
            responseType: 'arraybuffer',
            responseEncoding: 'binary',
            // Size limits
            maxContentLength: 50 * 1024 * 1024, // 50MB
            maxBodyLength: 50 * 1024 * 1024, // 50MB
        };

        if (cookie) {
            config.headers = {
                Cookie: cookie,
            };
        }

        const result = await client.get(url, config);

        if (result.headers['content-type'] === 'text/html') {
            return null;
        }

        return result;
    } catch (error: any) {
        if (
            error.message === 'certificate has expired' ||
            error.code === 'ERR_TLS_CERT_ALTNAME_INVALID'
        ) {
            return null;
        }
        throw error;
    }
}

export async function getResponseUrl(url: string): Promise<string> {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar }));
    const response = await client.get(url);
    return response.request.res.responseUrl;
}

//------------------------------------------
//------------------------------------------

function checkNeedRetryWithSleep(error: any, retryWithSleepCounter: number): boolean {
    return (
        retryWithSleepCounter < 2 &&
        (error.message === 'S3ServiceException: UnknownError' ||
            error.message === '403: UnknownError' ||
            error.message === '504: UnknownError' ||
            error.message === 'RequestTimeTooSkewed: UnknownError' ||
            error.response?.status === 429 ||
            error.response?.status >= 500)
    );
}
