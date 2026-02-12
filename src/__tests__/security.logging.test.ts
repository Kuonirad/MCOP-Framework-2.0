
describe('Logger Security', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured with sensitive key redaction', async () => {
    // Mock pino function
    const mockPino = jest.fn(() => ({ level: 'info' }));

    // Use doMock to intercept the import
    jest.doMock('pino', () => mockPino);

    // Dynamic import to trigger initialization
    await import('../utils/logger');

    expect(mockPino).toHaveBeenCalledWith(
      expect.objectContaining({
        redact: expect.arrayContaining([
          'password',
          'token',
          'secret',
          'authorization',
          'cookie',
          'key',
          'credential'
        ])
      })
    );
  });
});
