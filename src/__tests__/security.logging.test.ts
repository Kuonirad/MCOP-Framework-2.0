import { jest, describe, it, expect, beforeEach } from '@jest/globals';

interface LoggerConfig {
  redact?: string[];
  [key: string]: unknown;
}

// Create a mock factory
const mockPino = jest.fn(() => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  isLevelEnabled: jest.fn(() => true),
}));

jest.mock('pino', () => ({
  __esModule: true,
  default: mockPino,
}));

describe('Security Logging Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    mockPino.mockClear();
  });

  it('should redact sensitive keys', async () => {
    // Import the module to trigger pino initialization
    await import('../utils/logger');

    // Verify pino was called
    expect(mockPino).toHaveBeenCalled();

    // Get the config passed to pino
    // Use double casting to avoid TypeScript errors with unknown mock type
    const config = (mockPino as unknown as jest.Mock).mock.calls[0][0] as LoggerConfig;

    // Check redaction configuration
    expect(config).toHaveProperty('redact');
    expect(Array.isArray(config.redact)).toBe(true);

    const requiredRedactions = [
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
      'key',
      'credential'
    ];

    requiredRedactions.forEach(key => {
      expect(config.redact).toContain(key);
    });
  });
});
