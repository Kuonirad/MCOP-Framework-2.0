
// Mock pino before any imports
jest.mock('pino', () => {
  return jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }));
});

describe('Logger Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured with redaction for sensitive keys', () => {
    // We must require the logger after resetModules to ensure pino() is called again
    // Use require inside the test to isolate the side effect
    require('../utils/logger');

    // Get the mocked pino function
    const pino = require('pino');

    // Verify the configuration passed to pino
    expect(pino).toHaveBeenCalledWith(expect.objectContaining({
      redact: expect.arrayContaining([
        'password',
        'token',
        'secret',
        'authorization',
        'cookie'
      ]),
    }));
  });
});
