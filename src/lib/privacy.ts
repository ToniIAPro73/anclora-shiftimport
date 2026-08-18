/**
 * M0 privacy minimum: user-accessible local data reset. The product is
 * local-first (see src/lib/storage.ts) — every key it writes is prefixed
 * `anclora`, so a full reset is a prefix sweep with no per-feature list to
 * keep in sync.
 */
export const LOCAL_DATA_KEY_PREFIXES = ['anclora'];

export function listAncloraStorageKeys(): string[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && LOCAL_DATA_KEY_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      keys.push(key);
    }
  }
  return keys;
}

/** Deletes every locally persisted key (shifts, shift types, profile, theme, cookie choice). */
export function resetAllLocalData(): number {
  const keys = listAncloraStorageKeys();
  for (const key of keys) {
    localStorage.removeItem(key);
  }
  return keys.length;
}
