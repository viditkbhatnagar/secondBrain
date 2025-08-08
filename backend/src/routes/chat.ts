import express from 'express';
import { DatabaseService } from '../services/DatabaseService';

export const chatRouter = express.Router();

// Create a new chat thread
chatRouter.post('/threads', async (req, res) => {
  try {
    const { strategy = 'hybrid', rerank = true } = req.body || {};
    const { threadId } = await DatabaseService.createThread(strategy, rerank);
    res.json({ threadId });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create thread', message: error.message });
  }
});

// List recent chat threads
chatRouter.get('/threads', async (_req, res) => {
  try {
    const threads = await DatabaseService.listThreads(50);
    res.json({ threads });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list threads', message: error.message });
  }
});

// Get messages for a thread
chatRouter.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const messages = await DatabaseService.getMessages(threadId, 500);
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get messages', message: error.message });
  }
});

// Update thread title
chatRouter.patch('/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { title } = req.body || {};
    await DatabaseService.updateThreadTitle(threadId, String(title || ''));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update thread', message: error.message });
  }
});

// Delete thread
chatRouter.delete('/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    await DatabaseService.deleteThread(threadId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete thread', message: error.message });
  }
});


