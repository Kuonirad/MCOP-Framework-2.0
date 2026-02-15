import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('Security Logger Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize pino with redaction for sensitive fields', async () => {
    // Mock pino constructor
    const pinoMock = jest.fn();
    jest.doMock('pino', () => ({
      __esModule: true,
      default: pinoMock,
    }));

    // Import logger dynamically to trigger initialization
    await import('../utils/logger');

    // Verify pino was called with redaction config
    expect(pinoMock).toHaveBeenCalledTimes(1);
    const config = pinoMock.mock.calls[0][0] as { redact: string[] };

    expect(config).toBeDefined();
    expect(config.redact).toBeDefined();
    expect(config.redact).toEqual(
      expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        'key',
        'credential',
      ])
    );
  });
});
