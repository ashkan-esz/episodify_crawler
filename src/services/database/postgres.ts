import config from '@/config';
import type { Database } from '@/types/database';
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

const dialect = new PostgresDialect({
    pool: new Pool({
        connectionString: config.POSTGRE_DATABASE_URL,
        password: config.POSTGRES_PASSWORD,
        idleTimeoutMillis: 10_000,
        max: 5,
    }),
});

export const kyselyDB = new Kysely<Database>({
    dialect,
});
