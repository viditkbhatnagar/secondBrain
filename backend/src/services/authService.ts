import jwt from 'jsonwebtoken';
import Admin, { IAdmin } from '../models/Admin';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d';

interface AuthResult {
  success: boolean;
  token?: string;
  admin?: { id: string; email: string; name: string; role: string };
  error?: string;
}

export class AuthService {
  
  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const admin = await Admin.findOne({ email: email.toLowerCase() });
      
      if (!admin) {
        return { success: false, error: 'Invalid credentials' };
      }

      const isValid = await admin.comparePassword(password);
      if (!isValid) {
        return { success: false, error: 'Invalid credentials' };
      }

      const token = jwt.sign(
        { id: (admin._id as string).toString(), email: admin.email, role: admin.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      logger.info(`Admin logged in: ${email}`);

      return {
        success: true,
        token,
        admin: {
          id: (admin._id as string).toString(),
          email: admin.email,
          name: admin.name,
          role: admin.role
        }
      };
    } catch (error) {
      logger.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  verifyToken(token: string): { valid: boolean; decoded?: any } {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { valid: true, decoded };
    } catch {
      return { valid: false };
    }
  }

  async createAdmin(email: string, password: string, name: string): Promise<AuthResult> {
    try {
      const existing = await Admin.findOne({ email: email.toLowerCase() });
      if (existing) {
        return { success: false, error: 'Email already exists' };
      }

      const admin = await Admin.create({ email, password, name });
      
      return {
        success: true,
        admin: {
          id: (admin._id as string).toString(),
          email: admin.email,
          name: admin.name,
          role: admin.role
        }
      };
    } catch (error) {
      logger.error('Create admin error:', error);
      return { success: false, error: 'Failed to create admin' };
    }
  }
}

export const authService = new AuthService();
