import express from 'express';
import OpenAI from 'openai';
import { VectorService } from '../services/VectorService';
import { DatabaseService } from '../services/DatabaseService';

export const adminRouter = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Run clustering (k-means) over document embeddings
adminRouter.post('/cluster', async (req, res) => {
  try {
    const { k = 5, maxIter = 10 } = req.body || {};
    const result = await VectorService.clusterDocuments(Number(k), Number(maxIter));
    res.json({ clusters: result });
  } catch (error: any) {
    res.status(500).json({ error: 'Clustering failed', message: error.message });
  }
});

// List clusters (counts by clusterId)
adminRouter.get('/clusters', async (_req, res) => {
  try {
    const { DocumentModel } = await import('../models/index');
    // @ts-ignore
    const clusters = await (DocumentModel as any).aggregate([
      { $match: { clusterId: { $exists: true, $ne: null } } },
      { $group: { _id: '$clusterId', size: { $sum: 1 } } },
      { $project: { clusterId: '$_id', size: 1, _id: 0 } },
      { $sort: { clusterId: 1 } }
    ]);
    res.json({ clusters });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list clusters', message: error.message });
  }
});

// Get docs for a cluster
adminRouter.get('/cluster/:id/docs', async (req, res) => {
  try {
    const { id } = req.params;
    const { DocumentModel } = await import('../models/index');
    // @ts-ignore
    const docs = await (DocumentModel as any).find({ clusterId: id }, { content: 0 }).sort({ uploadedAt: -1 }).limit(1000).lean();
    res.json({ documents: docs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch cluster documents', message: error.message });
  }
});

// Summarize a cluster using LLM
adminRouter.post('/cluster/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const { DocumentModel } = await import('../models/index');
    // @ts-ignore
    const docs = await (DocumentModel as any).find({ clusterId: id }, { originalName: 1, summary: 1 }).limit(50).lean();
    const corpus = docs.map((d: any) => `- ${d.originalName}: ${d.summary || ''}`).join('\n');
    const prompt = `Summarize the common themes/topics of the following documents in 4-6 bullet points.\n${corpus}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      max_completion_tokens: 250,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = response.choices[0]?.message?.content?.trim() || '';
    res.json({ summary: text });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to summarize cluster', message: error.message });
  }
});


