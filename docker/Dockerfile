# Stage 1: Build with dev dependencies
FROM oven/bun:1.2.18-alpine AS builder

WORKDIR /app

# Runtime environment variables
ENV NODE_ENV=production \
    BUN_ENV=production \
    DISABLE_REQUEST_LOGGER=1

# Copy dependency files first for better caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --verbose

# Copy source code
COPY . .

# Build application
RUN bun run build_compile

# Stage 2: Production
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache libstdc++

# Runtime environment variables
ENV NODE_ENV=production \
    BUN_ENV=production \
    DISABLE_REQUEST_LOGGER=1

# Copy built assets
COPY --from=builder /app/myapp .

RUN chmod +x /app/myapp

EXPOSE 3000

CMD ["./myapp"]
