import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import fetch from 'node-fetch';
import { isPublicAddress, publicOnlyLookup } from './address.js';

// Fetches the start of a web page for its title and description, without
// letting the caller reach anything but the public web.

const httpAgent = new http.Agent({ lookup: publicOnlyLookup });
const httpsAgent = new https.Agent({ lookup: publicOnlyLookup });

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

/** The URL can't be fetched for a reason the caller should hear about. */
export class RefusedUrlError extends Error {}

function checkUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new RefusedUrlError('Invalid URL format');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new RefusedUrlError('Only http and https links are supported');
  }
  // An IP literal is connected to without a DNS lookup, so it skips the
  // agents' lookup check; test it here.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) {
    throw new RefusedUrlError('That address is not on the public internet');
  }
  return parsed;
}

function charsetOf(contentType, head) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1];
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  return fromHeader || fromMeta || 'utf-8';
}

function decode(buffer, contentType) {
  // Meta tags are ASCII, so a latin1 read of the start is enough to find one
  const charset = charsetOf(contentType, buffer.subarray(0, 4096).toString('latin1'));
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function readStart(body, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    size += chunk.length;
    // The title and meta tags are near the top; stop reading after that
    if (size >= maxBytes) break;
  }
  return Buffer.concat(chunks).subarray(0, maxBytes);
}

/**
 * Returns the decoded start of the page, or '' if the response isn't HTML.
 * Throws RefusedUrlError for URLs that must not be fetched, and other errors
 * (timeouts, HTTP errors, network failures) as they come.
 */
export async function fetchPageStart(url, { timeoutMs = 8000, maxBytes = 512 * 1024, maxRedirects = 5 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = checkUrl(url);
    for (let redirects = 0; ; redirects++) {
      const response = await fetch(current.href, {
        headers: HEADERS,
        // Redirects are followed by hand so each hop gets checked
        redirect: 'manual',
        signal: controller.signal,
        agent: target => (target.protocol === 'http:' ? httpAgent : httpsAgent),
      });

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        response.body?.resume?.();
        if (redirects >= maxRedirects) throw new RefusedUrlError('Too many redirects');
        current = checkUrl(new URL(location, current).href);
        continue;
      }

      if (!response.ok) {
        response.body?.resume?.();
        const error = new Error(`Failed to fetch URL: HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/html|xml/i.test(contentType)) {
        response.body?.resume?.();
        return '';
      }
      return decode(await readStart(response.body, maxBytes), contentType);
    }
  } finally {
    clearTimeout(timer);
  }
}
