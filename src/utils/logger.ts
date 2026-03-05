import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Security Enhancement: Redact sensitive information to prevent data leakage in logs
  redact: ['password', 'token', 'authorization', 'apiKey', 'secret', 'cookie'],
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

export default logger;
