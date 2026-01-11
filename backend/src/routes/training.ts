import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { TrainingService } from '../services/TrainingService';
import { requireAdmin } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';

export const trainingRouter = express.Router();

// Configure multer for training document uploads
const trainingUploadsDir = path.join(__dirname, '../../uploads/training');
fs.ensureDirSync(trainingUploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, trainingUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'training-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for training documents.'));
    }
  }
});

// ========================================
// PUBLIC ROUTES (For users)
// ========================================

/**
 * Get all active organizations (public)
 */
trainingRouter.get('/organizations', async (req, res) => {
  try {
    const organizations = await TrainingService.getOrganizations(false);
    res.json({ success: true, organizations });
  } catch (error: any) {
    logger.error('Failed to get organizations:', error);
    res.status(500).json({ error: 'Failed to get organizations', message: error.message });
  }
});

/**
 * Get organization by ID (public)
 */
trainingRouter.get('/organizations/:id', async (req, res) => {
  try {
    const organization = await TrainingService.getOrganizationById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json({ success: true, organization });
  } catch (error: any) {
    logger.error('Failed to get organization:', error);
    res.status(500).json({ error: 'Failed to get organization', message: error.message });
  }
});

/**
 * Get courses by organization (public)
 */
trainingRouter.get('/organizations/:orgId/courses', async (req, res) => {
  try {
    const courses = await TrainingService.getCoursesByOrganization(req.params.orgId, false);
    res.json({ success: true, courses });
  } catch (error: any) {
    logger.error('Failed to get courses:', error);
    res.status(500).json({ error: 'Failed to get courses', message: error.message });
  }
});

/**
 * Get all courses (public)
 */
trainingRouter.get('/courses', async (req, res) => {
  try {
    const courses = await TrainingService.getAllCourses(false);
    res.json({ success: true, courses });
  } catch (error: any) {
    logger.error('Failed to get courses:', error);
    res.status(500).json({ error: 'Failed to get courses', message: error.message });
  }
});

/**
 * Get course by ID (public)
 */
trainingRouter.get('/courses/:id', async (req, res) => {
  try {
    const course = await TrainingService.getCourseById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    res.json({ success: true, course });
  } catch (error: any) {
    logger.error('Failed to get course:', error);
    res.status(500).json({ error: 'Failed to get course', message: error.message });
  }
});

/**
 * Get documents by course (public)
 */
trainingRouter.get('/courses/:courseId/documents', async (req, res) => {
  try {
    const documents = await TrainingService.getDocumentsByCourse(req.params.courseId, false);
    res.json({ success: true, documents });
  } catch (error: any) {
    logger.error('Failed to get documents:', error);
    res.status(500).json({ error: 'Failed to get documents', message: error.message });
  }
});

/**
 * Get document by ID (public)
 */
trainingRouter.get('/documents/:id', async (req, res) => {
  try {
    const document = await TrainingService.getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true, document });
  } catch (error: any) {
    logger.error('Failed to get document:', error);
    res.status(500).json({ error: 'Failed to get document', message: error.message });
  }
});

/**
 * Serve PDF file for viewing (public)
 */
trainingRouter.get('/documents/:id/file', async (req, res) => {
  try {
    const document = await TrainingService.getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Try multiple paths to handle different environments
    let resolvedPath = document.filePath;

    // First try the stored absolute path
    if (!await fs.pathExists(resolvedPath)) {
      // If not found, try to resolve using the filename in local uploads directory
      // This handles the case where DB has production paths but we're running locally
      const filename = path.basename(document.filePath);
      const localPath = path.join(trainingUploadsDir, filename);

      if (await fs.pathExists(localPath)) {
        resolvedPath = localPath;
        logger.info(`Resolved file path from production to local: ${filename}`);
      } else {
        // Also try using the stored filename field directly
        const altPath = path.join(trainingUploadsDir, document.filename);
        if (await fs.pathExists(altPath)) {
          resolvedPath = altPath;
          logger.info(`Resolved file path using filename field: ${document.filename}`);
        } else {
          logger.error(`Document file not found at any path:`, {
            storedPath: document.filePath,
            localPath,
            altPath
          });
          return res.status(404).json({ error: 'Document file not found' });
        }
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
    // Add CORS headers for PDF viewing from react-pdf
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');

    const fileStream = fs.createReadStream(resolvedPath);
    fileStream.pipe(res);
  } catch (error: any) {
    logger.error('Failed to serve document file:', error);
    res.status(500).json({ error: 'Failed to serve document', message: error.message });
  }
});

// ========================================
// AI FEATURES (Public - for training users)
// ========================================

/**
 * Explain a specific page
 */
trainingRouter.post('/documents/:id/explain', async (req, res) => {
  try {
    const { pageNumber } = req.body;
    if (!pageNumber || pageNumber < 1) {
      return res.status(400).json({ error: 'Valid page number is required' });
    }

    const explanation = await TrainingService.explainPage(req.params.id, pageNumber);
    res.json({ success: true, pageNumber, explanation });
  } catch (error: any) {
    logger.error('Failed to explain page:', error);
    res.status(500).json({ error: 'Failed to explain page', message: error.message });
  }
});

/**
 * Generate flashcards for a page
 */
trainingRouter.post('/documents/:id/flashcards', async (req, res) => {
  try {
    const { pageNumber, type = 'all' } = req.body;
    if (!pageNumber || pageNumber < 1) {
      return res.status(400).json({ error: 'Valid page number is required' });
    }

    const flashcards = await TrainingService.generateFlashcards(req.params.id, pageNumber, type);
    res.json({ success: true, flashcards });
  } catch (error: any) {
    logger.error('Failed to generate flashcards:', error);
    res.status(500).json({ error: 'Failed to generate flashcards', message: error.message });
  }
});

/**
 * Generate quiz for a page
 */
trainingRouter.post('/documents/:id/quiz', async (req, res) => {
  try {
    const { pageNumber } = req.body;
    if (!pageNumber || pageNumber < 1) {
      return res.status(400).json({ error: 'Valid page number is required' });
    }

    const quiz = await TrainingService.generateQuiz(req.params.id, pageNumber);
    res.json({ success: true, quiz });
  } catch (error: any) {
    logger.error('Failed to generate quiz:', error);
    res.status(500).json({ error: 'Failed to generate quiz', message: error.message });
  }
});

/**
 * Generate audio explanation for a page
 */
trainingRouter.post('/documents/:id/audio', async (req, res) => {
  try {
    const { pageNumber } = req.body;
    if (!pageNumber || pageNumber < 1) {
      return res.status(400).json({ error: 'Valid page number is required' });
    }

    const audioBuffer = await TrainingService.generateAudioExplanation(req.params.id, pageNumber);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="explanation-page-${pageNumber}.mp3"`);
    res.send(audioBuffer);
  } catch (error: any) {
    logger.error('Failed to generate audio:', error);
    res.status(500).json({ error: 'Failed to generate audio', message: error.message });
  }
});

/**
 * Get training statistics (public)
 */
trainingRouter.get('/stats', async (req, res) => {
  try {
    const stats = await TrainingService.getStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    logger.error('Failed to get training stats:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

// ========================================
// ADMIN ROUTES (Protected)
// ========================================

/**
 * Create organization (admin only)
 */
trainingRouter.post('/admin/organizations', requireAdmin, async (req, res) => {
  try {
    const { name, description, logoUrl } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const organization = await TrainingService.createOrganization(name, description, logoUrl);
    res.json({ success: true, organization });
  } catch (error: any) {
    logger.error('Failed to create organization:', error);
    res.status(500).json({ error: 'Failed to create organization', message: error.message });
  }
});

/**
 * Update organization (admin only)
 */
trainingRouter.put('/admin/organizations/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, logoUrl, isActive } = req.body;
    const organization = await TrainingService.updateOrganization(req.params.id, {
      name,
      description,
      logoUrl,
      isActive
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({ success: true, organization });
  } catch (error: any) {
    logger.error('Failed to update organization:', error);
    res.status(500).json({ error: 'Failed to update organization', message: error.message });
  }
});

/**
 * Delete organization (admin only)
 */
trainingRouter.delete('/admin/organizations/:id', requireAdmin, async (req, res) => {
  try {
    const success = await TrainingService.deleteOrganization(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json({ success: true, message: 'Organization deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete organization:', error);
    res.status(500).json({ error: 'Failed to delete organization', message: error.message });
  }
});

/**
 * Create course (admin only)
 */
trainingRouter.post('/admin/courses', requireAdmin, async (req, res) => {
  try {
    const { organizationId, name, fullName, description, thumbnailUrl } = req.body;
    if (!organizationId || !name || !fullName) {
      return res.status(400).json({ error: 'Organization ID, name, and full name are required' });
    }

    // Verify organization exists
    const org = await TrainingService.getOrganizationById(organizationId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const course = await TrainingService.createCourse(organizationId, name, fullName, description, thumbnailUrl);
    res.json({ success: true, course });
  } catch (error: any) {
    logger.error('Failed to create course:', error);
    res.status(500).json({ error: 'Failed to create course', message: error.message });
  }
});

/**
 * Update course (admin only)
 */
trainingRouter.put('/admin/courses/:id', requireAdmin, async (req, res) => {
  try {
    const { name, fullName, description, thumbnailUrl, isActive } = req.body;
    const course = await TrainingService.updateCourse(req.params.id, {
      name,
      fullName,
      description,
      thumbnailUrl,
      isActive
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({ success: true, course });
  } catch (error: any) {
    logger.error('Failed to update course:', error);
    res.status(500).json({ error: 'Failed to update course', message: error.message });
  }
});

/**
 * Delete course (admin only)
 */
trainingRouter.delete('/admin/courses/:id', requireAdmin, async (req, res) => {
  try {
    const success = await TrainingService.deleteCourse(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Course not found' });
    }
    res.json({ success: true, message: 'Course deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete course:', error);
    res.status(500).json({ error: 'Failed to delete course', message: error.message });
  }
});

/**
 * Upload training document (admin only)
 */
trainingRouter.post('/admin/documents', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const { courseId, description } = req.body;
    if (!courseId) {
      // Clean up uploaded file
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'Course ID is required' });
    }

    // Verify course exists and get organization ID
    const course = await TrainingService.getCourseById(courseId);
    if (!course) {
      await fs.remove(req.file.path);
      return res.status(404).json({ error: 'Course not found' });
    }

    // Get page count
    const pageCount = await TrainingService.getPdfPageCount(req.file.path);

    const document = await TrainingService.createDocument(
      courseId,
      course.organizationId,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.path,
      req.file.size,
      pageCount,
      description
    );

    res.json({ success: true, document });
  } catch (error: any) {
    logger.error('Failed to upload document:', error);
    // Clean up uploaded file on error
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: 'Failed to upload document', message: error.message });
  }
});

/**
 * Update document (admin only)
 */
trainingRouter.put('/admin/documents/:id', requireAdmin, async (req, res) => {
  try {
    const { description, isActive } = req.body;
    const document = await TrainingService.updateDocument(req.params.id, {
      description,
      isActive
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ success: true, document });
  } catch (error: any) {
    logger.error('Failed to update document:', error);
    res.status(500).json({ error: 'Failed to update document', message: error.message });
  }
});

/**
 * Delete document (admin only)
 */
trainingRouter.delete('/admin/documents/:id', requireAdmin, async (req, res) => {
  try {
    const success = await TrainingService.deleteDocument(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete document:', error);
    res.status(500).json({ error: 'Failed to delete document', message: error.message });
  }
});

/**
 * Get all organizations including inactive (admin only)
 */
trainingRouter.get('/admin/organizations', requireAdmin, async (req, res) => {
  try {
    const organizations = await TrainingService.getOrganizations(true);
    res.json({ success: true, organizations });
  } catch (error: any) {
    logger.error('Failed to get organizations:', error);
    res.status(500).json({ error: 'Failed to get organizations', message: error.message });
  }
});

/**
 * Get all courses including inactive (admin only)
 */
trainingRouter.get('/admin/courses', requireAdmin, async (req, res) => {
  try {
    const courses = await TrainingService.getAllCourses(true);
    res.json({ success: true, courses });
  } catch (error: any) {
    logger.error('Failed to get courses:', error);
    res.status(500).json({ error: 'Failed to get courses', message: error.message });
  }
});

export default trainingRouter;
