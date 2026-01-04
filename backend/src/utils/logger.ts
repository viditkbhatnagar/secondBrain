import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs-extra';

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
fs.ensureDirSync(logsDir);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport (colorized for dev)
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  })
];

// Add file transports only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  );

  // Daily rotating log file for all logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'knowledge-base' },
  transports
});

// Helper methods for structured logging
export const logRequest = (requestId: string, method: string, path: string, statusCode: number, duration: number, meta?: object) => {
  logger.info('Request completed', {
    requestId,
    method,
    path,
    statusCode,
    duration: `${duration}ms`,
    ...meta
  });
};

export const logAICall = (requestId: string, action: string, meta: object) => {
  logger.info('AI API call', {
    requestId,
    action,
    ...meta
  });
};

export const logError = (requestId: string, error: Error, context?: object) => {
  logger.error('Error occurred', {
    requestId,
    error: error.message,
    stack: error.stack,
    ...context
  });
};

export const logPerformance = (name: string, duration: number, meta?: object) => {
  if (duration > 1000) {
    logger.warn('Slow operation detected', { name, duration: `${duration}ms`, ...meta });
  } else {
    logger.debug('Operation completed', { name, duration: `${duration}ms`, ...meta });
  }
};

export default logger;
