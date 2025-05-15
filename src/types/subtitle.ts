import { MovieType } from '@/types/source';
import { getDecodedLink, getSeasonEpisode } from '@utils/crawler';

export type GroupedSubtitle = {
    seasonNumber: number,
    links: Subtitle[],
    checked?: boolean;
}

export type Subtitle = {
    link: string;
    info: string;
    sourceName: string;
    season: number;
    episode: number;
    direct: boolean;
};

export function getSubtitleModel(
    link: string,
    info: string,
    movieType: MovieType,
    sourceName: string,
    direct: boolean = true,
): Subtitle {
    let season = 0,
        episode = 0;
    if (movieType.includes('serial')) {
        ({ season, episode } = getSeasonEpisode(link));
        if (season !== 0 && episode === 0) {
            const temp = 'AllEpisodesOf(Season ' + season + ')';
            info = info ? info + '.' + temp : temp;
        }
        const decodedLink = getDecodedLink(link).replace(/\s+-\s+/g, '-');
        const multiEpisodeMatch = decodedLink.match(
            /(?<=[._\-\s])(s\d\d?)?(E?)\d{1,4}(([._\-])?(E?)\d{1,4})+(?=[._\-\s])/gi,
        );
        if (multiEpisodeMatch) {
            const temp = multiEpisodeMatch
                .pop()
                ?.replace(/(s\d\d?)|(^e)/i, '')
                .split(/[e._\-]/gi)
                .filter((item) => item);
            if (temp) {
                const number1 = Number(temp[0]);
                const number2 = Number(temp.pop());
                if (number1 !== number2 && number1 < 2000) {
                    if (season === 1 && episode === 0 && number1 === 0 && number2 !== 0) {
                        episode = number2;
                        info = '';
                    } else {
                        const text = `Episode(${number1}-${number2})`;
                        info = info ? info + '.' + temp : text;
                    }
                } else if (season === 1 && episode === 0 && number1 === number2 && number1 !== 0) {
                    episode = number2;
                    info = '';
                }
            }
        }
    }

    return {
        link: link.trim(),
        info: info,
        sourceName: sourceName,
        season: season,
        episode: episode,
        direct: direct,
    };
}
