import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate';

const testBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().positive('Age must be positive')
});

const testQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const testParamsSchema = z.object({
  id: z.string().min(1, 'ID is required')
});

describe('Validation Middleware', () => {
  describe('validateBody', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.post('/test', validateBody(testBodySchema), (req, res) => {
        res.json({ success: true, data: req.body });
      });
    });

    it('should pass valid data', async () => {
      const res = await request(app)
        .post('/test')
        .send({ name: 'John', age: 25 });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ name: 'John', age: 25 });
    });

    it('should reject invalid data', async () => {
      const res = await request(app)
        .post('/test')
        .send({ name: '', age: -5 });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/test')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject wrong types', async () => {
      const res = await request(app)
        .post('/test')
        .send({ name: 'John', age: 'twenty-five' });
      
      expect(res.status).toBe(400);
    });

    it('should include field-level error details', async () => {
      const res = await request(app)
        .post('/test')
        .send({ name: '', age: 25 });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('details');
    });
  });

  describe('validateQuery', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      app.get('/test', validateQuery(testQuerySchema), (req, res) => {
        res.json({ success: true, query: req.query });
      });
    });

    it('should pass valid query params', async () => {
      const res = await request(app)
        .get('/test')
        .query({ page: '1', limit: '10' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should pass with no query params when optional', async () => {
      const res = await request(app).get('/test');
      
      expect(res.status).toBe(200);
    });

    it('should reject invalid query params', async () => {
      const res = await request(app)
        .get('/test')
        .query({ page: 'abc' });
      
      expect(res.status).toBe(400);
    });
  });

  describe('validateParams', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      app.get('/test/:id', validateParams(testParamsSchema), (req, res) => {
        res.json({ success: true, id: req.params.id });
      });
    });

    it('should pass valid params', async () => {
      const res = await request(app).get('/test/123');
      
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('123');
    });
  });
});
