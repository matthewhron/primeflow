/**
 * Tests for cache module
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { 
  Cache, 
  createQuoteCacheKey, 
  createRegionsCacheKey 
} from "../src/cache/index";

describe("Cache", () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache({ ttlMs: 1000, maxEntries: 10 });
  });

  describe("basic operations", () => {
    it("should set and get values", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("should return undefined for missing keys", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("should check if key exists", () => {
      cache.set("key1", "value1");
      expect(cache.has("key1")).toBe(true);
      expect(cache.has("key2")).toBe(false);
    });

    it("should delete keys", () => {
      cache.set("key1", "value1");
      expect(cache.delete("key1")).toBe(true);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.delete("key1")).toBe(false);
    });

    it("should clear all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get("key1")).toBeUndefined();
    });

    it("should return correct size", () => {
      expect(cache.size).toBe(0);
      cache.set("key1", "value1");
      expect(cache.size).toBe(1);
      cache.set("key2", "value2");
      expect(cache.size).toBe(2);
    });
  });

  describe("expiration", () => {
    it("should expire entries after TTL", async () => {
      const shortCache = new Cache<string>({ ttlMs: 50 });
      shortCache.set("key1", "value1");
      
      expect(shortCache.get("key1")).toBe("value1");
      
      await new Promise((r) => setTimeout(r, 100));
      
      expect(shortCache.get("key1")).toBeUndefined();
    });

    it("should allow custom TTL per entry", async () => {
      cache.set("short", "value", 50);
      cache.set("long", "value", 500);
      
      await new Promise((r) => setTimeout(r, 100));
      
      expect(cache.get("short")).toBeUndefined();
      expect(cache.get("long")).toBe("value");
    });

    it("should prune expired entries", async () => {
      const shortCache = new Cache<string>({ ttlMs: 50 });
      shortCache.set("key1", "value1");
      shortCache.set("key2", "value2");
      
      await new Promise((r) => setTimeout(r, 100));
      
      const pruned = shortCache.prune();
      expect(pruned).toBe(2);
      expect(shortCache.size).toBe(0);
    });
  });

  describe("capacity", () => {
    it("should evict oldest entries when at capacity", () => {
      const smallCache = new Cache<string>({ ttlMs: 10000, maxEntries: 3 });
      
      smallCache.set("key1", "value1");
      smallCache.set("key2", "value2");
      smallCache.set("key3", "value3");
      smallCache.set("key4", "value4"); // Should evict key1
      
      expect(smallCache.get("key1")).toBeUndefined();
      expect(smallCache.get("key4")).toBe("value4");
    });
  });

  describe("getOrSet", () => {
    it("should return cached value if exists", async () => {
      cache.set("key1", "cached");
      const factory = vi.fn().mockResolvedValue("new");
      
      const result = await cache.getOrSet("key1", factory);
      
      expect(result).toBe("cached");
      expect(factory).not.toHaveBeenCalled();
    });

    it("should call factory and cache result if not exists", async () => {
      const factory = vi.fn().mockResolvedValue("new");
      
      const result = await cache.getOrSet("key1", factory);
      
      expect(result).toBe("new");
      expect(factory).toHaveBeenCalledOnce();
      expect(cache.get("key1")).toBe("new");
    });

    it("should use custom TTL", async () => {
      const shortCache = new Cache<string>({ ttlMs: 1000 });
      
      await shortCache.getOrSet("key1", async () => "value", 50);
      
      expect(shortCache.get("key1")).toBe("value");
      
      await new Promise((r) => setTimeout(r, 100));
      
      expect(shortCache.get("key1")).toBeUndefined();
    });
  });

  describe("stats", () => {
    it("should return correct statistics", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      
      const stats = cache.stats();
      
      expect(stats.size).toBe(2);
      expect(stats.validEntries).toBe(2);
      expect(stats.expiredEntries).toBe(0);
      expect(stats.maxEntries).toBe(10);
      expect(stats.ttlMs).toBe(1000);
    });

    it("should count expired entries in stats", async () => {
      const shortCache = new Cache<string>({ ttlMs: 50 });
      shortCache.set("key1", "value1");
      
      await new Promise((r) => setTimeout(r, 100));
      
      const stats = shortCache.stats();
      expect(stats.expiredEntries).toBe(1);
      expect(stats.validEntries).toBe(0);
    });
  });
});

describe("cache key helpers", () => {
  describe("createQuoteCacheKey", () => {
    it("should create consistent keys", () => {
      const key1 = createQuoteCacheKey("intent1", 100, "USD", "card");
      const key2 = createQuoteCacheKey("intent1", 100, "USD", "card");
      
      expect(key1).toBe(key2);
    });

    it("should create different keys for different params", () => {
      const key1 = createQuoteCacheKey("intent1", 100, "USD", "card");
      const key2 = createQuoteCacheKey("intent1", 200, "USD", "card");
      const key3 = createQuoteCacheKey("intent1", 100, "EUR", "card");
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it("should include all parameters in key", () => {
      const key = createQuoteCacheKey("intent1", 100, "USD", "card");
      
      expect(key).toContain("intent1");
      expect(key).toContain("100");
      expect(key).toContain("USD");
      expect(key).toContain("card");
    });
  });

  describe("createRegionsCacheKey", () => {
    it("should return consistent key", () => {
      const key1 = createRegionsCacheKey();
      const key2 = createRegionsCacheKey();
      
      expect(key1).toBe(key2);
      expect(key1).toContain("regions");
    });
  });
});
