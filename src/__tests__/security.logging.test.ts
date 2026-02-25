import { jest } from '@jest/globals';

// Mock pino at the top level
// The factory will be called whenever 'pino' is required in a fresh module registry
jest.mock('pino', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      level: 'info'
    })),
  };
});

describe('Logger Security Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured to redact sensitive keys', async () => {
    // Import the logger which triggers the pino initialization
    // This will cause 'pino' to be required and the mock factory to run
    await import('../utils/logger');

    // Get the specific mock instance used in this module registry context
    const pinoMock = (await import('pino')).default;

    // Verify pino was initialized with redaction for sensitive fields
    expect(pinoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redact: expect.arrayContaining([
          'password',
          'token',
          'secret',
          'authorization',
          'cookie'
        ])
      })
    );
  });
});
