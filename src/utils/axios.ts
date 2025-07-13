import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';




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
