import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  // Security: Redact sensitive information from logs
  redact: ['password', 'token', 'secret', 'authorization', 'cookie'],
});

export default logger;
