/**
 * Idempotency Module
 * Prevent duplicate payments and ensure exactly-once processing
 */

export interface IdempotencyRecord {
  /** Idempotency key */
  key: string;
  /** Request hash */
  requestHash: string;
  /** Response data */
  response?: unknown;
  /** Status */
  status: "processing" | "completed" | "failed";
  /** Created at */
  createdAt: number;
  /** Completed at */
  completedAt?: number;
  /** Expires at */
  expiresAt: number;
  /** Locked until (for concurrent requests) */
  lockedUntil?: number;
}

export interface IdempotencyConfig {
  /** TTL for records in ms */
  ttlMs?: number;
  /** Lock timeout in ms */
  lockTimeoutMs?: number;
  /** Max concurrent processing */
  maxConcurrent?: number;
  /** Custom storage adapter */
  storage?: IdempotencyStorage;
}

export interface IdempotencyStorage {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord): Promise<void>;
  delete(key: string): Promise<void>;
  cleanup(): Promise<number>;
}

/**
 * In-memory storage implementation
 */
class MemoryStorage implements IdempotencyStorage {
  private records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(key);
    if (!record) return null;
    
    // Check expiration
    if (Date.now() > record.expiresAt) {
      this.records.delete(key);
      return null;
    }
    
    return record;
  }

  async set(key: string, record: IdempotencyRecord): Promise<void> {
    this.records.set(key, record);
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, record] of this.records) {
      if (now > record.expiresAt) {
        this.records.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * Generate hash for request
 */
async function hashRequest(data: unknown): Promise<string> {
  const str = JSON.stringify(data);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(str));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Idempotency errors
 */
export class IdempotencyError extends Error {
  constructor(
    message: string,
    public code: string,
    public existingRecord?: IdempotencyRecord
  ) {
    super(message);
    this.name = "IdempotencyError";
  }
}

/**
 * Idempotency manager
 */
export class IdempotencyManager {
  private storage: IdempotencyStorage;
  private config: Required<IdempotencyConfig>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config?: IdempotencyConfig) {
    this.config = {
      ttlMs: config?.ttlMs ?? 24 * 60 * 60 * 1000, // 24 hours
      lockTimeoutMs: config?.lockTimeoutMs ?? 60000, // 1 minute
      maxConcurrent: config?.maxConcurrent ?? 1000,
      storage: config?.storage ?? new MemoryStorage(),
    };
    this.storage = this.config.storage;

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.storage.cleanup().catch(console.error);
    }, 60000);
  }

  /**
   * Check if request can proceed
   */
  async check(key: string, requestData: unknown): Promise<{
    canProceed: boolean;
    existingResponse?: unknown;
    record?: IdempotencyRecord;
  }> {
    const requestHash = await hashRequest(requestData);
    const existing = await this.storage.get(key);

    if (!existing) {
      return { canProceed: true };
    }

    // Check if request hash matches
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyError(
        "Idempotency key already used with different request",
        "KEY_MISMATCH",
        existing
      );
    }

    // If completed, return cached response
    if (existing.status === "completed") {
      return {
        canProceed: false,
        existingResponse: existing.response,
        record: existing,
      };
    }

    // If failed, allow retry
    if (existing.status === "failed") {
      return { canProceed: true, record: existing };
    }

    // If processing, check lock
    if (existing.status === "processing") {
      if (existing.lockedUntil && Date.now() < existing.lockedUntil) {
        throw new IdempotencyError(
          "Request is currently being processed",
          "IN_PROGRESS",
          existing
        );
      }
      // Lock expired, allow retry
      return { canProceed: true, record: existing };
    }

    return { canProceed: true };
  }

  /**
   * Start processing a request
   */
  async startProcessing(key: string, requestData: unknown): Promise<IdempotencyRecord> {
    const requestHash = await hashRequest(requestData);
    const now = Date.now();

    const record: IdempotencyRecord = {
      key,
      requestHash,
      status: "processing",
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
      lockedUntil: now + this.config.lockTimeoutMs,
    };

    await this.storage.set(key, record);
    return record;
  }

  /**
   * Mark request as completed
   */
  async complete(key: string, response: unknown): Promise<void> {
    const existing = await this.storage.get(key);
    if (!existing) {
      throw new IdempotencyError("Record not found", "NOT_FOUND");
    }

    const updated: IdempotencyRecord = {
      ...existing,
      status: "completed",
      response,
      completedAt: Date.now(),
      lockedUntil: undefined,
    };

    await this.storage.set(key, updated);
  }

  /**
   * Mark request as failed
   */
  async fail(key: string, error?: unknown): Promise<void> {
    const existing = await this.storage.get(key);
    if (!existing) return;

    const updated: IdempotencyRecord = {
      ...existing,
      status: "failed",
      response: error,
      completedAt: Date.now(),
      lockedUntil: undefined,
    };

    await this.storage.set(key, updated);
  }

  /**
   * Execute function with idempotency
   */
  async execute<T>(
    key: string,
    requestData: unknown,
    fn: () => Promise<T>
  ): Promise<T> {
    // Check existing
    const { canProceed, existingResponse } = await this.check(key, requestData);

    if (!canProceed && existingResponse !== undefined) {
      return existingResponse as T;
    }

    // Start processing
    await this.startProcessing(key, requestData);

    try {
      const result = await fn();
      await this.complete(key, result);
      return result;
    } catch (error) {
      await this.fail(key, error);
      throw error;
    }
  }

  /**
   * Delete a record
   */
  async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  /**
   * Get record
   */
  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.storage.get(key);
  }

  /**
   * Cleanup expired records
   */
  async cleanup(): Promise<number> {
    return this.storage.cleanup();
  }

  /**
   * Destroy manager
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

/**
 * Create idempotency manager
 */
export function createIdempotencyManager(config?: IdempotencyConfig): IdempotencyManager {
  return new IdempotencyManager(config);
}

/**
 * Generate unique idempotency key
 */
export function generateIdempotencyKey(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  const key = `${timestamp}${random}`;
  return prefix ? `${prefix}_${key}` : key;
}

/**
 * Idempotency middleware for Express
 */
export function idempotencyMiddleware(manager: IdempotencyManager) {
  return async (
    req: { headers: Record<string, string | undefined>; body: unknown; method: string },
    res: {
      status: (code: number) => { json: (data: unknown) => void };
      json: (data: unknown) => void;
      setHeader: (name: string, value: string) => void;
    },
    next: () => void
  ) => {
    // Only for mutating methods
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers["idempotency-key"];
    if (!idempotencyKey) {
      return next();
    }

    try {
      const { canProceed, existingResponse } = await manager.check(
        idempotencyKey,
        req.body
      );

      if (!canProceed && existingResponse !== undefined) {
        res.setHeader("Idempotency-Replayed", "true");
        res.json(existingResponse);
        return;
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override to capture response
      res.json = (data: unknown) => {
        manager.complete(idempotencyKey, data).catch(console.error);
        return originalJson(data);
      };

      // Start processing
      await manager.startProcessing(idempotencyKey, req.body);

      next();
    } catch (error) {
      if (error instanceof IdempotencyError) {
        if (error.code === "IN_PROGRESS") {
          res.status(409).json({
            error: "CONFLICT",
            message: "Request is currently being processed",
          });
          return;
        }
        if (error.code === "KEY_MISMATCH") {
          res.status(422).json({
            error: "UNPROCESSABLE",
            message: "Idempotency key already used with different request",
          });
          return;
        }
      }
      throw error;
    }
  };
}
