
describe('Logger Security Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('configures redaction for sensitive keys', async () => {
    // Create a mock factory function for pino
    const pinoMock = jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }));

    // Mock the 'pino' module
    // We need to return the factory as the default export
    jest.doMock('pino', () => {
      const mock = pinoMock;
      // pino can be called as pino(options)
      return {
        __esModule: true,
        default: mock,
        pino: mock
      };
    });

    // Dynamic import to trigger module execution
    // We use require or await import to ensure the module is re-evaluated
    await import('../utils/logger');

    // The logger module calls pino(...) immediately upon evaluation
    expect(pinoMock).toHaveBeenCalledTimes(1);
    const config = (pinoMock as jest.Mock).mock.calls[0][0];

    expect(config).toBeDefined();
    expect(config).toHaveProperty('redact');

    // Check if sensitive keys are redacted
    // config.redact is likely an array of strings
    const redactedKeys = config.redact;
    const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'key', 'credential'];

    // We expect the redact array to contain all our sensitive keys
    // It might contain more, or be configured differently, but checking for inclusion is good
    if (Array.isArray(redactedKeys)) {
        sensitiveKeys.forEach(key => {
            expect(redactedKeys).toContain(key);
        });
    } else {
        // Fail if not array (pino supports array or object, but we want array for simplicity)
        throw new Error('Expected redact to be an array');
    }
  });
});
