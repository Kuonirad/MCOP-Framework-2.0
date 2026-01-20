
/**
 * @jest-environment node
 */

describe('Logger Redaction', () => {
  it('should redact sensitive information', () => {
    let output = '';
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        output += chunk.toString();
        return true;
    });

    jest.isolateModules(() => {
        const logger = require('../utils/logger').default;

        const sensitiveData = {
          password: 'supersecretpassword',
          token: 'abcdef123456',
          nested: {
            secret: 'hidden',
            apiKey: 'key123'
          },
          email: 'test@example.com' // Should not be redacted
        };

        logger.info(sensitiveData, 'Test log');
    });

    writeSpy.mockRestore();

    // Parse the output
    // There might be multiple lines or noise. find the one with our message.
    const lines = output.trim().split('\n');
    const logLine = lines.find(line => line.includes('Test log'));

    expect(logLine).toBeDefined();

    if (logLine) {
        const logEntry = JSON.parse(logLine);

        // These assertions will fail until redaction is implemented
        expect(logEntry.password).toBe('[Redacted]');
        expect(logEntry.token).toBe('[Redacted]');
        expect(logEntry.nested.secret).toBe('[Redacted]');
        expect(logEntry.email).toBe('test@example.com');
    }
  });
});
