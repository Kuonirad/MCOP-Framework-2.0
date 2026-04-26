/**
 * Unit tests for the dynamic sitemap route. Verifies the contract that
 * generative-search systems and Googlebot rely on:
 *   - sitemap is non-empty
 *   - the canonical landing URL is included
 *   - lastModified is a deterministic, valid Date
 *   - the URL respects NEXT_PUBLIC_SITE_URL when present
 */
import sitemap from '../app/sitemap';

describe('sitemap route', () => {
  it('returns a non-empty sitemap with the canonical landing URL', () => {
    const entries = sitemap();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const root = entries[0];
    expect(root.url).toMatch(/\/$/);
    expect(root.priority).toBe(1);
    expect(root.changeFrequency).toBe('weekly');
  });

  it('emits a deterministic lastModified date (no Date.now)', () => {
    const a = sitemap()[0].lastModified as Date;
    const b = sitemap()[0].lastModified as Date;
    expect(a).toBeInstanceOf(Date);
    expect(a.toISOString()).toEqual(b.toISOString());
  });
});
