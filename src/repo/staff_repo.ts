import { MoviePosterS3 } from '@/types/movie';
import { prisma } from '@services/database';
import { saveError } from '@utils/logger';

export async function upsertStaff(name: string, rawName: string, data: any): Promise<any | null> {
    try {
        return await prisma.staff.upsert({
            where: {
                name: name,
            },
            update: data,
            create: {
                ...data,
                name: name,
                rawName: rawName,
            },
            select: {
                id: true,
                imageData: true,
            },
        });
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function upsertCharacter(
    name: string,
    rawName: string,
    data: any,
): Promise<any | null> {
    try {
        return await prisma.character.upsert({
            where: {
                name: name,
            },
            update: data,
            create: {
                ...data,
                name: name,
                rawName: rawName,
            },
            select: {
                id: true,
                imageData: true,
            },
        });
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function insertOrUpdateCredit(
    movieId: string,
    staffId: number | null,
    characterId: number | null,
    actorPositions: string[],
    characterRole: string,
): Promise<any | null> {
    try {
        const checkExist = await prisma.credit.findFirst({
            where: {
                movieId: movieId,
                staffId: staffId || null,
                characterId: characterId || null,
                actorPositions: {
                    equals: actorPositions,
                },
            },
        });
        if (checkExist) {
            return checkExist;
        }
        return await prisma.credit.create({
            data: {
                movieId: movieId,
                staffId: staffId || null,
                characterId: characterId || null,
                actorPositions: actorPositions,
                characterRole: characterRole,
            },
        });
    } catch (error: any) {
        if (error.code !== 'P2002') {
            saveError(error);
        }
        return null;
    }
}

export async function addCastImage(
    id: number,
    type: string,
    data: MoviePosterS3,
): Promise<any | null> {
    try {
        if (type === 'staff') {
            return await prisma.castImage.upsert({
                where: {
                    staffId: id,
                },
                update: { ...data, blurHash: undefined },
                create: {
                    ...data,
                    staffId: id,
                    characterId: null,
                },
            });
        } else {
            return await prisma.castImage.upsert({
                where: {
                    characterId: id,
                },
                update: { ...data, blurHash: undefined },
                create: {
                    ...data,
                    staffId: null,
                    characterId: id,
                },
            });
        }
    } catch (error) {
        saveError(error);
        return null;
    }
}

//-----------------------------------
//-----------------------------------
