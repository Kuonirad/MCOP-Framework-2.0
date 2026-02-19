import { jest } from '@jest/globals';

describe('Security: Logger Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('should configure pino with redaction for sensitive fields', async () => {
    // Mock pino function
    const pinoMock = jest.fn();

    // We need to use doMock because pino is a default export and we want to change it per test
    jest.doMock('pino', () => ({
      __esModule: true,
      default: pinoMock,
    }));

    // Import the logger which triggers pino() call
    await import('../utils/logger');

    // Verify pino was called with redaction config
    expect(pinoMock).toHaveBeenCalledTimes(1);

    interface PinoConfig {
      redact: string[] | { paths: string[] };
    }

    const config = pinoMock.mock.calls[0][0] as PinoConfig;

    expect(config).toBeDefined();
    expect(config).toHaveProperty('redact');

    // Handle both array format and object format with paths
    const redactedKeys = Array.isArray(config.redact) ? config.redact : config.redact.paths;

    // Check for critical sensitive keys
    expect(redactedKeys).toContain('password');
    expect(redactedKeys).toContain('token');
    expect(redactedKeys).toContain('secret');
    expect(redactedKeys).toContain('authorization');
    expect(redactedKeys).toContain('cookie');
    expect(redactedKeys).toContain('key');
    expect(redactedKeys).toContain('credential');
  });
});
