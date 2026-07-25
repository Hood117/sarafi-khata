import "server-only";

/** Normalize usernames for consistent lookup/storage. */
export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}
