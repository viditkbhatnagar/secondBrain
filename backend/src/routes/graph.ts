import express from 'express';
import { GraphService } from '../services/GraphService';

export const graphRouter = express.Router();

graphRouter.get('/entity/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await GraphService.neighborhood(id, 2);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch entity neighborhood', message: error.message });
  }
});


