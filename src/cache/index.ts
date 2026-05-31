/**
 * In-memory cache for quotes and region data
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheOptions {
  /** TTL in milliseconds */
  ttlMs: number;
  /** Maximum number of entries */
  maxEntries?: number;
}

/**
 * Simple TTL cache implementation
 */
export class Cache<T = unknown> {
  private readonly store: Map<string, CacheEntry<T>> = new Map();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: CacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? 1000;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Evict old entries if at capacity
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }

    const now = Date.now();
    const ttl = ttlMs ?? this.ttlMs;

    this.store.set(key, {
      value,
      expiresAt: now + ttl,
      createdAt: now,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Get or set value with factory function
   */
  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get(key);
    
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Evict expired entries
   */
  prune(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Evict oldest entries to make room
   */
  private evictOldest(): void {
    // First, prune expired
    this.prune();

    // If still at capacity, evict oldest
    if (this.store.size >= this.maxEntries) {
      let oldest: { key: string; createdAt: number } | null = null;

      for (const [key, entry] of this.store.entries()) {
        if (!oldest || entry.createdAt < oldest.createdAt) {
          oldest = { key, createdAt: entry.createdAt };
        }
      }

      if (oldest) {
        this.store.delete(oldest.key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  stats(): CacheStats {
    const now = Date.now();
    let expired = 0;
    let validCount = 0;
    let totalAge = 0;

    for (const entry of this.store.values()) {
      if (now > entry.expiresAt) {
        expired++;
      } else {
        validCount++;
        totalAge += now - entry.createdAt;
      }
    }

    return {
      size: this.store.size,
      validEntries: validCount,
      expiredEntries: expired,
      averageAgeMs: validCount > 0 ? totalAge / validCount : 0,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
    };
  }
}

export interface CacheStats {
  size: number;
  validEntries: number;
  expiredEntries: number;
  averageAgeMs: number;
  maxEntries: number;
  ttlMs: number;
}

/**
 * Create cache key from intent
 */
export function createQuoteCacheKey(
  intentId: string,
  amount: number,
  currency: string,
  method: string
): string {
  return `quote:${intentId}:${amount}:${currency}:${method}`;
}

/**
 * Create cache key for regions
 */
export function createRegionsCacheKey(): string {
  return "regions:all";
}
