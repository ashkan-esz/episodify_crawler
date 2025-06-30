import {
    type CrawlerExtraConfigs,
    ExtraConfigsSwitchState,
} from '@/types';
import type { Credit } from '@/types/staff';
import { Jikan } from '@/providers/index';
import { extractStaffDataFromJikanAbout } from '@/providers/utils';
import {
    changePageLinkStateFromCrawlerStatus,
    checkForceStopCrawler,
} from '@/status/status';
import { saveError } from '@utils/logger';
import type { ObjectId } from 'mongodb';
import PQueue from 'p-queue';
import { StaffRepo } from '@/repo';
import { Crawler as CrawlerUtils } from '@/utils';
import { S3Storage } from '@/storage';

//TODO : use dynamic config
const _maxStaffOrCharacterSize = 150;
const _pqConcurrency = 8;
const _maxCastConcurrency = 2;
let _castConcurrency = 0;

//-----------------------------------------------------
//-----------------------------------------------------

export async function addStaffAndCharacters(
    pageLink: string,
    movieId: ObjectId,
    allApiData: any,
    castUpdateDate: Date | null,
    extraConfigs: CrawlerExtraConfigs | null = null,
): Promise<void> {
    try {
        //castUpdateState is none|ignore|force
        if (extraConfigs?.castUpdateState === ExtraConfigsSwitchState.IGNORE) {
            return;
        }
        if (castUpdateDate !== null && CrawlerUtils.getDatesBetween(new Date(), new Date(castUpdateDate)).days < 30 &&
            extraConfigs?.castUpdateState !== ExtraConfigsSwitchState.FORCE) {
            return;
        }

        // let {omdbApiFields, tvmazeApiFields, jikanApiFields} = allApiData;
        const { tvmazeApiFields, jikanApiFields } = allApiData;

        const credits: Credit[] = [];

        if (checkForceStopCrawler()) {
            return;
        }
        if (tvmazeApiFields) {
            await addTvMazeActorsAndCharacters(pageLink, movieId, tvmazeApiFields.cast, credits);
        }

        if (checkForceStopCrawler()) {
            return;
        }

        if (jikanApiFields) {
            changePageLinkStateFromCrawlerStatus(pageLink, ' ([3/6] jikan: fetching staff/character list)', true);

            while (_castConcurrency >= _maxCastConcurrency) {
                changePageLinkStateFromCrawlerStatus(pageLink, ` (exceed concurrency limit: ${_castConcurrency}/${_maxCastConcurrency})`, true);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            _castConcurrency++;

            const jikanCharatersStaff = await Jikan.getCharactersStaff(jikanApiFields.jikanID);
            if (jikanCharatersStaff) {
                await handleJikanStaff(pageLink, movieId, jikanCharatersStaff.staff, credits);
                await handleJikanStaff_voiceActors(pageLink, movieId, jikanCharatersStaff.characters, credits);
                await handleJikanCharaters(pageLink, movieId, jikanCharatersStaff.characters, credits);
            }
            _castConcurrency--;
        }
        changePageLinkStateFromCrawlerStatus(pageLink, ' ([6/6] updating credits)', true);
        await handleCredits(credits);
    } catch (error) {
        saveError(error);
    }
}

//-----------------------------------------------------
//-----------------------------------------------------

async function addTvMazeActorsAndCharacters(
    pageLink: string,
    movieId: ObjectId,
    tvmazeCast: any,
    credits: Credit[],
): Promise<void> {
    for (let i = 0; i < tvmazeCast.length; i++) {
        changePageLinkStateFromCrawlerStatus(pageLink, ` ([1/6] tvmaze-staff: ${i + 1}/${tvmazeCast.length})`, true);
        if (checkForceStopCrawler()) {
            break;
        }
        const countryName = tvmazeCast[i].person.country?.name?.toLowerCase() || '';
        const originalImages = [tvmazeCast[i].person.image?.medium, tvmazeCast[i].person.image?.original].filter(item => item);
        const positions: string[] = tvmazeCast[i].voice ? ['Voice Actor'] : ['Actor'];
        const birthday = tvmazeCast[i].person.birthday;
        const deathday = tvmazeCast[i].person.deathday;
        let age = 0;
        if (birthday && deathday === null) {
            const birthYear = Number(birthday.split('-')[0]);
            const currentYear = new Date().getFullYear();
            age = currentYear - birthYear;
        }

        const rawName = CrawlerUtils.fixJapaneseCharacter(tvmazeCast[i].person.name);
        const name = CrawlerUtils.replaceSpecialCharacters(rawName.toLowerCase());
        const gender = tvmazeCast[i].person.gender?.toLowerCase() || '';
        const staffData = {
            gender: gender,
            tvmaze_person_id: tvmazeCast[i].person.id,
            country: countryName,
            birthday: birthday,
            deathday: deathday,
            age: age,
            original_images: originalImages,
        };
        const keys = Object.keys(staffData);
        for (let j = 0; j < keys.length; j++) {
            // @ts-expect-error ...
            if (!staffData[keys[j]]) {
                // @ts-expect-error ...
                delete staffData[keys[j]];
            }
        }
        const createStaffResult = await StaffRepo.upsertStaff(name, rawName, staffData);
        if (createStaffResult) {
            const characterName = CrawlerUtils.fixJapaneseCharacter(tvmazeCast[i].character.name);
            credits.push({
                id: 0,
                movie_id: movieId.toString(),
                staff_id: createStaffResult.id,
                character_id: null,
                actor_positions: positions,
                character_name: characterName,
                character_role: '',
                created_at: new Date(),
                updated_at: new Date(),
            });
            if (!createStaffResult.image_data) {
                const castImage = await S3Storage.uploadCastImageToS3ByURl(name, 'staff', createStaffResult.id, originalImages[0]);
                if (castImage) {
                    const res = await StaffRepo.addCastImage(createStaffResult.id, 'staff', castImage);
                    if (res && res.blurHash === '') {
                        // TODO : implement
                        // await rabbitmqPublisher.addBlurHashToQueue(rabbitmqPublisher.blurHashTypes.staff, createStaffResult.id, castImage.url)
                    }
                }
            }
        }
    }

    for (let i = 0; i < tvmazeCast.length; i++) {
        changePageLinkStateFromCrawlerStatus(pageLink, ` ([2/6] tvmaze-character: ${i + 1}/${tvmazeCast.length})`, true);
        if (checkForceStopCrawler()) {
            break;
        }
        const originalImages = [tvmazeCast[i].character.image?.medium, tvmazeCast[i].character.image?.original].filter(item => item);
        const rawName = CrawlerUtils.fixJapaneseCharacter(tvmazeCast[i].character.name);
        const name = CrawlerUtils.replaceSpecialCharacters(rawName.toLowerCase());
        const characterData = {
            tvmaze_person_id: tvmazeCast[i].character.id,
            original_images: originalImages,
        };
        const createCharacterResult = await StaffRepo.upsertCharacter(name, rawName, characterData);
        if (createCharacterResult) {
            credits.push({
                id: 0,
                movie_id: movieId.toString(),
                staff_id: null,
                character_id: createCharacterResult.id,
                actor_positions: [],
                character_name: rawName,
                character_role: '',
                created_at: new Date(),
                updated_at: new Date(),
            });
            if (!createCharacterResult.image_data) {
                const castImage = await S3Storage.uploadCastImageToS3ByURl(name, 'character', createCharacterResult.id, originalImages[0]);
                if (castImage) {
                    const res = await StaffRepo.addCastImage(createCharacterResult.id, 'character', castImage);
                    if (res && res.blurHash === '') {
                        // TODO : implement
                        // await rabbitmqPublisher.addBlurHashToQueue(rabbitmqPublisher.blurHashTypes.character, createCharacterResult.id, castImage.url)
                    }
                }
            }
        }
    }
}

//-----------------------------------------------------
//-----------------------------------------------------

async function handleJikanStaff_voiceActors(
    pageLink: string,
    movieId: ObjectId,
    jikanCharactersArray: any[],
    credits: Credit[],
): Promise<void> {
    const voiceActors: any[] = [];
    for (let i = 0; i < jikanCharactersArray.length; i++) {
        const thisCharacterVoiceActors = jikanCharactersArray[i].voice_actors;
        for (let j = 0; j < thisCharacterVoiceActors.length; j++) {
            if (thisCharacterVoiceActors[j].language.toLowerCase() === 'japanese') {
                thisCharacterVoiceActors[j].positions = ['Voice Actor'];
                thisCharacterVoiceActors[j].characterName = jikanCharactersArray[i].character.name.split(',').map((item: string) => item.trim()).reverse().join(' ');
                thisCharacterVoiceActors[j].characterRole = jikanCharactersArray[i].role;
                voiceActors.push(thisCharacterVoiceActors[j]);
            }
        }
    }
    await handleJikanStaff(pageLink, movieId, voiceActors, credits, true);
}

async function handleJikanStaff(
    pageLink: string,
    movieId: ObjectId,
    jikanStaffArray: any[],
    credits: Credit[],
    isVoiceActors = false,
): Promise<void> {
    if (isVoiceActors) {
        changePageLinkStateFromCrawlerStatus(pageLink, ' ([4/6] jikan-voiceActor: 0/?)', true);
    } else {
        changePageLinkStateFromCrawlerStatus(pageLink, ' ([3/6] jikan-staff: 0/?)', true);
    }
    const promiseQueue = new PQueue({ concurrency: _pqConcurrency });
    for (let i = 0; i < jikanStaffArray.length && i < _maxStaffOrCharacterSize; i++) {
        if (checkForceStopCrawler()) {
            promiseQueue.clear();
            break;
        }
        promiseQueue.add(() => Jikan.getPersonInfo(jikanStaffArray[i].person.mal_id).then(async (staffApiData) => {
            if (staffApiData) {
                await addStaffOrCharacterFromJikanData(movieId, jikanStaffArray[i], staffApiData, 'staff', credits);
            }
        })).catch(error => saveError(error));
    }

    let counter = 0;
    let total = Math.min(jikanStaffArray.length, _maxStaffOrCharacterSize);
    promiseQueue.on('next', () => {
        counter++;
        if (isVoiceActors) {
            changePageLinkStateFromCrawlerStatus(pageLink, ` ([4/6] jikan-voiceActor: ${counter}(+${promiseQueue.pending})/${total})`, true);
        } else {
            changePageLinkStateFromCrawlerStatus(pageLink, ` ([3/6] jikan-staff: ${counter}(+${promiseQueue.pending})/${total})`, true);
        }
        if (checkForceStopCrawler()) {
            promiseQueue.clear();
        }
    });
    await promiseQueue.onIdle();
}

async function handleJikanCharaters(
    pageLink: string,
    movieId: ObjectId,
    jikanCharatersArray: any[],
    credits: Credit[],
): Promise<void> {
    changePageLinkStateFromCrawlerStatus(pageLink, ' ([5/6] jikan-characters: 0/?)', true);
    const promiseQueue = new PQueue({ concurrency: _pqConcurrency });
    for (let i = 0; i < jikanCharatersArray.length && i < _maxStaffOrCharacterSize; i++) {
        if (checkForceStopCrawler()) {
            promiseQueue.clear();
            break;
        }
        const index = i;
        if (!jikanCharatersArray[index].character?.mal_id) {
            continue;
        }
        promiseQueue.add(() => Jikan.getCharacterInfo(jikanCharatersArray[index].character.mal_id).then(async (characterApiData) => {
            if (characterApiData) {
                await addStaffOrCharacterFromJikanData(movieId, jikanCharatersArray[i], characterApiData, 'character', credits);
            }
        })).catch(error => saveError(error));
    }

    let counter = 0;
    const total = Math.min(jikanCharatersArray.length, _maxStaffOrCharacterSize);
    promiseQueue.on('next', () => {
        counter++;
        changePageLinkStateFromCrawlerStatus(pageLink, ` ([5/6] jikan-characters: ${counter}(+${promiseQueue.pending})/${total})`, true);
        if (checkForceStopCrawler()) {
            promiseQueue.clear();
        }
    });
    await promiseQueue.onIdle();
}

//-----------------------------------------------------
//-----------------------------------------------------

async function addStaffOrCharacterFromJikanData(
    movieId: ObjectId,
    SemiData: any,
    fullApiData: any,
    type: string,
    credits: Credit[],
): Promise<void> {
    const extractedData = extractStaffDataFromJikanAbout(fullApiData);

    const originalImages: string[] = [];
    if (fullApiData.images) {
        if (fullApiData.images.webp) {
            const imageUrl = fullApiData.images.webp.image_url;
            if (imageUrl && !imageUrl.includes('/icon/')) {
                originalImages.push(imageUrl);
            }
        }
        if (fullApiData.images.jpg) {
            const imageUrl = fullApiData.images.jpg.image_url;
            if (imageUrl && !imageUrl.includes('/icon/')) {
                originalImages.push(imageUrl);
            }
        }
    }

    if (!fullApiData.name) {
        return;
    }
    const rawName = CrawlerUtils.fixJapaneseCharacter(fullApiData.name);
    const name = CrawlerUtils.replaceSpecialCharacters(rawName.toLowerCase());
    const data = {
        about: (fullApiData.about || '').trim().replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' '),
        jikan_person_id: fullApiData.mal_id,
        original_images: originalImages.filter(item => item),
        ...extractedData,
    };
    const keys = Object.keys(data);
    for (let j = 0; j < keys.length; j++) {
        // @ts-expect-error ...
        if (!data[keys[j]]) {
            // @ts-expect-error ...
            delete data[keys[j]];
        }
    }

    if (type === 'staff') {
        const createStaffResult = await StaffRepo.upsertStaff(name, rawName, data);
        if (createStaffResult) {
            const characterName = CrawlerUtils.fixJapaneseCharacter(SemiData.characterName || '');

            const findCredit = credits.find(c => c.movie_id.toString() === movieId.toString() &&
                c.staff_id === createStaffResult.id &&
                c.actor_positions[0] === SemiData.positions[0] &&
                (!c.character_name || c.character_name === characterName));
            if (findCredit) {
                findCredit.actor_positions = SemiData.positions;
                if (!findCredit.character_name) {
                    findCredit.character_name = characterName;
                }
                if (!findCredit.character_role) {
                    findCredit.character_role = SemiData.characterRole || '';
                }
            } else {
                credits.push({
                    id: 0,
                    movie_id: movieId.toString(),
                    staff_id: createStaffResult.id,
                    character_id: null,
                    actor_positions: SemiData.positions,
                    character_name: characterName,
                    character_role: SemiData.characterRole || '',
                    created_at: new Date(),
                    updated_at: new Date(),
                });
            }

            if (!createStaffResult.image_data) {
                const castImage = await S3Storage.uploadCastImageToS3ByURl(name, 'staff', createStaffResult.id, originalImages[0]);
                if (castImage) {
                    const res = await StaffRepo.addCastImage(createStaffResult.id, 'staff', castImage);
                    if (res && res.blurHash === '') {
                        // TODO : implement
                        // await rabbitmqPublisher.addBlurHashToQueue(rabbitmqPublisher.blurHashTypes.staff, createStaffResult.id, castImage.url)
                    }
                }
            }
        }
    } else {
        const createCharacterResult = await StaffRepo.upsertCharacter(name, rawName, data);
        if (createCharacterResult) {

            const findCredit = credits.find(c =>
                c.movie_id.toString() === movieId.toString() &&
                c.character_id === createCharacterResult.id &&
                c.character_name === rawName);
            if (findCredit) {
                if (!findCredit.character_role) {
                    findCredit.character_role = SemiData.role || '';
                }
            } else {
                credits.push({
                    id: 0,
                    movie_id: movieId.toString(),
                    staff_id: null,
                    character_id: createCharacterResult.id,
                    actor_positions: [],
                    character_name: rawName,
                    character_role: SemiData.role || '',
                    created_at: new Date(),
                    updated_at: new Date(),
                });
            }

            if (!createCharacterResult.image_data) {
                const castImage = await S3Storage.uploadCastImageToS3ByURl(name, 'staff', createCharacterResult.id, originalImages[0]);
                if (castImage) {
                    const res = await StaffRepo.addCastImage(createCharacterResult.id, 'character', castImage);
                    if (res && res.blurHash === '') {
                        // TODO : implement
                        // await rabbitmqPublisher.addBlurHashToQueue(rabbitmqPublisher.blurHashTypes.character, createCharacterResult.id, castImage.url)
                    }
                }
            }
        }
    }
}

//-----------------------------------------------------
//-----------------------------------------------------

async function handleCredits(credits: Credit[]): Promise<void> {
    try {
        const result = credits.filter(c => c.staff_id);
        for (let j = 0; j < credits.length; j++) {
            if (!credits[j].staff_id && credits[j].character_id && credits[j].character_name) {
                for (let k = 0; k < result.length; k++) {
                    if (result[k].character_name === credits[j].character_name &&
                        (!result[k].character_id || !result[k].character_role)) {
                        result[k].character_id = credits[j].character_id;
                        if (!result[k].character_role) {
                            result[k].character_role = credits[j].character_role;
                        }
                    }
                }
            }
        }

        const promiseQueue = new PQueue({ concurrency: 5 });
        for (let j = 0; j < result.length; j++) {
            promiseQueue.add(() => StaffRepo.insertOrUpdateCredit(
                result[j].movie_id,
                result[j].staff_id || null,
                result[j].character_id || null,
                result[j].actor_positions,
                result[j].character_name,
                result[j].character_role));
        }
        await promiseQueue.onIdle();
    } catch (error) {
        saveError(error);
    }
}
