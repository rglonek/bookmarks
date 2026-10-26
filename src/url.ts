// Bookmarks are opened as links, so only web addresses are allowed. Other
// schemes (javascript:, data:, file:, ...) can run script in the app's origin
// or reach local resources when clicked, and bookmarks can come from other
// people through shared buckets.
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

export function isWebUrl(url: string): boolean {
  try {
    return WEB_PROTOCOLS.has(new URL(url.trim()).protocol);
  } catch {
    return false;
  }
}

export interface SharedLink {
  url: string;
  title: string;
  text: string;
}

/**
 * Read a link shared to the app through the Web Share Target (?url=&title=&text=).
 * Returns undefined when the page wasn't opened by a share, and null when it
 * was but holds no web link. Many Android apps put the link inside `text` and
 * leave `url` empty; then the rest of `text` becomes the description.
 */
export function parseSharedLink(search: string): SharedLink | null | undefined {
  const params = new URLSearchParams(search);
  if (!params.has('url') && !params.has('text') && !params.has('title')) return undefined;

  const title = params.get('title') || '';
  const text = params.get('text') || '';
  const urlParam = (params.get('url') || '').trim();
  if (urlParam) {
    return isWebUrl(urlParam) ? { url: urlParam, title, text } : null;
  }

  const found = text.match(/https?:\/\/\S+/)?.[0];
  // Trailing punctuation from the surrounding sentence isn't part of the link
  const inText = found?.replace(/[).,!?'"]+$/, '');
  if (!found || !inText || !isWebUrl(inText)) return null;
  return { url: inText, title, text: text.replace(found, '').trim() };
}
