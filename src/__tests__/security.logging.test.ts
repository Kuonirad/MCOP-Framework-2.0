import { jest } from '@jest/globals';

describe('Logger Security Configuration', () => {
  let pinoMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    pinoMock = jest.fn();
    jest.mock('pino', () => ({
      __esModule: true,
      default: pinoMock,
    }));
  });

  it('should be configured with redaction for sensitive keys', async () => {
    // Dynamically import the logger to trigger initialization with mocked pino
    await import('../utils/logger');

    // Check the configuration passed to pino constructor
    expect(pinoMock).toHaveBeenCalledWith(expect.objectContaining({
      redact: expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        'key',
        'credential'
      ])
    }));
  });
});
