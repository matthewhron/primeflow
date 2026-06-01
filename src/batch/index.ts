/**
 * Batch Payments Module
 * Process multiple payments efficiently
 */

import type { PaymentIntent, RefundIntent } from "../types/intent.js";
import type { PaymentResult, RefundResult } from "../types/payment.js";
import type { PrimeFlow } from "../client.js";

export interface BatchPaymentItem {
  /** Unique ID for this batch item */
  id: string;
  /** Payment intent */
  intent: PaymentIntent;
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Force specific region */
  forceRegion?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface BatchRefundItem {
  id: string;
  refundIntent: RefundIntent;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface BatchItemResult<T> {
  id: string;
  status: "succeeded" | "failed" | "skipped";
  result?: T;
  error?: {
    code: string;
    message: string;
  };
  durationMs: number;
  attempts: number;
}

export interface BatchResult<T> {
  batchId: string;
  totalItems: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: BatchItemResult<T>[];
  totalDurationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface BatchConfig {
  /** Max concurrent operations */
  concurrency?: number;
  /** Continue on failure */
  continueOnError?: boolean;
  /** Max retries per item */
  maxRetries?: number;
  /** Delay between items in ms */
  delayMs?: number;
  /** Timeout per item in ms */
  timeoutMs?: number;
  /** Callback on item completion */
  onItemComplete?: (item: BatchItemResult<unknown>) => void;
  /** Callback on progress */
  onProgress?: (completed: number, total: number) => void;
  /** Stop condition */
  stopCondition?: (results: BatchItemResult<unknown>[]) => boolean;
}

/**
 * Batch payment processor
 */
export class BatchProcessor {
  private client: PrimeFlow;
  private config: Required<BatchConfig>;

  constructor(client: PrimeFlow, config?: BatchConfig) {
    this.client = client;
    this.config = {
      concurrency: config?.concurrency ?? 5,
      continueOnError: config?.continueOnError ?? true,
      maxRetries: config?.maxRetries ?? 2,
      delayMs: config?.delayMs ?? 0,
      timeoutMs: config?.timeoutMs ?? 30000,
      onItemComplete: config?.onItemComplete ?? (() => {}),
      onProgress: config?.onProgress ?? (() => {}),
      stopCondition: config?.stopCondition ?? (() => false),
    };
  }

  /**
   * Process batch payments
   */
  async processPayments(items: BatchPaymentItem[]): Promise<BatchResult<PaymentResult>> {
    const batchId = this.generateBatchId();
    const startTime = Date.now();
    const results: BatchItemResult<PaymentResult>[] = [];

    // Sort by priority
    const sorted = [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    // Process in chunks
    for (let i = 0; i < sorted.length; i += this.config.concurrency) {
      const chunk = sorted.slice(i, i + this.config.concurrency);
      
      const chunkResults = await Promise.all(
        chunk.map((item) => this.processPaymentItem(item))
      );

      results.push(...chunkResults);

      // Progress callback
      this.config.onProgress(results.length, items.length);

      // Check stop condition
      if (this.config.stopCondition(results)) {
        // Mark remaining as skipped
        const remaining = sorted.slice(i + this.config.concurrency);
        for (const item of remaining) {
          results.push({
            id: item.id,
            status: "skipped",
            durationMs: 0,
            attempts: 0,
          });
        }
        break;
      }

      // Delay between chunks
      if (this.config.delayMs > 0 && i + this.config.concurrency < sorted.length) {
        await this.sleep(this.config.delayMs);
      }
    }

    return {
      batchId,
      totalItems: items.length,
      succeeded: results.filter((r) => r.status === "succeeded").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      results,
      totalDurationMs: Date.now() - startTime,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Process batch refunds
   */
  async processRefunds(items: BatchRefundItem[]): Promise<BatchResult<RefundResult>> {
    const batchId = this.generateBatchId();
    const startTime = Date.now();
    const results: BatchItemResult<RefundResult>[] = [];

    const sorted = [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (let i = 0; i < sorted.length; i += this.config.concurrency) {
      const chunk = sorted.slice(i, i + this.config.concurrency);
      
      const chunkResults = await Promise.all(
        chunk.map((item) => this.processRefundItem(item))
      );

      results.push(...chunkResults);
      this.config.onProgress(results.length, items.length);

      if (this.config.stopCondition(results)) {
        const remaining = sorted.slice(i + this.config.concurrency);
        for (const item of remaining) {
          results.push({
            id: item.id,
            status: "skipped",
            durationMs: 0,
            attempts: 0,
          });
        }
        break;
      }

      if (this.config.delayMs > 0 && i + this.config.concurrency < sorted.length) {
        await this.sleep(this.config.delayMs);
      }
    }

    return {
      batchId,
      totalItems: items.length,
      succeeded: results.filter((r) => r.status === "succeeded").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      results,
      totalDurationMs: Date.now() - startTime,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Process single payment item
   */
  private async processPaymentItem(
    item: BatchPaymentItem
  ): Promise<BatchItemResult<PaymentResult>> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: { code: string; message: string } | undefined;

    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        const result = await this.withTimeout(
          this.client.pay(item.intent, {
            forceRegion: item.forceRegion,
          }),
          this.config.timeoutMs
        );

        const itemResult: BatchItemResult<PaymentResult> = {
          id: item.id,
          status: "succeeded",
          result,
          durationMs: Date.now() - startTime,
          attempts,
        };

        this.config.onItemComplete(itemResult);
        return itemResult;
      } catch (error) {
        lastError = {
          code: (error as { code?: string }).code ?? "UNKNOWN",
          message: error instanceof Error ? error.message : "Unknown error",
        };

        if (attempts > this.config.maxRetries || !this.config.continueOnError) {
          break;
        }

        // Exponential backoff
        await this.sleep(Math.pow(2, attempts) * 100);
      }
    }

    const itemResult: BatchItemResult<PaymentResult> = {
      id: item.id,
      status: "failed",
      error: lastError,
      durationMs: Date.now() - startTime,
      attempts,
    };

    this.config.onItemComplete(itemResult);
    return itemResult;
  }

  /**
   * Process single refund item
   */
  private async processRefundItem(
    item: BatchRefundItem
  ): Promise<BatchItemResult<RefundResult>> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: { code: string; message: string } | undefined;

    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        const result = await this.withTimeout(
          this.client.refund(item.refundIntent),
          this.config.timeoutMs
        );

        const itemResult: BatchItemResult<RefundResult> = {
          id: item.id,
          status: "succeeded",
          result,
          durationMs: Date.now() - startTime,
          attempts,
        };

        this.config.onItemComplete(itemResult);
        return itemResult;
      } catch (error) {
        lastError = {
          code: (error as { code?: string }).code ?? "UNKNOWN",
          message: error instanceof Error ? error.message : "Unknown error",
        };

        if (attempts > this.config.maxRetries || !this.config.continueOnError) {
          break;
        }

        await this.sleep(Math.pow(2, attempts) * 100);
      }
    }

    const itemResult: BatchItemResult<RefundResult> = {
      id: item.id,
      status: "failed",
      error: lastError,
      durationMs: Date.now() - startTime,
      attempts,
    };

    this.config.onItemComplete(itemResult);
    return itemResult;
  }

  /**
   * Run with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Batch item timeout")), ms)
      ),
    ]);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Batch builder for fluent API
 */
export class BatchBuilder {
  private items: BatchPaymentItem[] = [];
  private refundItems: BatchRefundItem[] = [];
  private config: BatchConfig = {};

  /**
   * Add payment to batch
   */
  addPayment(intent: PaymentIntent, options?: Omit<BatchPaymentItem, "id" | "intent">): this {
    this.items.push({
      id: `pay_${this.items.length}_${Date.now()}`,
      intent,
      ...options,
    });
    return this;
  }

  /**
   * Add refund to batch
   */
  addRefund(refundIntent: RefundIntent, options?: Omit<BatchRefundItem, "id" | "refundIntent">): this {
    this.refundItems.push({
      id: `ref_${this.refundItems.length}_${Date.now()}`,
      refundIntent,
      ...options,
    });
    return this;
  }

  /**
   * Set concurrency
   */
  concurrency(n: number): this {
    this.config.concurrency = n;
    return this;
  }

  /**
   * Set to stop on first error
   */
  stopOnError(): this {
    this.config.continueOnError = false;
    return this;
  }

  /**
   * Set max retries per item
   */
  retries(n: number): this {
    this.config.maxRetries = n;
    return this;
  }

  /**
   * Set delay between items
   */
  delay(ms: number): this {
    this.config.delayMs = ms;
    return this;
  }

  /**
   * Set timeout per item
   */
  timeout(ms: number): this {
    this.config.timeoutMs = ms;
    return this;
  }

  /**
   * Set progress callback
   */
  onProgress(fn: (completed: number, total: number) => void): this {
    this.config.onProgress = fn;
    return this;
  }

  /**
   * Execute the batch
   */
  async execute(client: PrimeFlow): Promise<BatchResult<PaymentResult>> {
    const processor = new BatchProcessor(client, this.config);
    return processor.processPayments(this.items);
  }

  /**
   * Execute refunds
   */
  async executeRefunds(client: PrimeFlow): Promise<BatchResult<RefundResult>> {
    const processor = new BatchProcessor(client, this.config);
    return processor.processRefunds(this.refundItems);
  }

  /**
   * Get items count
   */
  size(): number {
    return this.items.length + this.refundItems.length;
  }

  /**
   * Clear the batch
   */
  clear(): this {
    this.items = [];
    this.refundItems = [];
    return this;
  }
}

/**
 * Create batch processor
 */
export function createBatchProcessor(
  client: PrimeFlow,
  config?: BatchConfig
): BatchProcessor {
  return new BatchProcessor(client, config);
}

/**
 * Create batch builder
 */
export function createBatch(): BatchBuilder {
  return new BatchBuilder();
}

/**
 * Utility: Split array into chunks
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
