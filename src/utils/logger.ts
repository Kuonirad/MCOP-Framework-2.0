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
      'Authorization',
      'cookie',
      'user.password',
      'user.secret',
      'headers.authorization',
      'headers.cookie',
    ],
    remove: true,
  },
});

export default logger;
