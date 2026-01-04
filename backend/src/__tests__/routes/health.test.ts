import request from 'supertest';
import express from 'express';
import { healthRouter } from '../../routes/health';

const app = express();
app.use(express.json());
app.use('/api/health', healthRouter);

describe('Health Routes', () => {
  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/api/health');
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('version');
    });

    it('should return valid timestamp format', async () => {
      const res = await request(app).get('/api/health');
      
      expect(res.status).toBe(200);
      const timestamp = new Date(res.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe('GET /api/health/live', () => {
    it('should return alive status for liveness probe', async () => {
      const res = await request(app).get('/api/health/live');
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('alive', true);
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/health/ready', () => {
    it('should check readiness status', async () => {
      const res = await request(app).get('/api/health/ready');
      
      // May return 200 or 503 depending on connection state
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('ready');
    });
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed health information', async () => {
      const res = await request(app).get('/api/health/detailed');
      
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('checks');
    });

    it('should include memory information', async () => {
      const res = await request(app).get('/api/health/detailed');
      
      expect(res.body.checks).toHaveProperty('memory');
      expect(res.body.checks.memory).toHaveProperty('status');
      expect(res.body.checks.memory).toHaveProperty('details');
    });

    it('should include system information', async () => {
      const res = await request(app).get('/api/health/detailed');
      
      expect(res.body.checks).toHaveProperty('system');
      expect(res.body.checks.system.details).toHaveProperty('nodeVersion');
      expect(res.body.checks.system.details).toHaveProperty('platform');
    });
  });
});
