describe('Logger Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured with redaction for sensitive keys', () => {
    const pinoMock = jest.fn();
    jest.doMock('pino', () => pinoMock);

    // Use require to load the module synchronously
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../utils/logger');

    expect(pinoMock).toHaveBeenCalledTimes(1);
    const config = pinoMock.mock.calls[0][0] as any;

    expect(config).toBeDefined();
    expect(config.redact).toEqual(expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'cookie'
    ]));
  });
});
