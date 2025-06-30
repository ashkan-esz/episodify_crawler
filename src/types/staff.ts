import type { VPNStatus } from '@/types/source';
import type {
    ColumnType,
    Generated,
    Insertable,
    JSONColumnType,
    Selectable,
    Updateable,
} from 'kysely';

export interface StaffTable {
    id: Generated<number>;
    created_at: ColumnType<Date, Date | string | undefined, never>;
    updated_at: ColumnType<Date, Date | string | undefined, Date | string | undefined>;
    name: string;
    raw_name: string;
    tvmaze_person_id: number;
    jikan_person_id: number;
    gender: string;
    original_images: string[];
    about: string;
    age: number;
    birthday: string;
    country: string;
    deathday: string;
    eye_color: string;
    hair_color: string;
    height: string;
    weight: string;
    likes_count: number;
    dislikes_count: number;
    follow_count: number;
    image_data: JSONColumnType<
        CastImage | null,
        CastImage | null | undefined,
        CastImage | null | undefined>;
}

export interface CharacterTable {
    id: Generated<number>;
    created_at: ColumnType<Date, string | undefined, never>;
    updated_at: ColumnType<Date, Date | string | undefined, Date | string | undefined>;
    name: string;
    raw_name: string;
    tvmaze_person_id: number;
    jikan_person_id: number;
    gender: string;
    original_images: string[];
    about: string;
    age: number;
    birthday: string;
    country: string;
    deathday: string;
    eye_color: string;
    hair_color: string;
    height: string;
    weight: string;
    likes_count: number;
    dislikes_count: number;
    favorite_count: number;
    image_data: JSONColumnType<
        CastImage | null,
        CastImage | null | undefined,
        CastImage | null | undefined>;
}

export interface CreditTable {
    id: Generated<number>;
    created_at: ColumnType<Date, Date | string | undefined, never>;
    updated_at: ColumnType<
        Date,
        Date | string | undefined,
        Date | string | undefined>;
    movie_id: string;
    staff_id: number | null;
    actor_positions: JSONColumnType<string[], string, string[]>;
    character_id: number | null;
    character_name: string;
    character_role: string;
}

export interface CastImage {
    original_size: number;
    original_url: string;
    size: number;
    thumbnail: string;
    blurHash: string;
    url: string;
    vpn_status: VPNStatus;
}

export type Staff = Selectable<StaffTable>
export type NewStaff = Insertable<StaffTable>
export type StaffUpdate = Updateable<StaffTable>

export type Character = Selectable<CharacterTable>
export type NewCharacter = Insertable<CharacterTable>
export type CharacterUpdate = Updateable<CharacterTable>

export type Credit = Selectable<CreditTable>
export type NewCredit = Insertable<CreditTable>
export type CreditUpdate = Updateable<CreditTable>
