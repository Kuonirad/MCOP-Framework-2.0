/**
 * @fileoverview Security Logging Tests
 * @description Verifies that the logging configuration properly redacts sensitive information.
 */

// Define the interface for Pino options to avoid 'any'
interface PinoOptions {
  level?: string;
  transport?: unknown;
  redact?: string[];
}

describe('Security Logging Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('initializes pino with redaction for sensitive keys', async () => {
    // Mock pino factory function
    const pinoMock = jest.fn();
    jest.doMock('pino', () => pinoMock);

    // Dynamic import to trigger logger initialization with mocked pino
    await import('../utils/logger');

    // Verify pino was called
    expect(pinoMock).toHaveBeenCalledTimes(1);

    // Get the options passed to pino
    // Cast the call argument to PinoOptions for type safety
    // Using simple casting to avoid linter issues with 'any'
    const calls = pinoMock.mock.calls;
    const firstCallArgs = calls[0] as unknown[];
    const options = firstCallArgs[0] as PinoOptions;

    // Assert redaction is configured
    expect(options.redact).toBeDefined();
    expect(Array.isArray(options.redact)).toBe(true);

    // Verify specific sensitive keys are present
    const sensitiveKeys = [
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

    const redactList = options.redact || [];
    sensitiveKeys.forEach((key) => {
      expect(redactList).toContain(key);
    });
  });
});
