
import nextConfig from '../../next.config';

describe('next.config.ts', () => {
  it('should have output set to standalone', () => {
    expect(nextConfig.output).toBe('standalone');
  });

  it('should have security headers configured', async () => {
    const headers = nextConfig.headers ? await nextConfig.headers() : [];
    const globalHeaders = headers.find(h => h.source === '/:path*');

    expect(globalHeaders).toBeDefined();

    const headerMap = new Map(globalHeaders?.headers.map(h => [h.key, h.value]));

    expect(headerMap.get('X-DNS-Prefetch-Control')).toBe('on');
    expect(headerMap.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload');
    expect(headerMap.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('Referrer-Policy')).toBe('origin-when-cross-origin');
  });
});
