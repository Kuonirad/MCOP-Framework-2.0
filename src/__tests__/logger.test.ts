
describe('Logger Configuration', () => {
  let pinoMock: any;

  beforeEach(() => {
    jest.resetModules();
    pinoMock = jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      isLevelEnabled: jest.fn().mockReturnValue(true)
    });
    jest.doMock('pino', () => pinoMock);
  });

  it('should be configured with redaction for sensitive keys', async () => {
    // Import the logger, which will trigger the pino call
    await import('../utils/logger');

    expect(pinoMock).toHaveBeenCalledTimes(1);
    const config = pinoMock.mock.calls[0][0];

    expect(config).toHaveProperty('redact');
    expect(config.redact).toHaveProperty('paths');
    expect(config.redact.paths).toEqual(expect.arrayContaining([
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie'
    ]));
    expect(config.redact).toHaveProperty('remove', true);
  });
});
