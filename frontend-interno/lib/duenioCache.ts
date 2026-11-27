// Caché SWR en memoria + respaldo opcional en sessionStorage para el módulo del Dueño
// Incluye deduplicación de requests en vuelo (in-flight Map) y aislamiento por userId.

export interface CacheEntry<T = any> {
  data: T;
  updatedAt: number;
}

export interface CacheLookup<T = any> {
  data: T;
  updatedAt: number;
  isStale: boolean;
}

const DEFAULT_STALE_TIME_MS = 60_000; // 1 minuto de frescura por defecto
const STORAGE_PREFIX = 'duenio_swr_v1::';

class DuenioCacheStore {
  private activeUserId: string | null = null;
  private memory = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<any>>();
  private listeners = new Map<string, Set<() => void>>();

  private makeFullKey(userId: string, key: string): string {
    return `${userId}::${key}`;
  }

  private makeStorageKey(userId: string, key: string): string {
    return `${STORAGE_PREFIX}${userId}::${key}`;
  }

  ensureUser(userId?: string | null) {
    const normalized = userId || null;
    if (this.activeUserId && this.activeUserId !== normalized) {
      this.clearUserStorage(this.activeUserId);
      this.memory.clear();
      this.inFlight.clear();
    }
    this.activeUserId = normalized;
  }

  private clearUserStorage(userId: string) {
    if (typeof window === 'undefined') return;
    try {
      const prefix = `${STORAGE_PREFIX}${userId}::`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(prefix)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      // Ignorar errores de acceso a sessionStorage
    }
  }

  clearAll() {
    this.activeUserId = null;
    this.memory.clear();
    this.inFlight.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {
        // Ignorar
      }
    }
  }

  get<T = any>(userId: string, key: string, staleTimeMs = DEFAULT_STALE_TIME_MS): CacheLookup<T> | null {
    if (!userId) return null;
    this.ensureUser(userId);
    const fullKey = this.makeFullKey(userId, key);

    let entry = this.memory.get(fullKey) as CacheEntry<T> | undefined;
    if (!entry && typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(this.makeStorageKey(userId, key));
        if (raw) {
          const parsed = JSON.parse(raw) as CacheEntry<T>;
          if (parsed && typeof parsed.updatedAt === 'number' && parsed.data !== undefined) {
            entry = parsed;
            this.memory.set(fullKey, parsed);
          }
        }
      } catch {
        // Ignorar JSON corrupto o storage bloqueado
      }
    }

    if (!entry) return null;

    return {
      data: entry.data,
      updatedAt: entry.updatedAt,
      isStale: Date.now() - entry.updatedAt > staleTimeMs,
    };
  }

  set<T = any>(userId: string, key: string, data: T, persist = true) {
    if (!userId) return;
    this.ensureUser(userId);
    const fullKey = this.makeFullKey(userId, key);
    const entry: CacheEntry<T> = { data, updatedAt: Date.now() };
    this.memory.set(fullKey, entry);

    if (persist && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(this.makeStorageKey(userId, key), JSON.stringify(entry));
      } catch {
        // Quota excedida u otro error: mantener solo en memoria
      }
    }

    this.notify(fullKey);
  }

  async fetchWithSWR<T = any>(
    userId: string,
    key: string,
    fetcher: () => Promise<T>,
    options?: {
      staleTimeMs?: number;
      force?: boolean;
      persist?: boolean;
      shouldCache?: (value: T) => boolean;
    }
  ): Promise<T> {
    if (!userId) {
      return fetcher();
    }

    this.ensureUser(userId);
    const staleTimeMs = options?.staleTimeMs ?? DEFAULT_STALE_TIME_MS;
    const persist = options?.persist ?? true;
    const fullKey = this.makeFullKey(userId, key);

    if (!options?.force) {
      const existing = this.get<T>(userId, key, staleTimeMs);
      if (existing && !existing.isStale) {
        return existing.data;
      }
    }

    const pending = this.inFlight.get(fullKey) as Promise<T> | undefined;
    if (pending && !options?.force) {
      return pending;
    }

    let promise: Promise<T> | null = null;
    promise = (async () => {
      try {
        const result = await fetcher();
        const okToCache = options?.shouldCache
          ? options.shouldCache(result)
          : (result as any)?.success !== false;

        if (okToCache && this.activeUserId === userId) {
          this.set(userId, key, result, persist);
        }
        return result;
      } finally {
        if (promise && this.inFlight.get(fullKey) === promise) {
          this.inFlight.delete(fullKey);
        }
      }
    })();

    this.inFlight.set(fullKey, promise);
    return promise;
  }

  invalidate(userId: string, prefixes?: string[]) {
    if (!userId) return;
    const userPrefix = `${userId}::`;
    const storageUserPrefix = `${STORAGE_PREFIX}${userId}::`;

    for (const fullKey of Array.from(this.memory.keys())) {
      if (!fullKey.startsWith(userPrefix)) continue;
      const key = fullKey.slice(userPrefix.length);
      if (!prefixes || prefixes.length === 0 || prefixes.some((p) => key.startsWith(p))) {
        this.memory.delete(fullKey);
        this.notify(fullKey);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (!k || !k.startsWith(storageUserPrefix)) continue;
          const key = k.slice(storageUserPrefix.length);
          if (!prefixes || prefixes.length === 0 || prefixes.some((p) => key.startsWith(p))) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {
        // Ignorar
      }
    }
  }

  subscribe(userId: string, key: string, cb: () => void): () => void {
    const fullKey = this.makeFullKey(userId, key);
    let set = this.listeners.get(fullKey);
    if (!set) {
      set = new Set();
      this.listeners.set(fullKey, set);
    }
    set.add(cb);
    return () => {
      set?.delete(cb);
      if (set && set.size === 0) {
        this.listeners.delete(fullKey);
      }
    };
  }

  private notify(fullKey: string) {
    const set = this.listeners.get(fullKey);
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignorar errores de listener
      }
    });
  }
}

export const duenioCache = new DuenioCacheStore();
