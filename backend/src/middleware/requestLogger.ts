import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, logRequest } from '../utils/logger';

// Extend Express Request type to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Generate unique request ID
  const requestId = uuidv4();
  req.requestId = requestId;
  req.startTime = Date.now();

  // Add request ID to response headers for tracing
  res.setHeader('X-Request-ID', requestId);

  // Log incoming request
  logger.debug('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    userAgent: req.get('user-agent'),
    ip: req.ip || req.socket.remoteAddress
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    
    logRequest(
      requestId,
      req.method,
      req.path,
      res.statusCode,
      duration,
      {
        contentLength: res.get('content-length'),
        userAgent: req.get('user-agent')?.substring(0, 100)
      }
    );
  });

  next();
};

export default requestLogger;
