describe('Logger Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should initialize pino with correct redaction settings', async () => {
    const mockPino = jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
      trace: jest.fn(),
    }));

    // doMock is not hoisted, so we can use local variables
    jest.doMock('pino', () => ({
      __esModule: true,
      default: mockPino,
    }));

    // Dynamic import to trigger re-execution of the module
    await import('../utils/logger');

    expect(mockPino).toHaveBeenCalledWith(expect.objectContaining({
      redact: expect.objectContaining({
        paths: expect.arrayContaining([
          'password',
          'token',
          'secret',
          'authorization',
          'cookie',
          'key',
          'credential',
        ]),
        censor: '[REDACTED]',
      }),
    }));
  });
});
