// Define a minimal interface for the configuration object we expect
interface PinoConfig {
  redact?: string[];
  level?: string;
  transport?: unknown;
}

// Define the mock type
type PinoMock = jest.Mock<object, [PinoConfig]>;

// Mocking pino to verify configuration
jest.mock('pino', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalPino = jest.requireActual('pino') as any;
  const actualFn = originalPino.default || originalPino;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFn = jest.fn((...args: any[]) => actualFn(...args));
  Object.assign(mockFn, actualFn);
  return {
    __esModule: true,
    default: mockFn,
  };
});

describe('Logger Security', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should be configured to redact sensitive information', async () => {
    // We need to re-import to trigger the pino initialization
    await import('../utils/logger');

    const pinoModule = await import('pino');
    // Cast to unknown first to avoid TS errors with the default export type
    const pinoMock = pinoModule.default as unknown as PinoMock;

    // Check the calls
    expect(pinoMock).toHaveBeenCalled();
    const config = pinoMock.mock.calls[0][0];

    expect(config.redact).toBeDefined();
    expect(config.redact).toEqual(expect.arrayContaining([
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
    ]));
  });
});
