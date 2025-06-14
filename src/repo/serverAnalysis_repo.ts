import { CrawlerLog, DownloadLink } from '@/types';
import { mongoDB } from '@services/database';
import { getDecodedLink } from '@utils/crawler';
import { saveError } from '@utils/logger';
import { ObjectId } from 'mongodb';
import {v4 as uuidv4} from "uuid";
import {AdminService} from '@/services/api';

const _maxSaveLogDurationMonth = 3;
const _pageSize = 24;
const _maxTimeOut = 10 * 1000;


export async function removeOldAnalysis(): Promise<number | string> {
    try {
        const db = await mongoDB.getDatabase();
        const collection = db.collection(mongoDB.collections.serverAnalysis);

        const threshHoldTime = new Date();
        threshHoldTime.setMonth(threshHoldTime.getMonth() - _maxSaveLogDurationMonth + 2);

        // Convert date to ObjectId-compatible timestamp
        const cutoffTimestamp = Math.floor(threshHoldTime.getTime() / 1000);

        // Create a boundary ObjectId (all documents older than this will be deleted)
        const boundaryObjectId = ObjectId.createFromTime(cutoffTimestamp);

        const result = await collection.deleteMany({
            _id: {$lt: boundaryObjectId},
        }, {
            maxTimeMS: _maxTimeOut,
        });
        return result.deletedCount;
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

//-----------------------------------------
//-----------------------------------------

export async function saveCrawlerLog(crawlerLog: CrawlerLog): Promise<string> {
    try {
        const {yearAndMonth, bucket, collection} = await getCollectionAndBucket();

        if (bucket.length > 0) {
            const updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                'crawlerLogs.crawlId': crawlerLog.crawlId,
            }, {
                $set: {
                    'crawlerLogs.$': crawlerLog
                }
            }, {maxTimeMS: _maxTimeOut,});

            if (updateResult.matchedCount === 0 && updateResult.modifiedCount === 0) {
                //new crawl
                await collection.updateOne({
                    _id: bucket[0]._id,
                }, {
                    $push: {
                        crawlerLogs: {
                            $each: [crawlerLog],
                            $position: 0,
                        }
                    }
                }, {maxTimeMS: _maxTimeOut,});
            }
        } else {
            //create new bucket
            const newBucket = getNewBucket(yearAndMonth);
            newBucket.crawlerLogs.push(crawlerLog);
            await collection.insertOne(newBucket);
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function saveServerLog(logMessage: string): Promise<string> {
    try {
        const {now, yearAndMonth, bucket, collection} = await getCollectionAndBucket();

        const newServerLog = {
            message: logMessage,
            date: now,
            id: uuidv4(),
        };

        if (bucket.length > 0) {
            //new serverLog
            await collection.updateOne({
                _id: bucket[0]._id,
            }, {
                $push: {
                    serverLogs: {
                        $each: [newServerLog],
                        $position: 0,
                    }
                }
            }, {maxTimeMS: _maxTimeOut,});
        } else {
            //create new bucket
            const newBucket = getNewBucket(yearAndMonth);
            newBucket.serverLogs.push(newServerLog);
            await collection.insertOne(newBucket, {maxTimeMS: _maxTimeOut,});
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function saveGoogleCacheCall(url: string): Promise<string> {
    try {
        const {now, yearAndMonth, bucket, collection} = await getCollectionAndBucket();

        const newGoogleCacheCall: GoogleCacheCallLog = {
            url: url,
            date: now,
            count: 1,
            id: uuidv4(),
        };

        if (bucket.length > 0) {
            const updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                'googleCacheCalls.url': url,
            }, {
                $set: {
                    'googleCacheCalls.$.date': now,
                },
                $inc: {
                    'googleCacheCalls.$.count': 1,
                }
            }, {maxTimeMS: _maxTimeOut,});

            if (updateResult.matchedCount === 0 && updateResult.modifiedCount === 0) {
                //new cache call
                await collection.updateOne({
                    _id: bucket[0]._id,
                }, {
                    $push: {
                        googleCacheCalls: newGoogleCacheCall,
                    }
                }, {maxTimeMS: _maxTimeOut,});
            }
        } else {
            //create new bucket
            const newBucket = getNewBucket(yearAndMonth);
            newBucket.googleCacheCalls.push(newGoogleCacheCall);
            await collection.insertOne(newBucket, {maxTimeMS: _maxTimeOut,});
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function saveCrawlerBadLink(
    sourceName: string,
    pageLink: string,
    links: DownloadLink[],
): Promise<string> {
    try {
        const {now, yearAndMonth, bucket, collection} = await getCollectionAndBucket();

        const newBadLink: BadLinkLog = {
            address: sourceName + '::' + getDecodedLink(pageLink.replace(/\/$/, '').split('/')?.pop() ?? ''),
            links: links,
            date: now,
            count: 1,
            id: uuidv4(),
        };

        if (bucket.length > 0) {
            const updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                'badLinks.address': newBadLink.address,
            }, {
                $set: {
                    'badLinks.$.links': links,
                    'badLinks.$.date': now,
                },
                $inc: {
                    'badLinks.$.count': 1,
                }
            }, {maxTimeMS: _maxTimeOut,});

            if (updateResult.matchedCount === 0 && updateResult.modifiedCount === 0) {
                //new
                await collection.updateOne({
                    _id: bucket[0]._id,
                }, {
                    $push: {
                        badLinks: newBadLink,
                    }
                }, {maxTimeMS: _maxTimeOut,});
            }
        } else {
            //create new bucket
            const newBucket = getNewBucket(yearAndMonth);
            newBucket.badLinks.push(newBadLink);
            await collection.insertOne(newBucket, {maxTimeMS: _maxTimeOut,});
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}


//-----------------------------------------
//-----------------------------------------

export async function saveCrawlerWarning(message: string): Promise<string> {
    try {
        AdminService.sendNotificationToAdmin(message).then();

        const {now, yearAndMonth, bucket, collection} = await getCollectionAndBucket();

        const newWarning: WarningLog = {
            message: message,
            date: now,
            resolved: false,
            resolvedDate: 0,
            count: 1,
            id: uuidv4(),
        };

        if (bucket.length > 0) {
            const updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                'warnings.message': message,
            }, {
                $set: {
                    'warnings.$.date': now,
                    'warnings.$.resolved': false,
                    'warnings.$.resolvedDate': 0,
                },
                $inc: {
                    'warnings.$.count': 1,
                }
            }, {maxTimeMS: _maxTimeOut,});

            if (updateResult.matchedCount === 0 && updateResult.modifiedCount === 0) {
                //new warning
                await collection.updateOne({
                    _id: bucket[0]._id,
                }, {
                    $push: {
                        warnings: newWarning
                    }
                }, {maxTimeMS: _maxTimeOut,});
            }
        } else {
            //create new bucket
            const newBucket = getNewBucket(yearAndMonth);
            newBucket.warnings.push(newWarning);
            await collection.insertOne(newBucket, {maxTimeMS: _maxTimeOut,});
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function resolveCrawlerWarning(message: string): Promise<string> {
    try {
        const {bucket, collection} = await getCollectionAndBucket();

        if (bucket.length > 0) {
            const updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                warnings: {$elemMatch: {message: message, resolved: false}}
            }, {
                $set: {
                    'warnings.$.resolved': true,
                    'warnings.$.resolvedDate': new Date(),
                }
            }, {maxTimeMS: _maxTimeOut,});

            if (updateResult.modifiedCount === 0) {
                return "not found";
            }
        } else {
            return "not found";
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

//-----------------------------------------
//-----------------------------------------

async function getCollectionAndBucket(): Promise<{now: Date, yearAndMonth: string, bucket: any, collection: any}> {
    const db = await mongoDB.getDatabase();
    const collection = db.collection(mongoDB.collections.serverAnalysis);
    const now = new Date();
    const yearAndMonth = now.getFullYear() + '-' + (now.getMonth() + 1);

    const bucket = await collection.find({yearAndMonth: yearAndMonth}, {maxTimeMS: _maxTimeOut,}).limit(1).toArray();
    return {now, yearAndMonth, bucket, collection};
}

function getNewBucket(yearAndMonth: string): ServerAnalysis {
    return ({
        CreatedAt: Date.now(),
        yearAndMonth: yearAndMonth,
        botUserCounts: [],
        userCounts: [],
        crawlerLogs: [],
        serverLogs: [],
        warnings: [],
        googleCacheCalls: [],
        badLinks: [],
    });
}

export type WarningLog = {
    message: string,
    date: Date,
    resolved: boolean,
    resolvedDate: number,
    count: number,
    id: string,
}

export type BadLinkLog = {
    address: string,
    links: DownloadLink[],
    date: Date,
    count: number,
    id: string,
}

export type GoogleCacheCallLog = {
    url: string;
    date: Date;
    count: number;
    id: string;
}

export type ServerAnalysis = {
    CreatedAt: number;
    yearAndMonth: string;
    botUserCounts: any[];
    userCounts: any[];
    crawlerLogs: any[];
    serverLogs: any[];
    warnings: WarningLog[];
    googleCacheCalls: GoogleCacheCallLog[];
    badLinks: BadLinkLog[];
};

export const serverAnalysisFields = Object.freeze(['botUserCounts', 'userCounts', 'crawlerLogs', 'serverLogs', 'warnings', 'googleCacheCalls', 'badLinks']);
