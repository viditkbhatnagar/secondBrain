import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import { fileUploadRouter } from './routes/fileUpload';
import { searchRouter } from './routes/search';
import { documentsRouter } from './routes/documents';
import { chatRouter } from './routes/chat';
import { DatabaseService } from './services/DatabaseService';
import { VectorService } from './services/VectorService';
import { ClaudeService } from './services/ClaudeService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware with increased limits for large files
// Configure CORS with env overrides for production
const prodOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['https://knowledge-base-frontend-xxx.onrender.com']);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? prodOrigins : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '100mb' })); // Increased from 50mb
app.use(express.urlencoded({ extended: true, limit: '100mb' })); // Increased from 50mb

// Add request timeout middleware
app.use((req, res, next) => {
  // Set timeout to 5 minutes for file uploads
  if (req.path.includes('/upload')) {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
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
    fileSize: 100 * 1024 * 1024, // Increased to 100MB limit
    fieldSize: 100 * 1024 * 1024 // Field size limit
  },
  fileFilter: (req, file, cb) => {
    console.log(`📁 Uploading file: ${file.originalname} (${file.mimetype})`);
    
    const allowedTypes = ['.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, TXT, and MD files are allowed.'));
    }
  }
});

// Routes
app.use('/api/upload', upload.single('file'), fileUploadRouter);
app.use('/api/search', searchRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/chat', chatRouter);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Basic health check with DB state
    const mongodbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongodb: mongodbState
    };

    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', error);
  
  let errorResponse = {
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  };

  // Handle specific error types
  if (error.message?.includes('Invalid file type')) {
    errorResponse = {
      error: 'Invalid file type',
      message: 'Only PDF, DOCX, TXT, and MD files are allowed'
    };
    return res.status(400).json(errorResponse);
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    errorResponse = {
      error: 'File too large',
      message: 'File size must be less than 100MB'
    };
    return res.status(413).json(errorResponse);
  }

  res.status(500).json(errorResponse);
});

// Initialize services and start server
async function startServer() {
  try {
    // Check for required environment variables
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required. Please add it to your .env file.');
    }
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for embeddings. Please add it to your .env file.');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is required. Please add your MongoDB connection string to your .env file.');
    }

    console.log('🚀 Starting Personal Knowledge Base Server...');

    // Initialize services in order
    ClaudeService.initialize();
    console.log('✅ Claude service initialized');

    await DatabaseService.initialize();
    console.log('✅ Database service initialized');

    await VectorService.initialize();
    console.log('✅ Vector service initialized');

    app.listen(PORT, () => {
      console.log(`🌟 Server running on port ${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔍 API endpoints:`);
      console.log(`   📤 Upload: POST /api/upload`);
      console.log(`   🔎 Search: POST /api/search`);
      console.log(`   📁 Documents: GET /api/documents`);
      console.log(`   📊 Stats: GET /api/documents/stats`);
      console.log('');
      console.log('🎉 Personal Knowledge Base is ready!');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();