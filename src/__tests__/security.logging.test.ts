describe('Logger Security Configuration', () => {
  let mockPino: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockPino = jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }));
    jest.doMock('pino', () => mockPino);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('configures redaction for sensitive fields', async () => {
    // Import the logger which triggers the pino initialization
    await import('../utils/logger');

    // Verify pino was initialized
    expect(mockPino).toHaveBeenCalled();

    // Get the configuration object passed to pino
    interface PinoConfig {
      redact?: string[];
      level?: string;
      transport?: unknown;
    }
    const config = mockPino.mock.calls[0][0] as PinoConfig;

    // Check for redaction configuration
    expect(config).toHaveProperty('redact');
    expect(Array.isArray(config.redact)).toBe(true);

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
      'key',
      'credential',
      'req.headers.authorization',
      'req.headers.cookie'
    ];

    // Check that all sensitive fields are included in redaction list
    if (config.redact) {
      sensitiveFields.forEach(field => {
        expect(config.redact).toContain(field);
      });
    }
  });
});
