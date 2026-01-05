# 🚀 Unified Single Service Deployment on Render

Deploy your Personal Knowledge Base as **ONE web service** on Render - frontend and backend together!

---

## 📦 What's Changed

✅ **Single web service** instead of separate frontend/backend services  
✅ **One `npm run dev`** command runs both servers locally  
✅ **One deployment** on Render - simpler and cheaper  
✅ **Native Node.js build** - no Docker needed  
✅ **Same origin** - no CORS issues  

---

## 🏃 Quick Deploy to Render

### Option 1: Using Blueprint (Easiest)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Unified server setup"
   git push
   ```

2. **Go to Render Dashboard**
   - Visit [dashboard.render.com](https://dashboard.render.com)
   - Click **New** → **Blueprint**
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml` and create services

3. **Set Environment Variables**
   
   In the Render dashboard, add these secrets:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/knowledge-base
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   COHERE_API_KEY=your_cohere_key  # Optional but recommended
   ```

4. **Done!** Your app will be live at: `https://personal-knowledge-base.onrender.com`

### Option 2: Manual Setup

1. **Create New Web Service**
   - Dashboard → **New** → **Web Service**
   - Connect your GitHub repo
   - **Root Directory**: Leave blank (use root)
   - **Runtime**: Node
   - **Build Command**: `npm run install:all && npm run build`
   - **Start Command**: `npm start`

2. **Add Environment Variables** (same as above)

3. **Optional: Add Redis**
   - Dashboard → **New** → **Redis**
   - Name: `knowledge-base-redis`
   - Plan: Starter (free 25MB)
   - Connect to your web service

---

## 💻 Local Development

### First Time Setup

```bash
# Install all dependencies (root, backend, and frontend)
npm run install:all

# Or install individually
npm install          # Root dependencies (concurrently)
cd backend && npm install
cd ../frontend && npm install
```

### Running the App

```bash
# From root directory - runs BOTH servers in one terminal
npm run dev
```

This will start:
- 🔵 **Backend** on `http://localhost:3001` (API)
- 🟣 **Frontend** on `http://localhost:3000` (React app)

### Other Commands

```bash
# Build for production (simulates Render build)
npm run build

# Run production build locally
npm start

# Flush database
npm run db:flush

# Run tests
npm test
```

---

## 🏗️ How It Works

### Development Mode (`npm run dev`)
- **Backend runs** on port 3001 serving API routes (`/api/*`)
- **Frontend runs** on port 3000 with hot reload
- Frontend proxies API calls to backend
- Both run concurrently in same terminal

### Production Mode (Render)
- **Render builds frontend** first → creates optimized static files
- **Render builds backend** → compiles TypeScript
- **Backend serves everything**:
  - API routes: `/api/*`
  - Static frontend: `/*` (all other routes)
- Everything runs on **one port** (3001 or Render's assigned port)

---

## 🔧 Environment Variables

### Required
```bash
MONGODB_URI=mongodb+srv://...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Optional but Recommended
```bash
COHERE_API_KEY=...        # Better search accuracy
REDIS_URL=redis://...     # Faster response times (auto-set if using Redis service)
```

### Automatic (set by Render)
```bash
NODE_ENV=production
PORT=3001
REDIS_ENABLED=true
```

---

## 📊 Performance Tips

### For Best Performance:

1. **Upgrade to Standard Plan** ($7/month)
   - More CPU and RAM
   - Faster responses (0.5-2s vs 2-5s)

2. **Add Redis Service** (Starter plan is free)
   - Caches embeddings and search results
   - 3-5x faster repeat queries

3. **Create MongoDB Atlas Vector Index**
   ```json
   {
     "name": "vector_index",
     "type": "vectorSearch",
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

4. **Add Cohere API Key**
   - Free tier: https://cohere.com
   - Better search result ranking

### Expected Performance:

| Setup | Response Time | Cost |
|-------|---------------|------|
| Starter (no Redis) | 3-5s | Free |
| Starter + Redis | 1-3s | Free |
| Standard + Redis | 0.5-2s | $7/mo |
| Standard + Redis + Cohere | 0.5-1.5s | $7/mo |

---

## 🐛 Troubleshooting

### Build Fails on Render

**Error**: `Module not found` or `Cannot find package`

**Solution**: Make sure all dependencies are in `dependencies` not `devDependencies`

```bash
# Check package.json files
cat backend/package.json
cat frontend/package.json
```

### Frontend Shows 404 in Production

**Error**: React routes return 404

**Solution**: Backend is configured to handle SPA routing. Check that:
1. Frontend built successfully: `ls -la frontend/build`
2. Backend server.ts has static file serving enabled

### API Calls Fail

**Error**: `ERR_CONNECTION_REFUSED` or CORS errors

**Solution**: 
- In development: Make sure both servers are running (`npm run dev`)
- In production: Check `frontend/src/config/api.ts` uses relative URL `/api`

### Redis Connection Fails

**Error**: `Redis connection refused`

**Solution**: Redis is optional. App will use in-memory cache if Redis isn't available.

---

## 📝 Deployment Checklist

Before deploying, make sure:

- [ ] MongoDB Atlas database is set up
- [ ] MongoDB Vector Search index is created
- [ ] API keys are ready (Anthropic, OpenAI)
- [ ] Code is pushed to GitHub
- [ ] `render.yaml` is in repository root
- [ ] Environment variables are set in Render dashboard

---

## 🎉 You're Done!

Your unified Personal Knowledge Base is now:
- ✅ Running on one web service
- ✅ Serving frontend and backend together
- ✅ Easy to develop (`npm run dev`)
- ✅ Simple to deploy (one service on Render)
- ✅ Cost-effective (free tier or $7/month for better performance)

Access your app at: `https://your-service-name.onrender.com`

