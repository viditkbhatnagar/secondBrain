import express from 'express';
import { CategoryService } from '../services/CategoryService';
import { CategoryModel, DocumentModel } from '../models/index';
import { QueryClassifierService } from '../services/QueryClassifierService';
import { logger } from '../utils/logger';

export const categoryRouter = express.Router();

/**
 * GET /categories
 * List all active categories
 */
categoryRouter.get('/', async (req, res) => {
  try {
    const categories = await CategoryService.getAllCategories();
    res.json({
      success: true,
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        keywords: c.keywords,
        documentCount: c.documentCount,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
    });
  } catch (error: any) {
    logger.error('Error listing categories:', { error: error.message });
    res.status(500).json({ error: 'Failed to list categories', message: error.message });
  }
});

/**
 * POST /categories/discover
 * Discover and create categories from existing documents
 * This analyzes all documents and groups them into natural categories
 */
categoryRouter.post('/discover', async (req, res) => {
  try {
    logger.info('Starting category discovery...');

    // Discover categories from existing documents
    const discovered = await CategoryService.discoverCategories();

    if (discovered.length === 0) {
      return res.json({
        success: true,
        message: 'No categories could be discovered. Upload more documents first.',
        categories: []
      });
    }

    // Save discovered categories to database
    await CategoryService.saveDiscoveredCategories(discovered);

    // Invalidate query classifier cache
    QueryClassifierService.invalidateCache();

    // Get updated category list
    const categories = await CategoryService.getAllCategories();

    logger.info(`Category discovery complete: ${categories.length} categories`);

    res.json({
      success: true,
      message: `Discovered and saved ${categories.length} categories`,
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        keywords: c.keywords,
        documentCount: c.documentCount
      }))
    });
  } catch (error: any) {
    logger.error('Error discovering categories:', { error: error.message });
    res.status(500).json({ error: 'Category discovery failed', message: error.message });
  }
});

/**
 * POST /categories
 * Create a new category manually
 */
categoryRouter.post('/', async (req, res) => {
  try {
    const { name, description, keywords } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Name and description are required'
      });
    }

    const category = await CategoryService.createCategory(
      name,
      description,
      keywords || []
    );

    // Invalidate cache
    QueryClassifierService.invalidateCache();

    res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        description: category.description,
        keywords: category.keywords,
        documentCount: category.documentCount
      }
    });
  } catch (error: any) {
    logger.error('Error creating category:', { error: error.message });
    res.status(500).json({ error: 'Failed to create category', message: error.message });
  }
});

/**
 * GET /categories/:name/documents
 * Get all documents in a category
 */
categoryRouter.get('/:name/documents', async (req, res) => {
  try {
    const { name } = req.params;

    const documents = await DocumentModel.find(
      { category: name.toLowerCase() },
      { content: 0 } // Exclude content for performance
    ).sort({ uploadedAt: -1 }).exec();

    res.json({
      success: true,
      category: name.toLowerCase(),
      count: documents.length,
      documents: documents.map(d => ({
        id: d.id,
        originalName: d.originalName,
        summary: d.summary,
        topics: d.topics,
        uploadedAt: d.uploadedAt
      }))
    });
  } catch (error: any) {
    logger.error('Error getting category documents:', { error: error.message });
    res.status(500).json({ error: 'Failed to get documents', message: error.message });
  }
});

/**
 * PUT /categories/:name/documents/:documentId
 * Move a document to a different category
 */
categoryRouter.put('/:name/documents/:documentId', async (req, res) => {
  try {
    const { name, documentId } = req.params;

    // Update document category
    const result = await DocumentModel.findOneAndUpdate(
      { id: documentId },
      { $set: { category: name.toLowerCase() } },
      { new: true }
    ).exec();

    if (!result) {
      return res.status(404).json({
        error: 'Document not found',
        message: `No document found with ID ${documentId}`
      });
    }

    // Update category counts
    await CategoryService.updateCategoryCounts();

    // Invalidate cache
    QueryClassifierService.invalidateCache();

    res.json({
      success: true,
      message: `Document moved to category "${name}"`,
      document: {
        id: result.id,
        originalName: result.originalName,
        category: result.category
      }
    });
  } catch (error: any) {
    logger.error('Error moving document:', { error: error.message });
    res.status(500).json({ error: 'Failed to move document', message: error.message });
  }
});

/**
 * DELETE /categories/:name
 * Delete a category (documents become uncategorized)
 */
categoryRouter.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const normalizedName = name.toLowerCase();

    // Remove category from all documents
    await DocumentModel.updateMany(
      { category: normalizedName },
      { $unset: { category: '' } }
    ).exec();

    // Delete the category
    await CategoryModel.deleteOne({ name: normalizedName }).exec();

    // Invalidate cache
    QueryClassifierService.invalidateCache();

    res.json({
      success: true,
      message: `Category "${name}" deleted. Associated documents are now uncategorized.`
    });
  } catch (error: any) {
    logger.error('Error deleting category:', { error: error.message });
    res.status(500).json({ error: 'Failed to delete category', message: error.message });
  }
});

/**
 * GET /categories/stats
 * Get category statistics
 */
categoryRouter.get('/stats/overview', async (req, res) => {
  try {
    const categories = await CategoryService.getAllCategories();
    const uncategorizedCount = await DocumentModel.countDocuments({
      $or: [{ category: null }, { category: '' }, { category: { $exists: false } }]
    }).exec();

    const totalDocuments = await DocumentModel.countDocuments().exec();
    const categorizedCount = totalDocuments - uncategorizedCount;

    res.json({
      success: true,
      stats: {
        totalCategories: categories.length,
        totalDocuments,
        categorizedDocuments: categorizedCount,
        uncategorizedDocuments: uncategorizedCount,
        categoryCoverage: totalDocuments > 0
          ? Math.round((categorizedCount / totalDocuments) * 100)
          : 0,
        categories: categories.map(c => ({
          name: c.name,
          documentCount: c.documentCount,
          percentage: totalDocuments > 0
            ? Math.round((c.documentCount / totalDocuments) * 100)
            : 0
        }))
      }
    });
  } catch (error: any) {
    logger.error('Error getting category stats:', { error: error.message });
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

/**
 * POST /categories/classify-query
 * Test query classification (for debugging)
 */
categoryRouter.post('/classify-query', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Query required',
        message: 'Please provide a query to classify'
      });
    }

    const classification = await QueryClassifierService.classifyQuery(query);

    res.json({
      success: true,
      query,
      classification
    });
  } catch (error: any) {
    logger.error('Error classifying query:', { error: error.message });
    res.status(500).json({ error: 'Classification failed', message: error.message });
  }
});
