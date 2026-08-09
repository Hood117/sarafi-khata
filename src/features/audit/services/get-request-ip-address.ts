import "server-only";

import { headers } from "next/headers";

/**
 * Best-effort client IP from request headers.
 * Returns null when unavailable (common for local/offline Tauri HTTP).
 * Never throws.
 */
export async function getRequestIpAddress(): Promise<string | null> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");

    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) {
        return first.slice(0, 128);
      }
    }

    const realIp = headerStore.get("x-real-ip")?.trim();
    if (realIp) {
      return realIp.slice(0, 128);
    }

    return null;
  } catch {
    return null;
  }
}
