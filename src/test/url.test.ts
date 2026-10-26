import { describe, it, expect } from 'vitest';
import { isWebUrl } from '../url';

describe('isWebUrl', () => {
  it('accepts http and https links', () => {
    expect(isWebUrl('https://example.com/page?q=1#top')).toBe(true);
    expect(isWebUrl('http://localhost:3000')).toBe(true);
    expect(isWebUrl('  HTTPS://EXAMPLE.COM  ')).toBe(true);
  });

  it('rejects script, data, file and other schemes', () => {
    expect(isWebUrl('javascript:alert(document.domain)')).toBe(false);
    expect(isWebUrl('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isWebUrl(' javascript:alert(1)')).toBe(false);
    expect(isWebUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isWebUrl('file:///etc/passwd')).toBe(false);
    expect(isWebUrl('chrome://settings')).toBe(false);
  });

  it('rejects things that are not URLs', () => {
    expect(isWebUrl('')).toBe(false);
    expect(isWebUrl('example.com')).toBe(false);
  });
});
