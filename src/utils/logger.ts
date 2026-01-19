import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'authorization',
      'Authorization',
      'cookie',
      'accessToken',
      'refreshToken',
      'apiKey',
      'clientSecret',
      // Level 1 nesting
      '*.password',
      '*.token',
      '*.secret',
      '*.authorization',
      '*.Authorization',
      '*.cookie',
      '*.accessToken',
      '*.refreshToken',
      '*.apiKey',
      '*.clientSecret',
      // Level 2 nesting (e.g. data.user.password or req.headers.authorization)
      '*.*.password',
      '*.*.token',
      '*.*.secret',
      '*.*.authorization',
      '*.*.Authorization',
      '*.*.cookie',
      '*.*.accessToken',
      '*.*.refreshToken',
      '*.*.apiKey',
      '*.*.clientSecret',
      // Specific commonly used paths
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    censor: '[Redacted]'
  },
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

export default logger;
