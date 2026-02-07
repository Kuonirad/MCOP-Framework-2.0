describe('Logger Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured with redaction for sensitive keys', async () => {
    const mockPino = jest.fn(() => ({ info: jest.fn(), error: jest.fn() }));
    jest.doMock('pino', () => ({
      __esModule: true,
      default: mockPino,
    }));

    await import('../utils/logger');

    expect(mockPino).toHaveBeenCalledWith(expect.objectContaining({
      redact: expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'cookie'
      ])
    }));
  });
});
