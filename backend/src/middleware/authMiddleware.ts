import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

export interface AuthRequest extends Request {
  admin?: { id: string; email: string; role: string };
}

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { valid, decoded } = authService.verifyToken(token);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.admin = decoded;
  next();
};
