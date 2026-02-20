import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  redact: [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'key',
    'credential',
    'req.headers.authorization',
    'req.headers.cookie',
  ],
});

export default logger;
