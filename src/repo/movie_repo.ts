import { TitleRelation } from '@/types/movie';
import { prisma } from '@services/database';
import { saveError } from '@utils/logger';
import { ObjectId } from 'mongodb';

export async function addRelatedMovies(
    id1Str: ObjectId,
    id2Str: ObjectId,
    relation: TitleRelation,
): Promise<string> {
    try {
        const id1 = id1Str.toString();
        const id2 = id2Str.toString();
        await prisma.relatedMovie.create({
            data: {
                movieId: id1,
                relatedId: id2,
                relation: relation,
            },
            select: {
                movieId: true,
            },
        });

        if (relation === TitleRelation.PREQUEL) {
            await prisma.relatedMovie.create({
                data: {
                    movieId: id2,
                    relatedId: id1,
                    relation: TitleRelation.SEQUEL,
                },
                select: {
                    movieId: true,
                },
            });
        } else if (relation === TitleRelation.SEQUEL) {
            await prisma.relatedMovie.create({
                data: {
                    movieId: id2,
                    relatedId: id1,
                    relation: TitleRelation.PREQUEL,
                },
                select: {
                    movieId: true,
                },
            });
        } else if (relation === TitleRelation.SPIN_OFF || relation === TitleRelation.SIDE_STORY) {
            await prisma.relatedMovie.create({
                data: {
                    movieId: id2,
                    relatedId: id1,
                    relation: relation,
                },
                select: {
                    movieId: true,
                },
            });
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
