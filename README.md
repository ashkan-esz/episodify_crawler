# Episodify Crawler

A high-performance web crawler for movies and series data collection, built with Bun and TypeScript.

## Features

- High-performance web crawling with rate limiting and concurrency control
- Support for multiple data sources (TMDB, IMDB, etc.)
- Admin panel with API endpoints for monitoring and control
- Distributed task processing with RabbitMQ
- Multi-database architecture:
  - PostgreSQL for structured data
  - MongoDB for raw data and metrics
  - Redis for caching and rate limiting
- Docker containerization for easy deployment
- Comprehensive logging and monitoring

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0.30
- Docker and Docker Compose
- Node.js >= 18 (for development tools)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/episodify_crawler.git
cd episodify_crawler
```

2. Install dependencies:
```bash
bun install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development environment:
```bash
docker-compose up -d
```

5. Run database migrations:
```bash
bunx prisma migrate dev
```

6. Start the development server:
```bash
bun run dev
```

## Environment Variables

| Prop                                   | Description                                                                                                                    | Required | Default Value |
|----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|----------|---------------|
| **`PORT`**                             | server port                                                                                                                    | `false`  | 3000          |
| **`API_PREFIX`**                       |                                                                                                                                | `false`  | /api/v1       |
| **`MONGODB_DATABASE_URL`**             | mongodb url, for example see [mongodb.com](https://www.mongodb.com/)                                                           | `true`   |               |
| **`POSTGRE_DATABASE_URL`**             | postgresSql url                                                                                                                | `true`   |               |
| **`POSTGRES_PASSWORD`**                |                                                                                                                                | `true`   |               |
| **`REDIS_URL`**                        | redis url                                                                                                                      | `false`  |               |
| **`REDIS_PASSWORD`**                   | redis password                                                                                                                 | `false`  |               |
| **`RABBITMQ_URL`**                     | rabbitmq url                          <br/>                                                                                    | `true`   |               |
| **`CLOUAD_STORAGE_ENDPOINT`**          | s3 sever url, for example see [arvancloud.com](https://www.arvancloud.com/en)                                                  | `true`   |               |
| **`CLOUAD_STORAGE_WEBSITE_ENDPOINT`**  | s3 static website postfix                                                                                                      | `true`   |               |
| **`CLOUAD_STORAGE_ACCESS_KEY`**        |                                                                                                                                | `true`   |               |
| **`CLOUAD_STORAGE_SECRET_ACCESS_KEY`** |                                                                                                                                | `true`   |               |
| **`BUCKET_NAME_PREFIX`**               | if bucket names not exist use this. for example 'poster' --> 'test_poster'                                                     | `false`  |               |
| **`ADMIN_USER`**                       | admin username which created automatically on app start, can be changed after                                                  | `false`  |               |
| **`ADMIN_PASS`**                       | admin password which created automatically on app start, can be changed after                                                  | `false`  |               |
| **`ACCESS_TOKEN_SECRET`**              |                                                                                                                                | `true`   |               |
| **`REFRESH_TOKEN_SECRET`**             |                                                                                                                                | `true`   |               |
| **`DOMAIN`**                           | base domain, used for cookies domain and subdomain                                                                             | `false`  |               |
| **`SENTRY_ORG`**                       |                                                                                                                                | `false`  |               |
| **`CRAWLER_SENTRY_DNS`**               | see [sentry.io](https://sentry.io)                                                                                             | `false`  |               |
| **`SENTRY_AUTH_TOKEN`**                | see [sentry.io](https://sentry.io)                                                                                             | `false`  |               |
| **`SENTRY_PROJECT`**                   | see [sentry.io](https://sentry.io)                                                                                             | `false`  |               |
| **`PRINT_ERRORS`**                     |                                                                                                                                | `false`  | false         |
| **`LOG_LEVEL`**                        |                                                                                                                                | `false`  | info          |
| **`NODE_ENV`**                         |                                                                                                                                | `false`  | development   |
| **`DEBUG_MODE`**                       |                                                                                                                                | `false`  | false         |
| **`DISABLE_CRAWLER`**                  | crawler doesn't run                                                                                                            | `false`  | false         |
| **`DISABLE_TORRENT_CRAWLER`**          | torrent crawler doesn't run                                                                                                    | `false`  | false         |
| **`CRAWLER_CONCURRENCY`**              |                                                                                                                                | `false`  |               |
| **`PAUSE_CRAWLER_ON_HIGH_LOAD`**       | with this flag crawler get paused inorder to prevent server crash                                                              | `false`  | true          |
| **`CRAWLER_TOTAL_MEMORY`**             | this value get used to determine crawler need to get paused. (MB)                                                              | `false`  | 1024          |
| **`CRAWLER_MEMORY_LIMIT`**             | if the memory usage is higher than this value, crawler will pause, if not set, it will use 85% of `CRAWLER_TOTAL_MEMORY`. (MB) | `false`  | 0             |
| **`CRAWLER_CPU_LIMIT`**                | if the cpu usage is higher than this value, crawler will pause                                                                 | `false`  | 95            |
| **`CRAWLER_PAUSE_DURATION_LIMIT`**     | Number of minutes to crawler can be paused on high load                                                                        | `false`  | 10            |
| **`CRAWLER_MANUAL_GC_ON_HIGH_LOAD`**   |                                                                                                                                | `false`  | 10            |
| **`DISABLE_THUMBNAIL_CREATE`**         | thumbnails doesnt create                                                                                                       | `false`  | false         |
| **`IGNORE_HENTAI`**                    | dont add hentai to db                                                                                                          | `false`  | true          |
| **`OMDB_API_KEY{i}`**                  | `i` start from 1. like OMDB_API_KEY1, see [omdbapi.com](https://www.omdbapi.com/)                                              | `true`   |               |
| **`GOOGLE_API_KEY`**                   | see [google console](https://console.cloud.google.com/apis)                                                                    | `true`   |               |
| **`CORS_ALLOWED_ORIGINS`**             | address joined by `---` example: https://download-admin.com---https:download-website.com                                       | `false`  |               |
| **`REMOTE_BROWSER_PASSWORD{i}`**       | `i` start from 1. like REMOTE_BROWSER_PASSWORD1, password of remote headless browser (puppeteer)                               | `true`   |               |
| **`REMOTE_BROWSER_ENDPOINT{i}`**       | end point of remote headless browser (puppeteer), [source](https://github.com/ashkan-esz/downloader_remotebrowser/)            | `true`   |               |
| **`REMOTE_BROWSER_TABS_COUNT{i}`**     | number of tabs that set on remote headless browser (puppeteer)                                                                 | `false`  | 7             |

>**NOTE: check [configs schema](src/types/config.ts) for db dynamic configs.**


## Project Structure

```
src/
├── api/              # API-related code
│   ├── controllers/  # Request handlers
│   ├── middlewares/  # API middlewares
│   └── routes/       # Route definitions
├── crawler/          # Crawler implementation
│   ├── providers/    # Data source providers
│   └── parsers/      # HTML/Data parsers
├── config/           # Configuration management
├── services/         # Shared services
│   ├── cache/        # Redis cache service
│   ├── queue/        # RabbitMQ service
│   └── database/     # Database services
├── models/           # Database models
├── utils/            # Utility functions
└── workers/          # Background workers

docker/              # Docker configuration
prisma/              # Database migrations
```

## API Documentation

The API documentation is available at `/docs` when running the server. It's generated using Swagger/OpenAPI.

## Development

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run lint` - Run ESLint
- `bun run format` - Format code with Prettier
- `bun test` - Run tests

## Docker Support

The project includes Docker support for both development and production environments:

- Development: `docker-compose up`
- Production: `docker-compose -f docker-compose.prod.yml up`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.
