import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { fileUploadRouter } from './routes/fileUpload';
import { searchRouter } from './routes/search';
import { documentsRouter } from './routes/documents';
import { DatabaseService } from './services/DatabaseService';
import { VectorService } from './services/VectorService';
import { ClaudeService } from './services/ClaudeService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', error);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: error.message 
  });
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

    // Initialize services
    ClaudeService.initialize();
    console.log('Claude service initialized');

    // Initialize database
    await DatabaseService.initialize();
    console.log('Database initialized');

    // Initialize vector service
    await VectorService.initialize();
    console.log('Vector service initialized');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();