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

# Build application (outputs to /app/dist)
RUN bun run build

# Stage 2: Production
FROM oven/bun:1.2.18-alpine

WORKDIR /app

# Runtime environment variables
ENV NODE_ENV=production \
    BUN_ENV=production \
    DISABLE_REQUEST_LOGGER=1

# Install only production dependencies
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile --verbose --no-save \
    && rm -rf /root/.bun/install/cache \
    && find /app/node_modules -type d \( -name "__tests__" -o -name "test" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + || true

# Copy built assets
COPY --from=builder --chown=1000:1000 /app/dist ./dist

EXPOSE 3000

CMD ["bun", "run", "start"]
