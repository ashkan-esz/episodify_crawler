import config from '@/config';
import { Crawler as CrawlerUtils, FetchUtils } from '@/utils';
import { saveError } from '@utils/logger';
import PQueue from 'p-queue';

const apiEndpoint = 'https://www.googleapis.com/youtube/v3/search';
const videoEndpoint = 'https://www.youtube.com/watch?v=';

const apiQueue = new PQueue({
    concurrency: 5, // Max concurrent requests
    timeout: 5000, // Per-task timeout (ms)
    throwOnTimeout: true,
    autoStart: true,
    // retry: 3, // Auto-retry failed tasks
    // retryDelay: (attemptCount: number) => attemptCount * 500, // Exponential
    // backoff
});

export async function getTrailer(title: string, year: string): Promise<string | null | void> {
    return await apiQueue.add<string | null>(() => processGetTrailer(title, year));
}

async function processGetTrailer(title: string, year: string, retryCount = 0): Promise<string | null> {
    try {
        const searchResult = await FetchUtils.myFetch<YouTubeSearchResponse>(apiEndpoint, {
            params: {
                part: 'snippet',
                type: 'video',
                q: `${title} | Official Trailer`,
                maxResults: 10,
                videoDuration: 'short',
                key: config.API_KEYS.googleApiKey,
                auth: config.API_KEYS.googleApiKey,
            },
            retry: 1,
            retryDelay: 3000,
            timeout: 3000,
            // parseResponse: JSON.parse,
        });

        title = CrawlerUtils.replaceSpecialCharacters(title.toLowerCase());

        const items: YouTubeSearchItem[] = searchResult.items
            .filter((item: YouTubeSearchItem) => {
                const snippetTitle = CrawlerUtils.replaceSpecialCharacters(
                    item.snippet?.title?.toLowerCase() ?? '',
                );
                return (
                    snippetTitle.includes(title) ||
                    snippetTitle.replace(/\s+/g, '').includes(title.replace(/\s+/g, '')) ||
                    snippetTitle.includes(
                        CrawlerUtils.replaceSpecialCharacters(title))
                );
            })
            .map((data: YouTubeSearchItem) => {
                if (data.snippet?.title) {
                    data.snippet.title = data.snippet.title
                        .toLowerCase()
                        .replace(/\s\(\d\d\d\d\)$/, '');
                }

                return data;
            });

        const trailerTexts = [
            'Official Trailer',
            'Official Anime Trailer',
            'TRAILER OFFICIEL',
            'Trailer',
            'Official Teaser',
        ].map((i) => i.toLowerCase());
        const NumYear = Number(year);
        const years: number[] = [NumYear, NumYear - 1, NumYear + 1];

        for (let i = 0; i < trailerTexts.length; i++) {
            for (let j = 0; j < years.length; j++) {
                const temp = items.find(
                    (item: YouTubeSearchItem) =>
                        item.snippet?.title?.endsWith(trailerTexts[i]) && (
                            item.snippet?.publishTime?.startsWith(years[j] + '-') ||
                            item.snippet?.publishedAt?.startsWith(years[j] + '-')
                        ),
                );
                if (temp) {
                    return videoEndpoint + temp.id.videoId;
                }
            }
        }

        for (let i = 0; i < trailerTexts.length; i++) {
            for (let j = 0; j < years.length; j++) {
                const temp = items.find(
                    (item: YouTubeSearchItem) =>
                        item.snippet?.title?.includes(trailerTexts[i]) && (
                            item.snippet?.publishTime?.startsWith(years[j] + '-') ||
                            item.snippet?.publishedAt?.startsWith(years[j] + '-')
                        ),
                );
                if (temp) {
                    return videoEndpoint + temp.id.videoId;
                }
            }
        }

        return null;
    } catch (error: any) {
        if (isRateLimitError(error)) {
            const retryAfter = getRetryAfter(error);
            saveError(`YouTube rate limit exceeded. Retrying after ${retryAfter}ms`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            retryCount++;
            if (retryCount < 2) {
                return processGetTrailer(title, year, retryCount);
            }
        }

        return null;
    }
}

function getRetryAfter(error: YouTubeApiError): number {
    // Check Retry-After header if available
    const retryHeader = error.headers?.get('Retry-After');
    if (retryHeader) {
        return Number.parseInt(retryHeader) * 1000;
    }

    // Exponential backoff based on error type
    const isQuotaExceeded = error.errors.some(err =>
        err.reason === 'quotaExceeded',
    );

    return isQuotaExceeded
        ? 60 * 1000  // 1 minute for quota exceeded
        : 5000;      // 5 seconds for rate limits
}

// TypeScript interfaces for YouTube API response
interface YouTubeThumbnail {
    url: string;
    width: number;
    height: number;
}

interface YouTubeThumbnails {
    default: YouTubeThumbnail;
    medium: YouTubeThumbnail;
    high: YouTubeThumbnail;
    standard?: YouTubeThumbnail;
    maxres?: YouTubeThumbnail;
}

interface YouTubeSnippet {
    publishedAt: string;
    publishTime?: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    channelTitle: string;
    liveBroadcastContent: string;
}

interface YouTubeSearchItemId {
    kind: string;
    videoId: string;
}

interface YouTubeSearchItem {
    kind: string;
    etag: string;
    id: YouTubeSearchItemId;
    snippet: YouTubeSnippet;
}

interface YouTubeSearchResponse {
    kind: string;
    etag: string;
    nextPageToken?: string;
    prevPageToken?: string;
    regionCode: string;
    pageInfo: {
        totalResults: number;
        resultsPerPage: number;
    };
    items: YouTubeSearchItem[];
}

// Define our simplified trailer type
// interface MovieTrailer {
//     id: string;
//     title: string;
//     channel: string;
//     publishedAt: Date;
//     thumbnailUrl: string;
// }

interface YouTubeApiError {
    code: number;
    message: string;
    headers: any;
    errors: {
        domain: string;
        reason: string;
        message: string;
    }[];
}

function isYouTubeApiError(error: unknown): error is YouTubeApiError {
    return typeof error === 'object' && error !== null && 'errors' in error;
}

function isRateLimitError(error: unknown): boolean {
    if (!isYouTubeApiError(error)) {
        return false;
    }

    return error.errors.some(err =>
        err.reason === 'rateLimitExceeded' ||
        err.reason === 'quotaExceeded' ||
        err.reason === 'userRateLimitExceeded'
    );
}
