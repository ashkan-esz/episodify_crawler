FROM oven/bun:1.0.30

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN bun install 

# Copy source code
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build TypeScript
RUN bun run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]