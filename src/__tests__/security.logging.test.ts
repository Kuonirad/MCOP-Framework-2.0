
describe('Logger Security Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured to redact sensitive information', async () => {
    // Mock pino factory function
    const pinoMock = jest.fn();
    jest.doMock('pino', () => pinoMock);

    // Dynamic import to ensure fresh execution
    await import('../utils/logger');

    expect(pinoMock).toHaveBeenCalledTimes(1);

    interface PinoConfig {
      redact?: string[];
      level?: string;
      transport?: unknown;
    }
    const config = (pinoMock.mock.calls[0][0] as unknown) as PinoConfig;

    expect(config).toHaveProperty('redact');
    expect(config.redact).toEqual(expect.arrayContaining([
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
      'key',
      'credential',
      'req.headers.authorization',
      'req.headers.cookie'
    ]));
  });
});
