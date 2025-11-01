# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files for pnpm
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies for building)
RUN pnpm install

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files for pnpm
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy required config files
COPY smithery.yaml ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8081

# Expose Smithery's expected port (8081)
EXPOSE 8081

# Run the application in Streamable HTTP mode
# Smithery sets PORT environment variable, we use it here
CMD ["sh", "-c", "node dist/index.js --transport streamable-http --port ${PORT}"]