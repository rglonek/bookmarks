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
