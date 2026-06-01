/**
 * Rate Limiter Module
 * Protect against excessive API calls and implement fair usage
 */

export interface RateLimitConfig {
  /** Max requests per window */
  maxRequests: number;
  /** Window duration in ms */
  windowMs: number;
  /** Key extractor function */
  keyExtractor?: (context: RateLimitContext) => string;
  /** Skip check function */
  skip?: (context: RateLimitContext) => boolean;
  /** What to do when limit exceeded */
  onLimitExceeded?: (info: RateLimitInfo) => void;
  /** Use sliding window (more accurate but uses more memory) */
  slidingWindow?: boolean;
  /** Enable burst allowance */
  burstAllowance?: number;
}

export interface RateLimitContext {
  /** Identifier (IP, user ID, etc.) */
  identifier: string;
  /** Endpoint or action being rate limited */
  endpoint?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface RateLimitInfo {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** When the limit resets (Unix timestamp) */
  resetAt: number;
  /** Total limit */
  limit: number;
  /** Time until reset in ms */
  retryAfterMs: number;
}

interface WindowEntry {
  count: number;
  timestamps: number[];
  resetAt: number;
}

/**
 * Rate limiter with sliding window support
 */
export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private config: Required<RateLimitConfig>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      keyExtractor: config.keyExtractor ?? ((ctx) => ctx.identifier),
      skip: config.skip ?? (() => false),
      onLimitExceeded: config.onLimitExceeded ?? (() => {}),
      slidingWindow: config.slidingWindow ?? false,
      burstAllowance: config.burstAllowance ?? 0,
    };

    // Cleanup old entries every minute
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be allowed
   */
  check(context: RateLimitContext): RateLimitInfo {
    // Skip check if configured
    if (this.config.skip(context)) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: Date.now() + this.config.windowMs,
        limit: this.config.maxRequests,
        retryAfterMs: 0,
      };
    }

    const key = this.config.keyExtractor(context);
    const now = Date.now();
    
    if (this.config.slidingWindow) {
      return this.checkSlidingWindow(key, now);
    } else {
      return this.checkFixedWindow(key, now);
    }
  }

  /**
   * Consume a request (check + increment)
   */
  consume(context: RateLimitContext): RateLimitInfo {
    const info = this.check(context);
    
    if (!info.allowed) {
      this.config.onLimitExceeded(info);
      return info;
    }

    const key = this.config.keyExtractor(context);
    const entry = this.windows.get(key);
    
    if (entry) {
      entry.count++;
      if (this.config.slidingWindow) {
        entry.timestamps.push(Date.now());
      }
    }

    return {
      ...info,
      remaining: info.remaining - 1,
    };
  }

  /**
   * Reset limit for a specific key
   */
  reset(identifier: string): void {
    this.windows.delete(identifier);
  }

  /**
   * Reset all limits
   */
  resetAll(): void {
    this.windows.clear();
  }

  /**
   * Get current state for a key
   */
  getState(identifier: string): RateLimitInfo | null {
    const entry = this.windows.get(identifier);
    if (!entry) return null;

    const now = Date.now();
    const totalLimit = this.config.maxRequests + this.config.burstAllowance;

    return {
      allowed: entry.count < totalLimit,
      remaining: Math.max(0, totalLimit - entry.count),
      resetAt: entry.resetAt,
      limit: totalLimit,
      retryAfterMs: Math.max(0, entry.resetAt - now),
    };
  }

  /**
   * Fixed window rate limiting
   */
  private checkFixedWindow(key: string, now: number): RateLimitInfo {
    let entry = this.windows.get(key);
    const totalLimit = this.config.maxRequests + this.config.burstAllowance;

    // Create new window if needed
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        timestamps: [],
        resetAt: now + this.config.windowMs,
      };
      this.windows.set(key, entry);
    }

    const allowed = entry.count < totalLimit;
    const remaining = Math.max(0, totalLimit - entry.count);
    const retryAfterMs = allowed ? 0 : entry.resetAt - now;

    return {
      allowed,
      remaining,
      resetAt: entry.resetAt,
      limit: totalLimit,
      retryAfterMs,
    };
  }

  /**
   * Sliding window rate limiting
   */
  private checkSlidingWindow(key: string, now: number): RateLimitInfo {
    let entry = this.windows.get(key);
    const totalLimit = this.config.maxRequests + this.config.burstAllowance;
    const windowStart = now - this.config.windowMs;

    if (!entry) {
      entry = {
        count: 0,
        timestamps: [],
        resetAt: now + this.config.windowMs,
      };
      this.windows.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
    entry.count = entry.timestamps.length;

    const allowed = entry.count < totalLimit;
    const remaining = Math.max(0, totalLimit - entry.count);

    // Calculate when the oldest request will expire
    let retryAfterMs = 0;
    if (!allowed && entry.timestamps.length > 0) {
      const oldestTs = Math.min(...entry.timestamps);
      retryAfterMs = Math.max(0, oldestTs + this.config.windowMs - now);
    }

    return {
      allowed,
      remaining,
      resetAt: now + this.config.windowMs,
      limit: totalLimit,
      retryAfterMs,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, entry] of this.windows) {
      if (this.config.slidingWindow) {
        // For sliding window, remove if all timestamps expired
        if (entry.timestamps.every((ts) => ts <= windowStart)) {
          this.windows.delete(key);
        }
      } else {
        // For fixed window, remove if window expired
        if (now >= entry.resetAt) {
          this.windows.delete(key);
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.windows.clear();
  }
}

/**
 * Multi-tier rate limiter (e.g., per-second + per-minute + per-hour)
 */
export class TieredRateLimiter {
  private limiters: RateLimiter[];

  constructor(configs: RateLimitConfig[]) {
    this.limiters = configs.map((c) => new RateLimiter(c));
  }

  /**
   * Check all tiers
   */
  check(context: RateLimitContext): RateLimitInfo {
    for (const limiter of this.limiters) {
      const info = limiter.check(context);
      if (!info.allowed) {
        return info;
      }
    }

    // All passed, return the most restrictive remaining
    const allInfos = this.limiters.map((l) => l.check(context));
    const minRemaining = Math.min(...allInfos.map((i) => i.remaining));
    const minResetAt = Math.min(...allInfos.map((i) => i.resetAt));

    return {
      allowed: true,
      remaining: minRemaining,
      resetAt: minResetAt,
      limit: Math.min(...allInfos.map((i) => i.limit)),
      retryAfterMs: 0,
    };
  }

  /**
   * Consume from all tiers
   */
  consume(context: RateLimitContext): RateLimitInfo {
    // First check all
    const checkResult = this.check(context);
    if (!checkResult.allowed) {
      return checkResult;
    }

    // Then consume from all
    let result = checkResult;
    for (const limiter of this.limiters) {
      result = limiter.consume(context);
    }

    return result;
  }

  /**
   * Reset all tiers for an identifier
   */
  reset(identifier: string): void {
    for (const limiter of this.limiters) {
      limiter.reset(identifier);
    }
  }

  /**
   * Cleanup all limiters
   */
  destroy(): void {
    for (const limiter of this.limiters) {
      limiter.destroy();
    }
  }
}

/**
 * Token bucket rate limiter for smoother rate limiting
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens
   */
  consume(count: number = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Check if tokens available without consuming
   */
  check(count: number = 1): boolean {
    this.refill();
    return this.tokens >= count;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Time until N tokens available
   */
  timeUntilTokens(count: number): number {
    this.refill();
    
    if (this.tokens >= count) {
      return 0;
    }

    const needed = count - this.tokens;
    return Math.ceil((needed / this.refillRate) * 1000);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Create standard rate limiter presets
 */
export const RateLimitPresets = {
  /**
   * Standard API rate limit (100 req/min)
   */
  standard: (): RateLimitConfig => ({
    maxRequests: 100,
    windowMs: 60000,
  }),

  /**
   * Strict rate limit (10 req/min)
   */
  strict: (): RateLimitConfig => ({
    maxRequests: 10,
    windowMs: 60000,
  }),

  /**
   * Lenient rate limit (1000 req/min)
   */
  lenient: (): RateLimitConfig => ({
    maxRequests: 1000,
    windowMs: 60000,
  }),

  /**
   * Payment-specific (5 req/sec, 100 req/min)
   */
  payment: (): RateLimitConfig[] => [
    { maxRequests: 5, windowMs: 1000 },
    { maxRequests: 100, windowMs: 60000 },
  ],
};

/**
 * Create rate limiter
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}

/**
 * Create tiered rate limiter
 */
export function createTieredRateLimiter(configs: RateLimitConfig[]): TieredRateLimiter {
  return new TieredRateLimiter(configs);
}
