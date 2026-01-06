import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Verify token
router.get('/verify', requireAdmin, (req: AuthRequest, res: Response) => {
  res.json({ success: true, admin: req.admin });
});

// Logout (client-side token removal)
router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out' });
});

export default router;
