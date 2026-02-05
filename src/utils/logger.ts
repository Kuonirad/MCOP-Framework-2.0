import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.key'
    ],
    remove: true,
  },
});

export default logger;
