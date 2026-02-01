import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  redact: {
    paths: [
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
      '*.password'
    ],
    censor: '[Redacted]',
  },
});

export default logger;
