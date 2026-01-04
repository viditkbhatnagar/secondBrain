import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { ClaudeService } from '../services/ClaudeService';
import { analyticsService } from '../services/AnalyticsService';

export const chatRouter = express.Router();

/**
 * @swagger
 * /chat/threads:
 *   post:
 *     summary: Create a new chat thread
 *     description: Creates a new conversation thread for chat
 *     tags: [Chat]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               strategy:
 *                 type: string
 *                 enum: [hybrid, vector]
 *                 default: hybrid
 *               rerank:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Thread created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 threadId:
 *                   type: string
 *       500:
 *         description: Server error
 */
chatRouter.post('/threads', async (req, res) => {
  try {
    const { strategy = 'hybrid', rerank = true } = req.body || {};
    const { threadId } = await DatabaseService.createThread(strategy, rerank);
    res.json({ threadId });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create thread', message: error.message });
  }
});

/**
 * @swagger
 * /chat/threads:
 *   get:
 *     summary: List chat threads
 *     description: Returns a list of recent chat threads
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: List of threads
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 threads:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Thread'
 *       500:
 *         description: Server error
 */
chatRouter.get('/threads', async (_req, res) => {
  try {
    const threads = await DatabaseService.listThreads(50);
    res.json({ threads });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list threads', message: error.message });
  }
});

/**
 * @swagger
 * /chat/threads/{threadId}/messages:
 *   get:
 *     summary: Get thread messages
 *     description: Returns all messages in a chat thread
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     responses:
 *       200:
 *         description: Thread messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       500:
 *         description: Server error
 */
chatRouter.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const messages = await DatabaseService.getMessages(threadId, 500);
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get messages', message: error.message });
  }
});

/**
 * @swagger
 * /chat/threads/{threadId}:
 *   patch:
 *     summary: Update thread title
 *     description: Updates the title of a chat thread
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thread updated
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /chat/threads/{threadId}/generate-title:
 *   post:
 *     summary: Generate thread title
 *     description: Uses AI to generate a title based on the first message
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstMessage
 *             properties:
 *               firstMessage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Title generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *       400:
 *         description: Missing firstMessage
 *       500:
 *         description: Server error
 */
chatRouter.post('/threads/:threadId/generate-title', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { firstMessage } = req.body || {};
    
    if (!firstMessage) {
      return res.status(400).json({ error: 'firstMessage is required' });
    }
    
    const title = await ClaudeService.generateThreadTitle(firstMessage);
    await DatabaseService.updateThreadTitle(threadId, title);
    res.json({ title });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate title', message: error.message });
  }
});

/**
 * @swagger
 * /chat/threads/{threadId}:
 *   delete:
 *     summary: Delete thread
 *     description: Deletes a chat thread and all its messages
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     responses:
 *       200:
 *         description: Thread deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       500:
 *         description: Server error
 */
chatRouter.delete('/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    await DatabaseService.deleteThread(threadId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete thread', message: error.message });
  }
});


