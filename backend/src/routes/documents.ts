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
    
    // Delete from vector store
    const deletedVectorCount = VectorService.deleteDocument(id);
    
    // Delete from database
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

// Get statistics
documentsRouter.get('/stats', async (req, res) => {
  try {
    const documentStats = VectorService.getDocumentStats();
    const totalDocuments = documentStats.length;
    const totalChunks = documentStats.reduce((sum, doc) => sum + doc.chunkCount, 0);
    
    res.json({
      totalDocuments,
      totalChunks,
      documents: documentStats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});