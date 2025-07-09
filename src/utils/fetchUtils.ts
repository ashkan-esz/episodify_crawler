import { createFetch } from 'ofetch';
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
