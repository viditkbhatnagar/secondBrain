import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { VectorService } from '../services/VectorService';
import { cacheStats, invalidateDocumentCaches } from '../middleware/cacheMiddleware';
import { invalidateAllCaches } from '../utils/cache';

export const documentsRouter = express.Router();

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: Get all documents
 *     description: Returns a list of all uploaded documents
 *     tags: [Documents]
 *     responses:
 *       200:
 *         description: List of documents
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       500:
 *         description: Server error
 */
documentsRouter.get('/', async (req, res) => {
  try {
    const documents = await DatabaseService.getAllDocuments();
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      error: 'Failed to fetch documents',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /documents/{id}/chunks:
 *   get:
 *     summary: Get document chunks
 *     description: Returns all text chunks for a specific document
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document chunks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chunks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       content:
 *                         type: string
 *                       chunkIndex:
 *                         type: number
 *       500:
 *         description: Server error
 */
documentsRouter.get('/:id/chunks', async (req, res) => {
  try {
    const { id } = req.params;
    const chunks = await VectorService.getDocumentChunks(id);
    res.json({ chunks });
  } catch (error) {
    console.error('Error fetching document chunks:', error);
    res.status(500).json({
      error: 'Failed to fetch document chunks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /documents/stats:
 *   get:
 *     summary: Get document statistics
 *     description: Returns aggregate statistics about all documents
 *     tags: [Documents]
 *     responses:
 *       200:
 *         description: Document statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentStats'
 *       500:
 *         description: Server error
 */
documentsRouter.get('/stats', cacheStats(), async (req, res) => {
  try {
    const stats = await DatabaseService.getStats();
    const vectorCount = await VectorService.getVectorCount();
    
    res.json({
      totalDocuments: stats.totalDocuments,
      totalChunks: vectorCount,
      totalWords: stats.totalWords,
      totalSizeMB: stats.totalSizeMB,
      averageWordsPerDocument: stats.averageWordsPerDocument,
      recentUploads: stats.recentUploads,
      topTopics: stats.topTopics
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /documents/classified:
 *   get:
 *     summary: Get classified document groups
 *     description: Returns documents grouped by classification label
 *     tags: [Documents]
 *     responses:
 *       200:
 *         description: Classified groups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                       docs:
 *                         type: array
 *       500:
 *         description: Server error
 */
documentsRouter.get('/classified', async (_req, res) => {
  try {
    // Group by top-level classification label
    // Using direct model to avoid expanding service surface
    const { DocumentModel } = await import('../models/index');
    // @ts-ignore dynamic import doc typing
    const groups = await (DocumentModel as any).aggregate([
      { $match: { 'classification.label': { $exists: true, $ne: null } } },
      { $group: { _id: '$classification.label', docs: { $push: { id: '$id', originalName: '$originalName', uploadedAt: '$uploadedAt', chunkCount: '$chunkCount', wordCount: '$wordCount', confidence: '$classification.confidence' } } } },
      { $project: { label: '$_id', docs: 1, _id: 0 } },
      { $sort: { label: 1 } }
    ]);
    res.json({ groups });
  } catch (error) {
    console.error('Error fetching classified groups:', error);
    res.status(500).json({ error: 'Failed to fetch classified groups' });
  }
});

/**
 * @swagger
 * /documents/entities:
 *   get:
 *     summary: Get entity aggregations
 *     description: Returns aggregated entities extracted from documents
 *     tags: [Documents]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by entity type (e.g., PERSON, ORG, PLACE)
 *     responses:
 *       200:
 *         description: Entity aggregations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       text:
 *                         type: string
 *                       count:
 *                         type: number
 *       500:
 *         description: Server error
 */
documentsRouter.get('/entities', async (req, res) => {
  try {
    const type = String(req.query.type || '');
    const { DocumentModel } = await import('../models/index');
    const pipeline: any[] = [
      { $match: { entities: { $exists: true, $ne: [] } } },
      { $unwind: '$entities' }
    ];
    if (type) pipeline.push({ $match: { 'entities.type': type } });
    pipeline.push(
      { $group: { _id: { type: '$entities.type', text: '$entities.text' }, count: { $sum: 1 } } },
      { $project: { type: '$_id.type', text: '$_id.text', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 200 }
    );
    // @ts-ignore
    const entities = await (DocumentModel as any).aggregate(pipeline);
    res.json({ entities });
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

/**
 * @swagger
 * /documents/by-entity:
 *   get:
 *     summary: Find documents by entity
 *     description: Returns documents containing specific entities
 *     tags: [Documents]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Entity type
 *       - in: query
 *         name: text
 *         schema:
 *           type: string
 *         description: Entity text
 *       - in: query
 *         name: classLabel
 *         schema:
 *           type: string
 *         description: Classification label filter
 *     responses:
 *       200:
 *         description: Matching documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 *       500:
 *         description: Server error
 */
documentsRouter.get('/by-entity', async (req, res) => {
  try {
    const type = String(req.query.type || '');
    const text = String(req.query.text || '');
    const classLabel = String(req.query.classLabel || '');
    const { DocumentModel } = await import('../models/index');
    const query: any = {};
    if (type || text) {
      query.entities = { $elemMatch: { ...(type ? { type } : {}), ...(text ? { text } : {}) } };
    }
    if (classLabel) {
      query['classification.label'] = classLabel;
    }
    // @ts-ignore
    const docs = await (DocumentModel as any)
      .find(query, { content: 0, entities: 1, classification: 1, id: 1, filename: 1, originalName: 1, mimeType: 1, wordCount: 1, chunkCount: 1, uploadedAt: 1 })
      .sort({ uploadedAt: -1 })
      .limit(1000)
      .lean();
    res.json({ documents: docs });
  } catch (error) {
    console.error('Error fetching documents by entity:', error);
    res.status(500).json({ error: 'Failed to fetch documents by entity' });
  }
});

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get document by ID
 *     description: Returns a specific document by its ID
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */
documentsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await DatabaseService.getDocumentById(id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      error: 'Failed to fetch document',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete document
 *     description: Deletes a document and all its associated chunks
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 deletedVectors:
 *                   type: number
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */
documentsRouter.delete('/:id', invalidateDocumentCaches, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if document exists
    const document = await DatabaseService.getDocumentById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Delete vectors first to get accurate count
    const deletedVectorCount = await VectorService.deleteDocument(id);

    // Delete from database (document record only)
    await DatabaseService.deleteDocument(id);
    
    // Invalidate all caches since document data changed
    await invalidateAllCaches();
    
    console.log(`Deleted document ${id} and ${deletedVectorCount} associated vectors`);
    
    res.json({
      success: true,
      message: 'Document deleted successfully',
      deletedVectors: deletedVectorCount
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      error: 'Failed to delete document',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});