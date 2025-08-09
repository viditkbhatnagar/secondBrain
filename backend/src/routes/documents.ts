import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { VectorService } from '../services/VectorService';

export const documentsRouter = express.Router();

// Get all documents
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

// Get document chunks by document ID
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

// Get statistics (must be before parameterized routes)
documentsRouter.get('/stats', async (req, res) => {
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

// Get classified groups
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

// Entity aggregation endpoint
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

// Find documents by entity (and optional classification)
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

// Get document by ID
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

// Delete document
documentsRouter.delete('/:id', async (req, res) => {
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