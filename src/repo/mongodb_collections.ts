import { logger } from '@/utils';
import { mongoDB } from '@services/database';
import { saveError } from '@utils/logger';

export async function createCollectionsAndIndexes(): Promise<void> {
    try {
        const database = await mongoDB.getDatabase();

        // Movies
        await database.createCollection(mongoDB.collections.movies);
        const moviesCollection = database.collection(mongoDB.collections.movies);
        await moviesCollection.createIndex({
            title: "text",
            rawTitle: "text",
            alternateTitles: "text",
            titleSynonyms: "text"
        }, {
            weights: {
                title: 3,
                rawTitle: 3,
                alternateTitles: 1,
                titleSynonyms: 1,
            },
        });
        await moviesCollection.createIndex({title: 1, type: 1, year: 1});
        await moviesCollection.createIndex({alternateTitles: 1});
        await moviesCollection.createIndex({titleSynonyms: 1});
        await moviesCollection.createIndex({apiIds: 1});
        await moviesCollection.createIndex({type: 1, releaseState: 1, 'rating.imdb': 1, 'rating.myAnimeList': 1});
        await moviesCollection.createIndex({year: -1, insert_date: -1});
        await moviesCollection.createIndex({update_date: -1, year: -1});
        await moviesCollection.createIndex({
            type: 1, //index prefix
            'rank.animeTopComingSoon': 1,
            'rank.animeTopAiring': 1,
            'rank.animeSeasonNow': 1,
            'rank.animeSeasonUpcoming': 1,
            'rank.comingSoon': 1,
            'rank.inTheaters': 1,
            'rank.boxOffice': 1,
            'rank.like': 1,
            'rank.like_month': 1,
            'rank.follow_month': 1,
            'rank.view_month': 1,
            'rating.imdb': 1,
            'rating.myAnimeList': 1
        });
        await moviesCollection.createIndex({status: 1, releaseDay: 1});
        await moviesCollection.createIndex({genres: 1});
        //usage: title, **alternateTitles**, **titleSynonyms**, type, year
        //usage: releaseState, type, rating.imdb, rating.myAnimeList, (sort: year, insert_date)
        //usage: releaseState, type, rating.imdb, rating.myAnimeList, (sort: update_date, year)
        //usage: releaseState, type, rating.imdb, rating.myAnimeList, trailers, (sort: year, add_date)
        //usage: rank.*, type, rating.imdb, rating.myAnimeList, (sort: rank)
        //usage: status, nextEpisode.releaseStamp, update_date, endYear, releaseDay, type, rating.imdb, rating.myAnimeList (sort: rating.imdb, rating.myAnimeList, _id)
        //usage: genres, type, rating.imdb, rating.myAnimeList, (sort: year, insert_date)

        // Server Analysis
        await database.createCollection(mongoDB.collections.serverAnalysis);
        const userAnalysisCollection = database.collection(mongoDB.collections.serverAnalysis);
        await userAnalysisCollection.createIndex({yearAndMonth: 1});
        //usage: userCounts.date

        // Links
        await database.createCollection(mongoDB.collections.links);
        const linksCollection = database.collection(mongoDB.collections.links);
        await linksCollection.createIndex({size: 1, addDate: 1});
        await linksCollection.createIndex({downloadLink: 1});
        //usage: sort: {size: 1, addDate: 1}
        //usage: downloadLink

        // Configs
        await database.createCollection(mongoDB.collections.configs);

        // Sources
        await database.createCollection(mongoDB.collections.sources);
    } catch (err2: any) {
        saveError(err2);
        logger.error(err2);
        throw err2;
    }
}
