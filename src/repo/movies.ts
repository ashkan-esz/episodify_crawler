import { ObjectId } from 'mongodb';

export async function addRelatedMovies(id1: ObjectId, id2: ObjectId, relation: string): Promise<any> {
    console.log(id1, id2, relation);
    return null;
}
