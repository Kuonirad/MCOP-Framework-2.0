import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// define mock factory outside with loose typing for arguments
const mockPino = jest.fn(() => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
})) as unknown as jest.Mock<(...args: unknown[]) => unknown>;

jest.mock('pino', () => ({
  __esModule: true,
  default: mockPino,
}));

describe('Logger Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should be configured with redaction for sensitive keys', async () => {
    // Re-import logger to trigger pino initialization
    await import('../utils/logger');

    expect(mockPino).toHaveBeenCalledWith(expect.objectContaining({
      redact: expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        'key',
        'credential',
        'req.headers.authorization',
        'req.headers.cookie',
      ]),
    }));
  });
});
