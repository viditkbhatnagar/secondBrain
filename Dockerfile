# ==========================================
# Multi-stage Dockerfile for Unified Deployment
# Builds both frontend and backend in one image
# ==========================================

# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci --only=production=false

# Copy frontend source
COPY frontend/ ./

# Build frontend for production
RUN npm run build

# Stage 2: Build Backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# Install backend dependencies (including dev dependencies for build)
RUN npm ci --only=production=false

# Copy backend source
COPY backend/src ./src

# Build backend TypeScript
RUN npm run build

# Stage 3: Production Runtime
FROM node:18-alpine AS production

WORKDIR /app

# Install production dependencies only
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built backend from builder
COPY --from=backend-builder /app/backend/dist ./dist

# Copy built frontend from builder to backend's expected location
COPY --from=frontend-builder /app/frontend/build ../frontend/build

# Create uploads directory
RUN mkdir -p /app/backend/uploads && \
    mkdir -p /app/backend/logs && \
    chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "dist/server.js"]

