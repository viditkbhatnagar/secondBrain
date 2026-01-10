import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend/.env FIRST
const envPath = path.resolve(__dirname, '../.env');
console.log('🔧 Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('❌ Error loading .env:', result.error);
} else {
  console.log('✅ .env loaded successfully');
  console.log('📝 MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
}

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import multer from 'multer';
import fs from 'fs-extra';
import swaggerUi from 'swagger-ui-express';
import { fileUploadRouter } from './routes/fileUpload';
import { searchRouter } from './routes/search';
import { documentsRouter } from './routes/documents';
import { chatRouter } from './routes/chat';
import { adminRouter } from './routes/admin';
import { graphRouter } from './routes/graph';
import authRouter from './routes/auth';
import { healthRouter } from './routes/health';
import analyticsRouter from './routes/analytics';
import ultimateSearchRouter from './routes/ultimateSearch';
import { blazingSearchRouter } from './routes/blazingSearch';
import { categoryRouter } from './routes/categories';
import { DatabaseService } from './services/DatabaseService';
import { VectorService } from './services/VectorService';
import { GptService } from './services/GptService';
import { redisService } from './services/RedisService';
import { cacheWarmer } from './services/cacheWarmer';
import { swaggerSpec } from './config/swagger';
import { logger } from './utils/logger';
import { keepAlive } from './utils/keepAlive';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter, speedLimiter, uploadLimiter } from './middleware/rateLimiter';
import { helmetConfig, mongoSanitizeConfig, xssSanitizer, suspiciousRequestDetector } from './middleware/security';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting behind reverse proxy (Render, Heroku, etc.)
app.set('trust proxy', 1);

// Security headers (Helmet) - must be early in middleware chain
app.use(helmetConfig);

// Configure CORS with env overrides for production
const prodOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['https://knowledge-base-frontend-xxx.onrender.com']);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? prodOrigins : ['http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Session-ID', 'Cache-Control'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Response compression - compress all responses > 1KB
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers.accept === 'text/event-stream') {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Request body parsing with size limits
app.use(express.json({ limit: '10mb' })); // Reduced from 100mb for security
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(mongoSanitizeConfig); // NoSQL injection prevention
app.use(xssSanitizer); // XSS sanitization
app.use(suspiciousRequestDetector); // Log suspicious requests

// Request logging middleware
app.use(requestLogger);

// Global rate limiting (skip health checks)
app.use('/api/', (req, res, next) => {
  // Skip rate limiting for health checks (Render needs fast response)
  if (req.path.startsWith('/health')) {
    return next();
  }
  apiLimiter(req, res, next);
});
app.use('/api/', (req, res, next) => {
  // Skip speed limiting for health checks
  if (req.path.startsWith('/health')) {
    return next();
  }
  speedLimiter(req, res, next);
});

// HTTP caching headers for API responses
app.use((req, res, next) => {
  // Cache static stats for 60 seconds
  if (req.path === '/api/documents/stats') {
    res.set('Cache-Control', 'private, max-age=60');
  }
  // Cache health checks for 10 seconds
  else if (req.path.startsWith('/api/health')) {
    res.set('Cache-Control', 'public, max-age=10');
  }
  // No cache for dynamic content by default
  else {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

// Add request timeout middleware
app.use((req, res, next) => {
  // Set timeout to 15 minutes for file uploads (increased for large documents)
  if (req.path.includes('/upload')) {
    req.setTimeout(900000); // 15 minutes
    res.setTimeout(900000); // 15 minutes
  }
  // Health checks must respond within 3 seconds (Render timeout is 5s)
  else if (req.path.startsWith('/api/health')) {
    req.setTimeout(3000);
    res.setTimeout(3000);
  }
  next();
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
fs.ensureDirSync(uploadsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (reduced from 100MB)
    fieldSize: 50 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    logger.info(`📁 Uploading file: ${file.originalname} (${file.mimetype})`);
    
    const allowedTypes = ['.pdf', '.docx', '.txt', '.md', '.png', '.jpg', '.jpeg', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, TXT, MD, PNG, JPG, and JSON files are allowed.'));
    }
  }
});

// Routes with rate limiting
app.use('/api/upload', uploadLimiter, upload.single('file'), fileUploadRouter);
app.use('/api/blazing', blazingSearchRouter); // Ultra-fast search endpoint
app.use('/api/search', searchRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/graph', graphRouter);
app.use('/api/health', healthRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/categories', categoryRouter); // Smart KB category management
app.use('/api/search', ultimateSearchRouter);

// Swagger API documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Knowledge Base API Docs'
}));

// JSON spec endpoint
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ========================================
// SERVE STATIC FRONTEND FILES (Production)
// ========================================
if (process.env.NODE_ENV === 'production') {
  const frontendBuildPath = path.join(__dirname, '../../frontend/build');
  
  // Check if frontend build exists
  if (fs.existsSync(frontendBuildPath)) {
    logger.info('📦 Serving static frontend from:', frontendBuildPath);
    
    // Serve static files with caching
    app.use(express.static(frontendBuildPath, {
      maxAge: '1y', // Cache static assets for 1 year
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        // Don't cache HTML files (for new deployments)
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
        // Cache CSS/JS/images aggressively
        else if (filePath.match(/\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));

    // SPA routing: serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api/')) {
        return next();
      }
      
      // Serve index.html for all other routes (React Router handles client-side routing)
      const indexPath = path.join(frontendBuildPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        logger.error('Frontend index.html not found at:', indexPath);
        res.status(404).json({ error: 'Frontend not built' });
      }
    });
  } else {
    logger.warn('⚠️  Frontend build not found. Run `npm run build:frontend` first.');
    logger.warn('   Expected path:', frontendBuildPath);
  }
} else {
  logger.info('🔧 Development mode - frontend should run separately on http://localhost:3000');
}

// 404 handler for API routes only (after static file handling)
app.use('/api/*', notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Memory monitoring (log every 60 seconds)
setInterval(() => {
  const used = process.memoryUsage();
  logger.debug('Memory usage', {
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`
  });
}, 60000);

// Initialize services and start server
async function startServer() {
  try {
    // Check for required environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for embeddings. Please add it to your .env file.');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is required. Please add your MongoDB connection string to your .env file.');
    }

    logger.info('🚀 Starting Personal Knowledge Base Server...');

    // Initialize Redis (optional - graceful degradation if unavailable)
    try {
      await redisService.initialize();
      if (redisService.isAvailable()) {
        logger.info('✅ Redis cache initialized');
      } else {
        logger.info('⚠️ Redis not available - using in-memory cache');
      }
    } catch (error) {
      logger.warn('Redis initialization failed - using in-memory cache');
    }

    // Initialize services in order
    GptService.initialize();
    logger.info('✅ GPT service initialized');

    await DatabaseService.initialize();
    logger.info('✅ Database service initialized');

    await VectorService.initialize();
    logger.info('✅ Vector service initialized');

    app.listen(PORT, () => {
      logger.info(`🌟 Server running on port ${PORT}`);
      logger.info(`📋 Health check: http://localhost:${PORT}/api/health`);
      logger.info(`📋 Detailed health: http://localhost:${PORT}/api/health/detailed`);
      logger.info('🔍 API endpoints:');
      logger.info('   📤 Upload: POST /api/upload');
      logger.info('   🔎 Search: POST /api/search');
      logger.info('   🚀 Ultimate Search: POST /api/search/ultimate');
      logger.info('   📁 Documents: GET /api/documents');
      logger.info('   📊 Stats: GET /api/documents/stats');
      logger.info('🎉 Personal Knowledge Base is ready!');

      // Start cache warmup in background (after server is ready)
      setTimeout(() => {
        logger.info('🔥 Starting background cache warmup...');
        cacheWarmer.warmup().catch(err => logger.error('Cache warmup failed:', err));
        
        // Schedule periodic cache refresh (every hour)
        cacheWarmer.scheduleRefresh(3600000);
        
        // Start keep-alive for Render (prevents sleeping)
        keepAlive.start();
      }, 5000);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

startServer();