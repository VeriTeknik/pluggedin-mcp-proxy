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

# Add health check for container readiness
# Checks /health endpoint every 10 seconds with 3 second timeout
# Allows 30 seconds for initial startup before first check
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8081) + '/health', (r) => { let data = ''; r.on('data', (d) => data += d); r.on('end', () => { try { const j = JSON.parse(data); process.exit(j.status === 'ok' ? 0 : 1); } catch { process.exit(1); } }); }).on('error', () => process.exit(1));"

# Run the application in Streamable HTTP mode
# Smithery sets PORT environment variable, we use it here
CMD ["sh", "-c", "node dist/index.js --transport streamable-http --port ${PORT}"]