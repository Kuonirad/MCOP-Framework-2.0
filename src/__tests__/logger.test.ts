// Remove explicit import as per project guidelines
// import { jest } from '@jest/globals';

// Hoist the mock factory
jest.mock('pino', () => {
  // Return a mock function as the default export
  return jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }));
});

describe('Logger Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured with redaction for sensitive keys', async () => {
    // Import the mocked pino function to assert on it
    const pinoModule = await import('pino');
    // Using double type assertion to bypass TypeScript type check for the mocked module
    const pinoMock = pinoModule.default as unknown as jest.Mock;

    pinoMock.mockClear();

    // Import the logger which calls pino()
    // We use dynamic import and resetModules to ensure it's re-evaluated
    await import('../utils/logger');

    expect(pinoMock).toHaveBeenCalledTimes(1);
    const config = pinoMock.mock.calls[0][0];

    expect(config).toBeDefined();

    // Check for redact property
    expect(config).toHaveProperty('redact');
    expect(config.redact).toEqual(
      expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        'key',
        'credential'
      ])
    );
  });
});
