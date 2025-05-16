import { saveError } from '@utils/logger';

import * as PosterExtractor from "./poster";
import * as TrailerExtractor from "./trailer";
import * as SummaryExtractor from "./summary";
import * as DownloadLinksExtractor from "./downloadLinks";

export {
    PosterExtractor,
    TrailerExtractor,
    SummaryExtractor,
    DownloadLinksExtractor,
}

export function getFixedSummary(summary: string): string {
    try {
        if (!summary) {
            return '';
        }
        return summary
            .replace(/<p>|<\/p>|<b>|<\/b>/g, '')
            .replace('[Written by MAL Rewrite]', '')
            .replace('N/A', '')
            .replace(/([.…])+$/, '')
            .trim();
    } catch (error) {
        saveError(error);
        return '';
    }
}

export function getFixedGenres(genres: string[]): string[] {
    try {
        if (!genres) {
            return [];
        }
        return genres.map(item => item.toLowerCase().trim().replace(/\s+/g, '-').replace('sports', 'sport'))
            .filter(item => item !== 'n/a' && item !== 'anime');
    } catch (error) {
        saveError(error);
        return [];
    }
}



export async function validateExtractedData(sourceNames: string[]): Promise<void> {
    await SummaryExtractor.comparePrevSummaryWithNewMethod(sourceNames);
    await PosterExtractor.comparePrevPosterWithNewMethod(sourceNames);
    await TrailerExtractor.comparePrevTrailerWithNewMethod(sourceNames);
    await DownloadLinksExtractor.comparePrevDownloadLinksWithNewMethod(sourceNames, "pageContent");
    await DownloadLinksExtractor.comparePrevDownloadLinksWithNewMethod(sourceNames, "checkRegex");
}
