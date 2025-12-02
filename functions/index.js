import { onCall, HttpsError } from 'firebase-functions/v2/https';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Cloud Function to extract metadata (title, description) from a URL.
 * This is a callable function that requires the user to be authenticated.
 */
export const extractMetadata = onCall(
  {
    cors: true,
    maxInstances: 10,
  },
  async (request) => {
    // Verify the user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to extract metadata.'
      );
    }

    const { url } = request.data;

    if (!url) {
      throw new HttpsError('invalid-argument', 'URL is required');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new HttpsError('invalid-argument', 'Invalid URL format');
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 10000,
      });

      if (!response.ok) {
        throw new HttpsError(
          'unavailable',
          `Failed to fetch URL: HTTP ${response.status}`
        );
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract title (priority: og:title > twitter:title > title tag)
      let title =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text() ||
        '';

      // Extract description (priority: og:description > twitter:description > meta description)
      let description =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        '';

      // Clean up whitespace
      title = title.trim();
      description = description.trim();

      return { title, description };
    } catch (error) {
      // If it's already an HttpsError, rethrow it
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error('Error extracting metadata:', error);
      throw new HttpsError(
        'internal',
        'Failed to extract metadata from URL'
      );
    }
  }
);

