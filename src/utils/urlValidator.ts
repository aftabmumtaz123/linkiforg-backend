const SUPPORTED_HOSTS = [
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com', 'vt.tiktok.com',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'www.fb.watch',
  'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'x.com', 'www.x.com',
] as const;

const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  'metadata.google.internal', '169.254.169.254',
]);

export type SupportedPlatform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'twitter';

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254)
    );
  }

  return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
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
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  );

  if (!matchedHost) {
    return { valid: false, error: 'Unsupported source.' };
  }

  let platform: SupportedPlatform;

  if (matchedHost.includes('youtube') || matchedHost.includes('youtu.be')) {
    platform = 'youtube';
  } else if (matchedHost.includes('instagram')) {
    platform = 'instagram';
  } else if (matchedHost.includes('tiktok')) {
    platform = 'tiktok';
  } else if (matchedHost.includes('facebook') || matchedHost.includes('fb.watch')) {
    platform = 'facebook';
  } else if (matchedHost.includes('twitter') || matchedHost.includes('x.com')) {
    platform = 'twitter';
  } else {
    return { valid: false, error: 'Unsupported source.' };
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
