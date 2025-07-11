import config from '@/config';
import { replaceSpecialCharacters } from '@utils/crawler';
import { saveError } from '@utils/logger';
import { youtube, type youtube_v3 } from '@googleapis/youtube';

export async function getTrailer(title: string, year: string): Promise<string | null> {
    try {
        const searchResult = ( youtube('v3').search.list({
            // @ts-expect-error ...
            auth: config.API_KEYS.googleApiKey,
            maxResults: 10,
            part: 'snippet',
            type: 'video',
            q: `${title} | Official Trailer`,
            // TODO : check this
            videoDuration: "short",
        })) as youtube_v3.Schema$SearchListResponse;

        title = replaceSpecialCharacters(title.toLowerCase());
        //@ts-expect-error ...
        const items = searchResult.data.items
            .filter((item: youtube_v3.Schema$SearchResult) => {
                const snippetTitle = replaceSpecialCharacters(
                    item.snippet?.title?.toLowerCase() ?? '',
                );
                return (
                    snippetTitle.includes(title) ||
                    snippetTitle.includes(replaceSpecialCharacters(title))
                );
            })
            .map((data: youtube_v3.Schema$SearchResult) => {
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
                    (item: youtube_v3.Schema$SearchResult) =>
                        item.snippet?.title?.endsWith(trailerTexts[i]) &&
                        //@ts-expect-error ...
                        (item.snippet?.publishTime?.startsWith(years[j] + '-') ||
                            item.snippet?.publishedAt?.startsWith(years[j] + '-')),
                );
                if (temp) {
                    return 'https://www.youtube.com/watch?v=' + temp.id.videoId;
                }
            }
        }

        for (let i = 0; i < trailerTexts.length; i++) {
            for (let j = 0; j < years.length; j++) {
                const temp = items.find(
                    (item: youtube_v3.Schema$SearchResult) =>
                        item.snippet?.title?.includes(trailerTexts[i]) &&
                        //@ts-expect-error ...
                        (item.snippet?.publishTime?.startsWith(years[j] + '-') ||
                            item.snippet?.publishedAt?.startsWith(years[j] + '-')),
                );
                if (temp) {
                    return 'https://www.youtube.com/watch?v=' + temp.id.videoId;
                }
            }
        }

        return null;
    } catch (error: any) {
        if (!error.errors?.[0]?.message?.includes('exceeded')) {
            saveError(error);
        }
        return null;
    }
}
