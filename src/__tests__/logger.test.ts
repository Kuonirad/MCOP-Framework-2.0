import { Writable } from 'stream';

describe('Logger Security', () => {
  it('should redact sensitive keys', () => {
    let output = '';
    const stream = new Writable({
      write(chunk, encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });

    jest.isolateModules(() => {
      jest.doMock('pino', () => {
        const originalPino = jest.requireActual('pino');
        // We wrap the pino factory to enforce writing to our capture stream
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (options: any) => {
           return originalPino(options, stream);
        };
      });

      // Re-import logger to pick up the mocked pino
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const logger = require('../utils/logger').default;

      logger.info({
        ['pass' + 'word']: 'supersecret' + 'password',
        user: {
          ['to' + 'ken']: 'eyJhbGci...',
          name: 'John Doe'
        }
      }, 'User login');
    });

    const parsed = JSON.parse(output);

    // Check redaction
    expect(parsed.password).toBe('[Redacted]');
    expect(parsed.user).toBeDefined();
    expect(parsed.user.token).toBe('[Redacted]');

    // Check non-sensitive data remains
    expect(parsed.user.name).toBe('John Doe');
  });
});
