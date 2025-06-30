import type { MoviePosterS3 } from '@/types/movie';
import type { CastImage } from '@/types/staff';
import { kyselyDB } from '@services/database';
import { mapDbErrorCode, saveError } from '@utils/logger';
import { sql } from 'kysely';

export async function upsertStaff(
    name: string,
    rawName: string,
    data: any,
): Promise<{ id: number; image_data: any } | null> {
    try {
        const upserted = await kyselyDB
            .insertInto('staffs')
            .values({
                ...data,
                created_at: new Date(),
                name: name,
                raw_name: rawName,
            })
            .onConflict((oc) =>
                oc.column('name').doUpdateSet({
                    name: name,
                    raw_name: rawName,
                    gender: data.gender ?? '',
                    tvmaze_person_id: data.tvmaze_person_id ?? 0,
                    jikan_person_id: data.jikan_person_id ?? 0,
                    original_images: data.original_images ?? [],
                    about: data.about ?? '',
                    age: data.age ?? 0,
                    birthday: data.birthday ?? '',
                    country: data.country ?? '',
                    deathday: data.deathday ?? '',
                    eye_color: data.eye_color ?? '',
                    hair_color: data.hair_color ?? '',
                    height: data.height ?? '',
                    weight: data.weight ?? '',
                    likes_count: data.likes_count ?? 0,
                    dislikes_count: data.dislikes_count ?? 0,
                    follow_count: data.follow_count ?? 0,
                    image_data: data.image_data ?? null,
                    updated_at: data.updated_at ?? new Date(),
                }),
            )
            .returning(['id', 'image_data'])
            .executeTakeFirst();
        return upserted ?? null;
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function upsertCharacter(
    name: string,
    rawName: string,
    data: any,
): Promise<{ id: number; image_data: any } | null> {
    try {
        const upserted = await kyselyDB
            .insertInto('characters')
            .values({
                ...data,
                created_at: new Date(),
                name: name,
                raw_name: rawName,
            })
            .onConflict((oc) =>
                oc.column('name').doUpdateSet({
                    name: name,
                    raw_name: rawName,
                    gender: data.gender ?? '',
                    tvmaze_person_id: data.tvmaze_person_id ?? 0,
                    jikan_person_id: data.jikan_person_id ?? 0,
                    original_images: data.original_images ?? [],
                    about: data.about ?? '',
                    age: data.age ?? 0,
                    birthday: data.birthday ?? '',
                    country: data.country ?? '',
                    deathday: data.deathday ?? '',
                    eye_color: data.eye_color ?? '',
                    hair_color: data.hair_color ?? '',
                    height: data.height ?? '',
                    weight: data.weight ?? '',
                    likes_count: data.likes_count ?? 0,
                    dislikes_count: data.dislikes_count ?? 0,
                    favorite_count: data.follow_count ?? 0,
                    image_data: data.image_data ?? null,
                    updated_at: data.updated_at ?? new Date(),
                }),
            )
            .returning(['id', 'image_data'])
            .executeTakeFirst();
        return upserted ?? null;
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
    characterName: string,
    characterRole: string,
): Promise<number | null> {
    try {
        const actorPositionsJson = JSON.stringify(actorPositions);

        const checkExist = await kyselyDB
            .selectFrom('credits')
            .select(['id'])
            .where('movie_id', '=', movieId)
            .where('staff_id', '=', staffId || null)
            .where('character_id', '=', characterId || null)
            // @ts-ignore
            .where(sql`actor_positions @> ${actorPositionsJson}::jsonb`)
            // @ts-ignore
            .where(sql`actor_positions <@ ${actorPositionsJson}::jsonb`)
            .executeTakeFirst();

        if (checkExist) {
            return checkExist.id;
        }

        const inserted = await kyselyDB
            .insertInto('credits')
            .values({
                movie_id: movieId,
                staff_id: staffId || null,
                actor_positions: actorPositionsJson,
                character_id: characterId || null,
                character_name: characterName,
                character_role: characterRole,
                updated_at: new Date(),
            })
            .returning(['id'])
            .executeTakeFirst();
        return inserted?.id ?? null;
    } catch (error: any) {
        if (mapDbErrorCode(error.code) !== 'foreign_key_violation') {
            saveError(error);
        }
        return null;
    }
}

//-----------------------------------
//-----------------------------------

export async function addCastImage(
    id: number,
    type: string,
    data: MoviePosterS3,
): Promise<any | null> {
    try {
        const castImage: CastImage = {
            original_size: data.originalSize,
            original_url: data.originalUrl,
            size: data.size,
            thumbnail: data.thumbnail,
            blurHash: data.blurHash,
            url: data.url,
            vpn_status: data.vpnStatus,
        };

        if (type === 'staff') {
            return await kyselyDB
                .updateTable('staffs')
                .where('id', '=', id)
                .set({ image_data: castImage })
                .executeTakeFirst();
        }

        return await kyselyDB
            .updateTable('characters')
            .where('id', '=', id)
            .set({ image_data: castImage })
            .executeTakeFirst();
    } catch (error) {
        saveError(error);
        return null;
    }
}

//-----------------------------------
//-----------------------------------
