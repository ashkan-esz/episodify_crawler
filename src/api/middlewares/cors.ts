import config from '@/config';
import { getCachedGeneralDbConfigs } from '@config/dynamicConfig';
import type { Context } from 'elysia';
import { cors } from '@elysiajs/cors';

let corsAllowedOriginsDB = [
    ...config.CORS_ALLOWED_ORIGINS,
    ...(getCachedGeneralDbConfigs()?.corsAllowedOrigins || []),
];
setInterval(
    async () => {
        corsAllowedOriginsDB = [
            ...config.CORS_ALLOWED_ORIGINS,
            ...(getCachedGeneralDbConfigs()?.corsAllowedOrigins || []),
        ];
    },
    30 * 60 * 1000,
); //30 min


// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const dynamicCors = () => {
    type CorsConfig = Parameters<typeof cors>[0];

    const conf: CorsConfig = {
        // @ts-expect-error ...
        origin: ({ request }: Context) => {
            try {
                const origin = request.headers.get('origin');
                if (!origin) {
                    return false;
                }

                // Allow local development
                if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                    return true;
                }

                return corsAllowedOriginsDB.includes(origin);
            } catch {
                return false;
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['Content-Length', 'X-Custom-Header'],
    };

    return cors(conf as CorsConfig);
};
