import { URL } from 'url';
import { isIP } from 'net';

const SUPPORTED_HOSTS = [
  // YouTube
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  // Instagram
  'instagram.com',
  'www.instagram.com',
  // TikTok
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'm.tiktok.com',
  'vt.tiktok.com',
  // Facebook
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'fb.watch',
  'www.fb.watch',
  // Twitter / X
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'x.com',
  'www.x.com',
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
]);

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
  /^0\.0\.0\.0$/,
];

export type SupportedPlatform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'twitter';

export function isPrivateOrLocalHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) return true;

  const ipVersion = isIP(hostname);
  if (ipVersion) {
    return PRIVATE_IP_RANGES.some((re) => re.test(hostname));
  }

  return false;
}

export function validateMediaUrl(rawUrl: string): {
  valid: boolean;
  platform?: SupportedPlatform;
  normalizedUrl?: string;
  error?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Please enter a valid media URL.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (isPrivateOrLocalHost(hostname)) {
    return { valid: false, error: 'Internal or private addresses are not allowed.' };
  }

  const matchedHost = SUPPORTED_HOSTS.find(
    (h) => hostname === h || hostname.endsWith(`.${h}`)
  );

  if (!matchedHost) {
    return { valid: false, error: 'Unsupported source' };
  }

  let platform: SupportedPlatform;
  if (
    matchedHost.includes('youtube') ||
    matchedHost.includes('youtu.be')
  ) {
    platform = 'youtube';
  } else if (matchedHost.includes('instagram')) {
    platform = 'instagram';
  } else if (matchedHost.includes('tiktok')) {
    platform = 'tiktok';
  } else if (
    matchedHost.includes('facebook') ||
    matchedHost.includes('fb.watch')
  ) {
    platform = 'facebook';
  } else if (
    matchedHost.includes('twitter') ||
    matchedHost === 'x.com' ||
    matchedHost.endsWith('.x.com')
  ) {
    platform = 'twitter';
  } else {
    return { valid: false, error: 'Unsupported source' };
  }

  if (platform === 'youtube') {
    const hasId =
      parsed.searchParams.has('v') ||
      parsed.pathname.includes('/watch') ||
      parsed.pathname.includes('/shorts/') ||
      parsed.pathname.length > 1;
    if (!hasId && !hostname.includes('youtu.be')) {
      return { valid: false, error: 'Invalid YouTube URL.' };
    }
  }

  return {
    valid: true,
    platform,
    normalizedUrl: parsed.toString(),
  };
}

export function detectPlatform(url: string): SupportedPlatform | null {
  const result = validateMediaUrl(url);
  return result.valid ? result.platform ?? null : null;
}
