import request from 'supertest';
import express from 'express';

// Create a simple rate limiter for testing
const createTestLimiter = (max: number, windowMs: number) => {
  const requests = new Map<string, number[]>();
  
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get existing requests for this IP
    let ipRequests = requests.get(ip) || [];
    
    // Filter to only requests within the window
    ipRequests = ipRequests.filter(time => time > windowStart);
    
    if (ipRequests.length >= max) {
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', '0');
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    ipRequests.push(now);
    requests.set(ip, ipRequests);
    
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(max - ipRequests.length));
    next();
  };
};

describe('Rate Limiter Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.set('trust proxy', true);
  });

  describe('Basic rate limiting', () => {
    it('should allow requests under limit', async () => {
      app.use(createTestLimiter(5, 60000));
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    });

    it('should include rate limit headers', async () => {
      app.use(createTestLimiter(100, 60000));
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should block requests over limit', async () => {
      app.use(createTestLimiter(2, 60000));
      app.get('/test', (req, res) => res.json({ success: true }));

      // Make requests up to the limit
      await request(app).get('/test');
      await request(app).get('/test');
      
      // This should be blocked
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should return 429 with error message when rate limited', async () => {
      app.use(createTestLimiter(1, 60000));
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      const res = await request(app).get('/test');
      
      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Rate limit headers', () => {
    it('should show correct remaining count', async () => {
      app.use(createTestLimiter(5, 60000));
      app.get('/test', (req, res) => res.json({ success: true }));

      const res1 = await request(app).get('/test');
      expect(res1.headers['ratelimit-remaining']).toBe('4');

      const res2 = await request(app).get('/test');
      expect(res2.headers['ratelimit-remaining']).toBe('3');
    });

    it('should show 0 remaining when at limit', async () => {
      app.use(createTestLimiter(2, 60000));
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      const res = await request(app).get('/test');
      
      expect(res.headers['ratelimit-remaining']).toBe('0');
    });
  });
});
