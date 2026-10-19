import type { ChromiumProfileInfo } from '@crosssync/core';

/**
 * Builds a short human label for a Chromium profile, e.g.
 * `Roe <roe@example.com>` or just the local profile name when signed out.
 * Returns null when Local State has no metadata for the profile.
 */
export function formatProfileAccount(info: ChromiumProfileInfo | null | undefined): string | null {
  if (!info) {
    return null;
  }
  const displayName = info.isUsingDefaultName
    ? (info.gaiaName ?? info.name)
    : (info.name ?? info.gaiaName);
  const parts: string[] = [];
  if (displayName) {
    parts.push(displayName);
  }
  if (info.userName && info.userName !== displayName) {
    parts.push(`<${info.userName}>`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
