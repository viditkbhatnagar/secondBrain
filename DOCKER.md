# Docker Deployment Guide

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- API keys for Anthropic and OpenAI

### 1. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

### 2. Start the Application

**Production mode:**
```bash
docker-compose up -d
```

**Development mode (with hot reload):**
```bash
docker-compose -f docker-compose.dev.yml up
```

### 3. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/api/health

## Commands

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild and restart
docker-compose up -d --build

# Check service status
docker-compose ps
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Docker Network                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Frontend   │    │   Backend    │    │   MongoDB    │  │
│  │   (nginx)    │───▶│   (Node.js)  │───▶│              │  │
│  │   :3000      │    │   :3001      │    │   :27017     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                             │                               │
│                             ▼                               │
│                      ┌──────────────┐                       │
│                      │    Redis     │                       │
│                      │   :6379      │                       │
│                      └──────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required) | - |
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `MONGODB_URI` | MongoDB connection string | `mongodb://mongodb:27017/knowledge-base` |
| `REDIS_ENABLED` | Enable Redis caching | `true` |
| `REDIS_HOST` | Redis host | `redis` |
| `NODE_ENV` | Environment | `production` |
| `PORT` | Backend port | `3001` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

## Volumes

| Volume | Purpose |
|--------|---------|
| `mongodb_data` | MongoDB database files |
| `redis_data` | Redis persistence |
| `uploads` | Uploaded documents |

## Health Checks

All services include health checks:

- **Backend**: `GET /api/health` - Returns service status
- **Frontend**: `GET /health` - Returns "OK"
- **MongoDB**: `mongosh --eval "db.adminCommand('ping')"`
- **Redis**: `redis-cli ping`

## Production Deployment

### Option 1: Railway

1. Connect your GitHub repository
2. Set environment variables in Railway dashboard
3. Deploy backend and frontend as separate services

### Option 2: Render

1. Create a new Blueprint from `render.yaml`
2. Set environment variables in Render dashboard
3. Deploy

### Option 3: DigitalOcean App Platform

1. Create new app from GitHub
2. Configure as Docker deployment
3. Set environment variables

### Option 4: AWS ECS/Fargate

1. Push images to ECR
2. Create ECS task definitions from docker-compose
3. Configure ALB for load balancing
4. Use MongoDB Atlas and ElastiCache for Redis

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs backend

# Check if ports are in use
netstat -an | findstr "3001"
```

### MongoDB connection issues
```bash
# Check MongoDB is running
docker-compose ps mongodb

# Connect to MongoDB shell
docker-compose exec mongodb mongosh
```

### Redis connection issues
```bash
# Check Redis is running
docker-compose exec redis redis-cli ping
```

### Rebuild from scratch
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## Security Notes

- Never commit `.env` files with real API keys
- Use Docker secrets in production for sensitive data
- The containers run as non-root users
- Health check endpoints don't expose sensitive information
