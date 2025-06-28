import type { MovieType } from '@/types';
import type { Movie, TitleObj } from '@/types/movie';
import { kyselyDB, mongoDB } from '@services/database';
import { saveError } from '@utils/logger';
import type { ObjectId } from 'mongodb';

export async function searchTitleDB(
    titleObj: TitleObj,
    searchTypes: MovieType[],
    year: string,
    dataConfig: any,
): Promise<Movie[]> {
    try {
        const searchObj: any = {
            $or: [
                { title: titleObj.title },
                { title: titleObj.title.replace('uu', 'u') },
                { title: titleObj.title.replace('u', 'uu') },
                { title: titleObj.title.replace(' o', ' wo') },
                { title: titleObj.title.replace(' wo', ' o') },
                { title: { $in: titleObj.alternateTitles } },
                { title: { $in: titleObj.titleSynonyms } },
                { alternateTitles: titleObj.title },
                { titleSynonyms: titleObj.title },
            ],
            type: { $in: searchTypes },
        };

        try {
            const temp = titleObj.title
                .split('')
                .map((item) => (item ? item.trim() + '\\s?' : '\\s?'))
                .join('')
                .replace(/\*/g, '\\*')
                .replace(/\\s\?\\s\?/g, '\\s?')
                .replace(/\\s\?$/, '');

            searchObj['$or'].push({
                title: new RegExp('^' + temp + '$'),
            });
            searchObj['$or'].push({
                title: new RegExp('^' + temp.replace(/uu/g, 'uu?') + '$'),
            });
            searchObj['$or'].push({
                title: new RegExp('^' + temp.replace(/u+/g, 'uu?') + '$'),
            });
            searchObj['$or'].push({
                title: new RegExp('^' + temp.replace(/e+(\\s\?e+)?/g, 'ee?') + '$'),
            });
            searchObj['$or'].push({
                title: new RegExp('^' + temp.replace(/\\s\?o/g, '\\s?w?\\s?o') + '$'),
            });
            searchObj['$or'].push({
                title: new RegExp('^' + temp.replace(/\\s\?w\\s\?o/g, '\\s?w?\\s?o') + '$'),
            });
            searchObj['$or'].push({
                title: new RegExp(
                    '^' + temp.replace(/\d\\s\?\d/g, (r) => r.replace('\\s?', '\/')) + '$',
                ),
            });
        } catch (error2) {
            saveError(error2);
        }

        if (year) {
            searchObj.year = year;
            try {
                const temp = titleObj.title
                    .split('')
                    .map((item) => item.trim() + '\\s?')
                    .join('')
                    .replace(/\*/g, '\\*')
                    .replace(/\\s\?$/, '');
                searchObj['$or'].push({
                    title: new RegExp('^' + temp + '$'),
                });

                if (!titleObj.title.startsWith('the ')) {
                    searchObj['$or'].push({
                        title: 'the ' + titleObj.title,
                    });
                    searchObj['$or'].push({
                        title: titleObj.title.replace('the ', ''),
                    });
                }
            } catch (error2) {
                saveError(error2);
            }
        }

        try {
            searchObj['$or'].push({
                alternateTitles: createSearchRegexOnAlternativeTitles(titleObj.title),
            });
        } catch (error2) {
            saveError(error2);
        }

        if (titleObj.title.match(/\s\d$/)) {
            const romanNumerals = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi'];
            const temp = titleObj.title.replace(/(\d+)$/, (match, number) => {
                const num = Number.parseInt(number, 10);
                return romanNumerals[num] || num.toString();
            });

            try {
                searchObj['$or'].push({
                    alternateTitles: createSearchRegexOnAlternativeTitles(temp),
                });
            } catch (error2) {
                saveError(error2);
            }
        }

        const db = await mongoDB.getDatabase();
        return await db
            .collection(mongoDB.collections.movies)
            .find<Movie>(searchObj, { projection: dataConfig })
            .toArray();
    } catch (error) {
        saveError(error);
        return [];
    }
}

function createSearchRegexOnAlternativeTitles(title: string): RegExp {
    let temp2 = title
        .split('')
        .map((item) => {
            if (item === ' ') {
                item = ',?:?-?\\.?\\s?';
            } else {
                item = `${item}\\\'?`;
            }
            return item;
        })
        .join('')
        .replace(/\*/g, '\\*');

    temp2 = temp2.replace(/e/g, '[eéëèēê]');

    return new RegExp('^' + temp2 + '!?\\.?\\??$', 'i');
}

export async function searchOnMovieCollectionDB(
    searchQuery: any,
    projection = {},
): Promise<Movie | null> {
    try {
        const db = await mongoDB.getDatabase();
        return await db
            .collection(mongoDB.collections.movies)
            .findOne<Movie>(searchQuery, { projection: projection });
    } catch (error) {
        saveError(error);
        return null;
    }
}

//-----------------------------------
//-----------------------------------

export async function findOneAndUpdateMovieCollection(
    searchQuery: any,
    updateFields: any,
): Promise<string> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        const result = await collection.updateOne(searchQuery, {
            $set: updateFields,
        });
        if (result.modifiedCount === 0) {
            return 'notfound';
        }
        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

//-----------------------------------
//-----------------------------------

export async function insertMovieToDB(dataToInsert: Movie): Promise<{
    mongoID: ObjectId | null,
    sqlOK: boolean
}> {
    let mongoID: ObjectId | null = null;
    let sqlOK = false;

    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        const result = await collection.insertOne(dataToInsert);
        mongoID = result.insertedId;

        try {
            await kyselyDB.insertInto('movies').values({
                movie_id: result.insertedId.toString(),
                likes_count: 0,
                dislikes_count: 0,
                favorite_count: 0,
                dropped_count: 0,
                finished_count: 0,
                follow_count: 0,
                watchlist_count: 0,
                continue_count: 0,
                view_count: 0,
                view_month_count: 0,
            }).execute();
            sqlOK = true;
        } catch (sqlError) {
            saveError(sqlError, {
                context: 'Kysely insert in insertMovieToDB',
                movieId: result.insertedId.toString(),
            });
        }
    } catch (mongoError) {
        saveError(mongoError, { context: 'Mongo insert in insertMovieToDB' });
    }

    return { mongoID, sqlOK };
}

export async function updateMovieByIdDB(
    id: ObjectId,
    updateFields: any,
    maxRetries = 3,
): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const db = await mongoDB.getDatabase();
            const collection = db.collection(mongoDB.collections.movies);
            const result = await collection.updateOne(
                { _id: id },
                {
                    $set: updateFields,
                },
                {
                    maxTimeMS: 6 * 1000,
                },
            );
            if (result.modifiedCount === 0) {
                return 'notfound';
            }
            return 'ok';
        } catch (error) {
            if (attempt === maxRetries) {
                saveError(error);
                return 'error';
            }
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
    }
    return 'error';
}

//-----------------------------------
//-----------------------------------

export async function resetTempRank(isAnime = false): Promise<string> {
    try {
        const tempRankFieldName = isAnime ? 'tempRank_anime' : 'tempRank';
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        await collection.updateMany(
            {},
            {
                $set: {
                    [tempRankFieldName]: -1,
                },
            },
        );
        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function replaceRankWithTempRank(
    rankField: string,
    isAnime = false,
): Promise<string> {
    try {
        const tempRankFieldName = isAnime ? 'tempRank_anime' : 'tempRank';
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        await collection.updateMany(
            {
                [tempRankFieldName]: { $exists: true },
            },
            [
                {
                    $set: {
                        [`rank.${rankField}`]: `$${tempRankFieldName}`,
                    },
                },
                {
                    $unset: tempRankFieldName,
                },
            ],
        );
        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function changeMoviesReleaseStateDB(
    currentState: string,
    newState: string,
    types: MovieType[],
): Promise<string> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        await collection.updateMany(
            {
                releaseState: currentState,
                type: { $in: types },
            },
            {
                $set: {
                    releaseState: newState,
                },
            },
        );
        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

//-----------------------------------
//-----------------------------------

export async function getDuplicateTitleInsertion(
    sourceName: string,
    pageLink: string,
): Promise<any[]> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.movies);
        return await collection.aggregate([
            {
                $match: {
                    sources: [{ sourceName: sourceName, pageLink: pageLink }],
                },
            },
            {
                $group: {
                    _id: {
                        title: '$title',
                        year: '$year',
                        premiered: '$premiered',
                        endYear: '$endYear',
                    },
                    count: { '$sum': 1 },
                    insert_dates: { $push: '$insert_date' },
                    ids: { $push: '$_id' },
                },
            },
            {
                $match: {
                    _id: { '$ne': null },
                    count: { '$gt': 1 },
                },
            },
            {
                $sort: { count: -1 },
            },
            {
                $project: {
                    title: '$_id',
                    _id: 0,
                    count: 1,
                    insert_dates: 1,
                    ids: 1,
                },
            },
        ]).toArray();
    } catch (error) {
        saveError(error);
        return [];
    }
}
