import { URL } from 'node:url';
import { ValidationError } from './errors.js';

/**
 * Allowed host patterns for platforms that may offer authorized paths.
 * This list is intentionally conservative. Presence in the list does NOT
 * mean a public download is implemented – adapters still enforce authorization.
 */
const ALLOWED_HOST_PATTERNS = [
  // YouTube
  /^([a-z0-9-]+\.)?youtube\.com$/i,
  /^youtu\.be$/i,
  // Instagram
  /^([a-z0-9-]+\.)?instagram\.com$/i,
  // TikTok
  /^([a-z0-9-]+\.)?tiktok\.com$/i,
  // Vimeo (often has authorized downloads for owners)
  /^([a-z0-9-]+\.)?vimeo\.com$/i,
];

/** Private / reserved IP ranges and metadata endpoints that must never be fetched. */
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // CGNAT
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd00:/i,
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  '169.254.169.254',
  'metadata',
]);

/**
 * Basic hostname allow-list + SSRF protection.
 * Does not perform DNS resolution here (that would be done by the downloader
 * if an authorized path existed). Blocks obvious internal targets.
 */
export function validateAndNormalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new ValidationError('URL is required');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ValidationError('Invalid URL format');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ValidationError('Only http and https URLs are allowed');
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new ValidationError('Access to internal or metadata hosts is not allowed');
  }

  // Block literal private IPs
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new ValidationError('Access to private or reserved IP ranges is not allowed');
    }
  }

  // Hostname must match an allowed platform pattern
  const isAllowed = ALLOWED_HOST_PATTERNS.some((re) => re.test(hostname));
  if (!isAllowed) {
    throw new ValidationError(
      `Host "${hostname}" is not in the list of supported platforms. Only authorized content from supported platforms can be processed.`
    );
  }

  // Normalize: strip tracking params that are commonly used for analytics only
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
  trackingParams.forEach((p) => parsed.searchParams.delete(p));

  return {
    href: parsed.href,
    origin: parsed.origin,
    hostname,
    pathname: parsed.pathname,
    search: parsed.search,
  };
}

/**
 * Detect platform from a validated URL.
 */
export function detectPlatform(normalizedUrl) {
  const host = normalizedUrl.hostname;

  if (/youtube\.com$|youtu\.be$/i.test(host)) return 'youtube';
  if (/instagram\.com$/i.test(host)) return 'instagram';
  if (/tiktok\.com$/i.test(host)) return 'tiktok';
  if (/vimeo\.com$/i.test(host)) return 'vimeo';

  return 'unknown';
}
