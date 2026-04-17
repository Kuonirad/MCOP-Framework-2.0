const mockPino = jest.fn();
jest.mock('pino', () => mockPino);

describe('logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should initialize with default level "info" and no transport', async () => {
    process.env = { ...originalEnv, LOG_LEVEL: '', NODE_ENV: 'production' };
    await import('../utils/logger');
    expect(mockPino).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      transport: undefined,
      redact: ['password', 'token', 'authorization', 'apiKey', 'secret', 'cookie'],
    }));
  });

  it('should initialize with custom LOG_LEVEL', async () => {
    process.env = { ...originalEnv, LOG_LEVEL: 'debug', NODE_ENV: 'production' };
    await import('../utils/logger');
    expect(mockPino).toHaveBeenCalledWith(expect.objectContaining({
      level: 'debug',
    }));
  });

  it('should use pino-pretty transport in development', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    await import('../utils/logger');
    expect(mockPino).toHaveBeenCalledWith(expect.objectContaining({
      transport: { target: 'pino-pretty' },
    }));
  });
});
