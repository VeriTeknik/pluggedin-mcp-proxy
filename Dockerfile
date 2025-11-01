# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy required config files
COPY smithery.yaml ./

# Copy .well-known directory for Smithery discovery
COPY .well-known ./.well-known

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8081

# Expose Smithery's expected port (8081)
EXPOSE 8081

# Run the application in Streamable HTTP mode
# Smithery sets PORT environment variable, we use it here
CMD ["sh", "-c", "node dist/index.js --transport streamable-http --port ${PORT}"]