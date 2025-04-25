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
