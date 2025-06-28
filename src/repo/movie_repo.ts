import { TitleRelation } from '@/types/movie';
import { kyselyDB } from '@services/database';
import { saveError } from '@utils/logger';
import type { ObjectId } from 'mongodb';

export async function addRelatedMovies(
    id1Str: ObjectId,
    id2Str: ObjectId,
    relation: TitleRelation,
): Promise<string> {
    try {
        const id1 = id1Str.toString();
        const id2 = id2Str.toString();

        await kyselyDB.insertInto('related_movies').values({
            movie_id: id1,
            related_movie_id: id2,
            relation: relation,
        }).execute();

        if (relation === TitleRelation.PREQUEL) {
            await kyselyDB.insertInto('related_movies').values({
                movie_id: id2,
                related_movie_id: id1,
                relation: TitleRelation.SEQUEL,
            }).execute();

        } else if (relation === TitleRelation.SEQUEL) {
            await kyselyDB.insertInto('related_movies').values({
                movie_id: id2,
                related_movie_id: id1,
                relation: TitleRelation.PREQUEL,
            }).execute();

        } else if (relation === TitleRelation.SPIN_OFF || relation === TitleRelation.SIDE_STORY) {
            await kyselyDB.insertInto('related_movies').values({
                movie_id: id2,
                related_movie_id: id1,
                relation: relation,
            }).execute();
        }

        return 'ok';
    } catch (error: any) {
        if (error.code === 'P2003') {
            return 'notfound';
        }
        if (error.code !== 'P2002') {
            saveError(error);
            return 'error';
        }
        return 'ok';
    }
}

//-----------------------------------
//-----------------------------------
