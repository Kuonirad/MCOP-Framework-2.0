import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: [
    'password',
    'token',
    'secret',
    'Authorization',
    'authorization',
    'cookie',
    'apiKey',
    'access_token',
    'refreshToken',
    'privateKey',
    'creditCard',
    '*.password',
    '*.token',
    '*.secret',
    '*.Authorization',
    '*.authorization',
    '*.cookie',
    '*.apiKey',
    '*.access_token',
    '*.refreshToken',
    '*.privateKey',
    '*.creditCard'
  ],
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

export default logger;
