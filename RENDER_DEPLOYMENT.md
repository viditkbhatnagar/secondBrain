# 🚀 Render Deployment Guide

Deploy Second Brain to Render for production-ready performance.

## Quick Deploy

### Option 1: Blueprint (Recommended)

1. Fork this repository
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** → **Blueprint**
4. Connect your GitHub repo
5. Render will auto-detect `render.yaml` and create all services

### Option 2: Manual Setup

#### Backend Service

1. **New** → **Web Service**
2. Connect your repo
3. Settings:
   - **Name**: `secondbrain-backend`
   - **Root Directory**: `secondBrain/backend`
   - **Runtime**: Docker
   - **Plan**: Standard (recommended) or Starter
   - **Health Check Path**: `/api/health`

4. Environment Variables:
   ```
   NODE_ENV=production
   PORT=3001
   MONGODB_URI=<your-mongodb-atlas-uri>
   OPENAI_API_KEY=<your-openai-key>
   REDIS_ENABLED=true
   REDIS_URL=<from-redis-service>
   COHERE_API_KEY=<optional-for-better-accuracy>
   ```

#### Frontend Service

1. **New** → **Web Service**
2. Connect your repo
3. Settings:
   - **Name**: `secondbrain-frontend`
   - **Root Directory**: `secondBrain/frontend`
   - **Runtime**: Docker
   - **Plan**: Starter

4. Environment Variables:
   ```
   REACT_APP_API_URL=https://secondbrain-backend.onrender.com
   ```

#### Redis Service

1. **New** → **Redis**
2. Settings:
   - **Name**: `secondbrain-redis`
   - **Plan**: Starter (25MB, sufficient for caching)

---

## ⚡ Performance Optimization

### For Fastest Responses:

1. **Use Standard Plan** for backend (more CPU/RAM)
2. **Enable Redis** for caching (included in render.yaml)
3. **Create MongoDB Atlas Vector Search Index**:
   - Go to Atlas → Search Indexes
   - Create index on `documentchunks` collection:
   ```json
   {
     "name": "vector_index",
     "definition": {
       "fields": [{
         "type": "vector",
         "path": "embedding",
         "numDimensions": 1536,
         "similarity": "cosine"
       }]
     }
   }
   ```

4. **Add Cohere API Key** (free tier available):
   - Sign up at https://cohere.com
   - Add `COHERE_API_KEY` to environment variables

### Expected Performance:

| Configuration | Response Time | Accuracy |
|--------------|---------------|----------|
| Starter + No Redis | 3-5s | 8/10 |
| Starter + Redis | 1-3s | 8/10 |
| Standard + Redis | 0.5-2s | 9/10 |
| Standard + Redis + Cohere | 0.5-1.5s | 10/10 |

---

## 🔧 Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `OPENAI_API_KEY` | OpenAI API key (for embeddings) |

### Recommended

| Variable | Description |
|----------|-------------|
| `REDIS_ENABLED` | Set to `true` |
| `REDIS_URL` | Auto-set from Redis service |
| `COHERE_API_KEY` | For neural reranking |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level | `info` |
| `CACHE_WARMUP_ON_START` | Pre-warm caches | `true` |
| `KEEP_ALIVE_ENABLED` | Prevent sleeping | `false` |
| `CORS_ORIGINS` | Allowed origins | Auto-detected |

---

## 🛡️ Preventing Cold Starts

Render's free/starter plans sleep after 15 minutes of inactivity.

### Option 1: Use Standard Plan
No sleeping on Standard plan ($7/month).

### Option 2: External Ping Service
Use [UptimeRobot](https://uptimerobot.com) (free) to ping your health endpoint every 14 minutes:
- URL: `https://your-backend.onrender.com/api/health`
- Interval: 14 minutes

### Option 3: Built-in Keep-Alive
Set `KEEP_ALIVE_ENABLED=true` and `SERVICE_URL=https://your-backend.onrender.com`

---

## 📊 Monitoring

### Health Endpoints

- **Basic**: `GET /api/health`
- **Detailed**: `GET /api/health/detailed`
- **RAG Status**: `GET /api/search/ultimate/status`
- **Cache Stats**: `GET /api/search/ultimate/stats`

### Logs

View logs in Render Dashboard → Your Service → Logs

---

## 🔄 Updating

Push to your main branch → Render auto-deploys.

For manual deploy:
1. Go to Render Dashboard
2. Select your service
3. Click **Manual Deploy** → **Deploy latest commit**

---

## 💰 Cost Estimate

| Service | Plan | Cost/Month |
|---------|------|------------|
| Backend | Starter | Free |
| Backend | Standard | $7 |
| Frontend | Starter | Free |
| Redis | Starter | Free |
| **Total (Free)** | | **$0** |
| **Total (Optimal)** | | **$7** |

---

## 🆘 Troubleshooting

### "Service unavailable" after deploy
- Check logs for errors
- Verify environment variables are set
- Ensure MongoDB Atlas allows connections from anywhere (0.0.0.0/0)

### Slow first request
- Normal for cold starts on free tier
- Enable Redis caching
- Consider Standard plan

### "Cannot connect to MongoDB"
- Check MONGODB_URI format
- Ensure IP whitelist includes 0.0.0.0/0 in Atlas
- Verify username/password

### "Redis connection failed"
- Check REDIS_URL is set correctly
- Redis service must be running
- Verify internal connection string

---

## 📞 Support

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com)
- [Project Issues](https://github.com/your-repo/issues)
