import { describe, it, expect } from 'vitest';
import { isWebUrl, parseSharedLink } from '../url';

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

describe('parseSharedLink', () => {
  it('ignores a normal page load', () => {
    expect(parseSharedLink('')).toBeUndefined();
    expect(parseSharedLink('?foo=bar')).toBeUndefined();
  });

  it('uses the url parameter when there is one', () => {
    expect(parseSharedLink('?url=https%3A%2F%2Fexample.com%2Fa&title=A&text=Read%20this'))
      .toEqual({ url: 'https://example.com/a', title: 'A', text: 'Read this' });
  });

  it('finds the link inside text when url is empty, as many Android apps send it', () => {
    expect(parseSharedLink('?title=Article&text=Worth%20reading%3A%20https%3A%2F%2Fexample.com%2Fpost.'))
      .toEqual({ url: 'https://example.com/post', title: 'Article', text: 'Worth reading:' });
    expect(parseSharedLink('?url=&text=https%3A%2F%2Fexample.com'))
      .toEqual({ url: 'https://example.com', title: '', text: '' });
  });

  it('returns null for a share without a web link', () => {
    expect(parseSharedLink('?text=just%20words')).toBeNull();
    expect(parseSharedLink('?url=javascript%3Aalert(1)')).toBeNull();
  });
});
