import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  // SECURITY: Redact sensitive fields to prevent them from leaking into the logs
  redact: ['password', 'token', 'authorization', 'apiKey', 'secret', 'cookie'],
});

export default logger;
