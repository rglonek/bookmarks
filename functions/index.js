import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as cheerio from 'cheerio';
import { fetchPageStart, RefusedUrlError } from './fetch-page.js';

/**
 * Cloud Function to extract metadata (title, description) from a URL.
 * This is a callable function that requires the user to be authenticated.
 * It only fetches public http(s) pages; see fetch-page.js.
 */
export const extractMetadata = onCall(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 20,
  },
  async (request) => {
    // Verify the user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to extract metadata.'
      );
    }

    const { url } = request.data ?? {};

    if (typeof url !== 'string' || !url.trim()) {
      throw new HttpsError('invalid-argument', 'URL is required');
    }

    try {
      const html = await fetchPageStart(url.trim());
      if (!html) {
        return { title: '', description: '' };
      }
      const $ = cheerio.load(html);

      // Extract title (priority: og:title > twitter:title > title tag)
      let title =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').first().text() ||
        '';

      // Extract description (priority: og:description > twitter:description > meta description)
      let description =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        '';

      // Clean up whitespace
      title = title.replace(/\s+/g, ' ').trim().slice(0, 500);
      description = description.replace(/\s+/g, ' ').trim().slice(0, 2000);

      return { title, description };
    } catch (error) {
      if (error instanceof RefusedUrlError) {
        throw new HttpsError('invalid-argument', error.message);
      }
      if (error?.name === 'AbortError') {
        throw new HttpsError('deadline-exceeded', 'The page took too long to respond');
      }
      if (error?.status) {
        throw new HttpsError('unavailable', error.message);
      }

      console.error('Error extracting metadata:', error);
      throw new HttpsError(
        'internal',
        'Failed to extract metadata from URL'
      );
    }
  }
);
