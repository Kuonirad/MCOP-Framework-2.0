import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: [
    'password',
    '*.password',
    'token',
    '*.token',
    'secret',
    '*.secret',
    'Authorization',
    '*.Authorization',
    'authorization',
    '*.authorization',
    'cookie',
    '*.cookie',
    'apiKey',
    '*.apiKey',
    'access_token',
    '*.access_token',
    'refreshToken',
    '*.refreshToken',
  ],
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

export default logger;
