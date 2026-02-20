import { jest } from '@jest/globals';

// Mock pino before importing anything else
jest.mock('pino', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

describe('Logger Security Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should configure pino with sensitive key redaction', async () => {
    // Dynamically import to ensure the mock is used and module is re-evaluated
    await import('../utils/logger');

    // Get the mocked pino function
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pino = require('pino').default;

    expect(pino).toHaveBeenCalledTimes(1);

    // Check the first argument passed to pino
    const config = pino.mock.calls[0][0];

    expect(config).toHaveProperty('redact');
    expect(Array.isArray(config.redact)).toBe(true);

    const expectedKeys = [
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
      'key',
      'credential',
      'req.headers.authorization',
      'req.headers.cookie',
    ];

    expect(config.redact).toEqual(expect.arrayContaining(expectedKeys));
  });
});
