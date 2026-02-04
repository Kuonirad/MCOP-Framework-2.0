
describe('Logger Security Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('initializes pino with redaction for sensitive keys', async () => {
    // Mock pino to inspect the configuration passed to it
    const pinoMock = jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }));

    jest.doMock('pino', () => pinoMock);

    // Import the logger, which triggers the pino constructor
    await import('../utils/logger');

    // Verify that pino was called with the correct redaction paths
    expect(pinoMock).toHaveBeenCalledWith(expect.objectContaining({
      redact: expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'key',
        'credential',
        '*.apiKey'
      ])
    }));
  });
});
