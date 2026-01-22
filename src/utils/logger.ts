import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: [
    'password',
    'token',
    'secret',
    'Authorization',
    'cookie',
    'apiKey',
    'access_token',
    'refreshToken',
    '*.password',
    '*.token',
    '*.secret',
    '*.apiKey',
    '*.access_token',
    '*.refreshToken'
  ],
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

export default logger;
