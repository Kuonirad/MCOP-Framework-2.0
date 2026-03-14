import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  // SECURITY: Redact sensitive information to prevent accidental logging of secrets
  redact: [
    'password',
    'token',
    'authorization',
    'apiKey',
    'secret',
    'cookie',
    '*.password',
    '*.token',
    '*.authorization',
    '*.apiKey',
    '*.secret',
    '*.cookie'
  ],
});

export default logger;
