import { beforeEach, afterEach, vi } from 'vitest';

/**
 * Stubs the browser localStorage API for node-environment tests.
 * Modules touching localStorage (shift-types, profile, storage) read/write
 * through this in-memory map, cleared before every test.
 */
export function setupLocalStorageMock(): void {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
  });

  afterEach(() => {
    store.clear();
  });

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  });
}
