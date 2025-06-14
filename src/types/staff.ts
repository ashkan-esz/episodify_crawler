import { VPNStatus } from '@/types/source';

export type Staff = {
    id             : number;
    name        : string;
    rawName        : string;
    tvmazePersonID : number;
    jikanPersonID  : number;
    gender         : string;
    originalImages : string[];
    about          : string;
    age            : number;
    birthday       : string;
    country        : string;
    deathday       : string;
    eyeColor       : string;
    hairColor      : string;
    height         : string;
    weight         : string;
    likes_count    : number;
    dislikes_count : number;
    follow_count   : number;
    insert_date    : Date;
    update_date    : Date;
};

export type Character = {
    id             : number;
    name        : string;
    rawName        : string;
    tvmazePersonID : number;
    jikanPersonID  : number;
    gender         : string;
    originalImages : string[];
    about          : string;
    age            : number;
    birthday       : string;
    country        : string;
    deathday       : string;
    eyeColor       : string;
    hairColor      : string;
    height         : string;
    weight         : string;
    likes_count    : number;
    dislikes_count : number;
    favorite_count   : number;
    insert_date    : Date;
    update_date    : Date;
};

export type Credit = {
    movieId: string;
    staffId: number | null;
    actorPositions: string[];
    characterId: number | null;
    characterName: string;
    characterRole: string;
};

export type CastImage = {
    originalSize: number;
    originalUrl: string;
    size: number;
    thumbnail: string;
    blurHash: string;
    url: string;
    vpnStatus: VPNStatus;
    staffId: number | null;
    characterId: number | null;
};
