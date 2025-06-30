# Stage 1: Build with dev dependencies
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy dependency files first for better caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application (outputs to /app/dist)
RUN bun run build

# Stage 2: Production
FROM oven/bun:1.1-alpine

WORKDIR /app

# Runtime environment variables
ENV NODE_ENV=production \
    BUN_ENV=production \
    DISABLE_REQUEST_LOGGER=1

# Install only production dependencies
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile --no-save \
    && rm -rf /root/.bun/install/cache \
    && find /app/node_modules -type d \( -name "__tests__" -o -name "test" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + || true

# Copy built assets
COPY --from=builder --chown=1000:1000 /app/dist ./dist

# Create non-root user
RUN addgroup -S appgroup -g 1001 \
    && adduser -S appuser -G appgroup -u 1001 \
    && chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

EXPOSE 3000

CMD ["bun", "run", "start"]
