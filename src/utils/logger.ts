import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  redact: ['password', 'token', 'secret', 'Authorization', 'cookie', 'headers.authorization'],
});

export default logger;
