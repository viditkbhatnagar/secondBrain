# 🧠 Personal Knowledge Base

AI-powered knowledge management system with semantic search, chat interface, and knowledge graph visualization.

## 🚀 Quick Start

### Development (Unified - One Command!)

```bash
# First time setup
npm run install:all

# Run both backend and frontend together
npm run dev
```

That's it! The app will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

### Production Build (For Render Deployment)

```bash
# Build everything
npm run build

# Start production server
npm start
```

## 📁 Project Structure

```
personal-knowledge-base/
├── backend/           # Express.js API server
│   ├── src/          # TypeScript source
│   ├── dist/         # Compiled JavaScript
│   └── uploads/      # File storage
├── frontend/         # React application
│   ├── src/          # React components
│   └── build/        # Production build
├── package.json      # Root package (unified scripts)
└── render.yaml       # Render deployment config
```

## 🛠️ Available Commands

```bash
# Development
npm run dev              # Run both servers
npm run dev:backend      # Run only backend
npm run dev:frontend     # Run only frontend

# Building
npm run build            # Build both frontend and backend
npm run build:frontend   # Build only frontend
npm run build:backend    # Build only backend

# Production
npm start                # Start production server

# Database
npm run db:flush         # Clear all data from database

# Testing
npm test                 # Run all tests
npm run test:backend     # Run backend tests
npm run test:frontend    # Run frontend tests

# Installation
npm run install:all      # Install all dependencies
npm run clean            # Remove all node_modules and builds
```

## 🌐 Deployment

### Deploy to Render (Recommended)

See [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) for detailed deployment instructions.

**Quick Deploy:**
1. Push code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. New → Blueprint → Connect your repo
4. Set environment variables (MongoDB, API keys)
5. Deploy! 🚀

The unified setup means **ONE web service** instead of separate frontend/backend services - simpler and cheaper!

## 🔧 Environment Variables

### Backend (.env)

Required:
```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/knowledge-base
OPENAI_API_KEY=sk-...
```

Optional:
```bash
REDIS_URL=redis://...
COHERE_API_KEY=...
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

### Frontend
No separate .env needed! Frontend uses relative API paths in production.

## 🏗️ Architecture

### Development Mode
- Backend runs on port 3001 (API server)
- Frontend runs on port 3000 (React dev server with hot reload)
- Frontend proxies API calls to backend

### Production Mode (Render)
- Backend serves both API and static frontend files
- Everything runs on one port
- API routes: `/api/*`
- Frontend routes: `/*` (catch-all for SPA routing)

## ✨ Features

- 📄 **Document Upload**: PDF, DOCX, TXT, MD, images
- 🔍 **Semantic Search**: AI-powered search with vector embeddings
- 💬 **Chat Interface**: Ask questions about your documents
- 🕸️ **Knowledge Graph**: Visual representation of document relationships
- 📊 **Analytics**: Track usage and search patterns
- ⚡ **Caching**: Redis integration for fast responses
- 🔒 **Security**: Rate limiting, input sanitization, CORS protection

## 📚 Documentation

- [Render Deployment Guide](./RENDER_DEPLOY.md) - Deploy to production
- [MongoDB Setup](./MONGODB_SETUP.md) - Database configuration
- [Docker Guide](./DOCKER.md) - Docker deployment (optional)

## 🐛 Troubleshooting

### "Cannot find module" errors
```bash
npm run install:all
```

### Backend not serving frontend in production
Check that `NODE_ENV=production` is set and frontend is built:
```bash
npm run build:frontend
ls -la frontend/build
```

### CORS errors in development
Make sure both servers are running:
```bash
npm run dev
```

### Database connection fails
Verify your `MONGODB_URI` in backend/.env

## 📦 Tech Stack

**Backend:**
- Node.js + Express + TypeScript
- MongoDB + Mongoose
- OpenAI (embeddings + gpt-5 chat)
- Redis (optional caching)
- Vector search

**Frontend:**
- React + TypeScript
- TailwindCSS
- Recharts (analytics)
- Framer Motion (animations)

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Feel free to open issues or submit PRs.

---

Made with ❤️ by Vidit
