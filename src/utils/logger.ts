import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  // Security: Redact sensitive keys to prevent leaking credentials in logs
  redact: [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'key',
    'credential'
  ],
});

export default logger;
