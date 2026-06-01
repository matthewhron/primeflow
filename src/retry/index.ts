/**
 * Retry Utilities Module
 * Advanced retry strategies and backoff algorithms
 */

export type BackoffStrategy = 
  | "exponential"
  | "linear"
  | "constant"
  | "fibonacci"
  | "decorrelated-jitter";

export interface RetryConfig {
  /** Max retry attempts */
  maxAttempts: number;
  /** Backoff strategy */
  strategy?: BackoffStrategy;
  /** Initial delay in ms */
  initialDelayMs?: number;
  /** Max delay in ms */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff */
  multiplier?: number;
  /** Jitter factor (0-1) */
  jitter?: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error, attempt: number) => boolean;
  /** Callback before each retry */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  /** Timeout per attempt in ms */
  timeoutMs?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
  delays: number[];
}

/**
 * Calculate backoff delay
 */
export function calculateBackoff(
  attempt: number,
  strategy: BackoffStrategy,
  options: {
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
    jitter: number;
  }
): number {
  let delay: number;

  switch (strategy) {
    case "exponential":
      delay = options.initialDelayMs * Math.pow(options.multiplier, attempt - 1);
      break;

    case "linear":
      delay = options.initialDelayMs * attempt;
      break;

    case "constant":
      delay = options.initialDelayMs;
      break;

    case "fibonacci":
      delay = options.initialDelayMs * fibonacci(attempt);
      break;

    case "decorrelated-jitter":
      // AWS-style decorrelated jitter
      const prev = attempt > 1 
        ? options.initialDelayMs * Math.pow(options.multiplier, attempt - 2)
        : options.initialDelayMs;
      delay = Math.random() * (prev * 3 - options.initialDelayMs) + options.initialDelayMs;
      break;

    default:
      delay = options.initialDelayMs;
  }

  // Apply jitter
  if (options.jitter > 0 && strategy !== "decorrelated-jitter") {
    const jitterRange = delay * options.jitter;
    delay = delay - jitterRange + Math.random() * jitterRange * 2;
  }

  // Clamp to max
  return Math.min(Math.max(0, delay), options.maxDelayMs);
}

/**
 * Fibonacci helper
 */
function fibonacci(n: number): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

/**
 * Retry a function with configurable backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<RetryResult<T>> {
  const options = {
    maxAttempts: config.maxAttempts,
    strategy: config.strategy ?? "exponential",
    initialDelayMs: config.initialDelayMs ?? 100,
    maxDelayMs: config.maxDelayMs ?? 30000,
    multiplier: config.multiplier ?? 2,
    jitter: config.jitter ?? 0.1,
    isRetryable: config.isRetryable ?? (() => true),
    onRetry: config.onRetry ?? (() => {}),
    timeoutMs: config.timeoutMs,
  };

  const startTime = Date.now();
  const delays: number[] = [];
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      // Execute with optional timeout
      let result: T;
      if (options.timeoutMs) {
        result = await withTimeout(fn(), options.timeoutMs);
      } else {
        result = await fn();
      }

      return {
        success: true,
        result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
        delays,
      };
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (attempt >= options.maxAttempts || !options.isRetryable(lastError, attempt)) {
        break;
      }

      // Calculate delay
      const delayMs = calculateBackoff(attempt, options.strategy, {
        initialDelayMs: options.initialDelayMs,
        maxDelayMs: options.maxDelayMs,
        multiplier: options.multiplier,
        jitter: options.jitter,
      });

      delays.push(delayMs);

      // Callback before retry
      options.onRetry(lastError, attempt, delayMs);

      // Wait before retry
      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: options.maxAttempts,
    totalTimeMs: Date.now() - startTime,
    delays,
  };
}

/**
 * Retry with timeout wrapper
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timeout")), ms)
    ),
  ]);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry builder for fluent API
 */
export class RetryBuilder<T> {
  private fn: () => Promise<T>;
  private config: RetryConfig = { maxAttempts: 3 };

  constructor(fn: () => Promise<T>) {
    this.fn = fn;
  }

  /**
   * Set max attempts
   */
  attempts(n: number): this {
    this.config.maxAttempts = n;
    return this;
  }

  /**
   * Set backoff strategy
   */
  backoff(strategy: BackoffStrategy): this {
    this.config.strategy = strategy;
    return this;
  }

  /**
   * Set initial delay
   */
  initialDelay(ms: number): this {
    this.config.initialDelayMs = ms;
    return this;
  }

  /**
   * Set max delay
   */
  maxDelay(ms: number): this {
    this.config.maxDelayMs = ms;
    return this;
  }

  /**
   * Set multiplier
   */
  multiplier(n: number): this {
    this.config.multiplier = n;
    return this;
  }

  /**
   * Set jitter
   */
  jitter(factor: number): this {
    this.config.jitter = factor;
    return this;
  }

  /**
   * Set retryable condition
   */
  retryIf(fn: (error: Error, attempt: number) => boolean): this {
    this.config.isRetryable = fn;
    return this;
  }

  /**
   * Set retry callback
   */
  onRetry(fn: (error: Error, attempt: number, delayMs: number) => void): this {
    this.config.onRetry = fn;
    return this;
  }

  /**
   * Set timeout per attempt
   */
  timeout(ms: number): this {
    this.config.timeoutMs = ms;
    return this;
  }

  /**
   * Execute with retry
   */
  async execute(): Promise<RetryResult<T>> {
    return retry(this.fn, this.config);
  }

  /**
   * Execute and throw on failure
   */
  async executeOrThrow(): Promise<T> {
    const result = await this.execute();
    if (!result.success) {
      throw result.error ?? new Error("All retry attempts failed");
    }
    return result.result!;
  }
}

/**
 * Create retry builder
 */
export function retryable<T>(fn: () => Promise<T>): RetryBuilder<T> {
  return new RetryBuilder(fn);
}

/**
 * Retry presets
 */
export const RetryPresets = {
  /**
   * Quick retry for transient errors
   */
  quick: (): RetryConfig => ({
    maxAttempts: 3,
    strategy: "exponential",
    initialDelayMs: 50,
    maxDelayMs: 1000,
    multiplier: 2,
    jitter: 0.1,
  }),

  /**
   * Standard retry with longer delays
   */
  standard: (): RetryConfig => ({
    maxAttempts: 5,
    strategy: "exponential",
    initialDelayMs: 200,
    maxDelayMs: 10000,
    multiplier: 2,
    jitter: 0.25,
  }),

  /**
   * Aggressive retry for critical operations
   */
  aggressive: (): RetryConfig => ({
    maxAttempts: 10,
    strategy: "exponential",
    initialDelayMs: 100,
    maxDelayMs: 60000,
    multiplier: 1.5,
    jitter: 0.2,
  }),

  /**
   * Network retry with jitter
   */
  network: (): RetryConfig => ({
    maxAttempts: 5,
    strategy: "decorrelated-jitter",
    initialDelayMs: 500,
    maxDelayMs: 30000,
    multiplier: 2,
    jitter: 0,
  }),

  /**
   * Payment retry (conservative)
   */
  payment: (): RetryConfig => ({
    maxAttempts: 3,
    strategy: "linear",
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    multiplier: 1,
    jitter: 0,
    isRetryable: (error) => {
      const code = (error as { code?: string }).code;
      return code !== "PAYMENT_DECLINED" && code !== "INSUFFICIENT_FUNDS";
    },
  }),
};

/**
 * Common retryable conditions
 */
export const RetryConditions = {
  /**
   * Retry on network errors
   */
  networkErrors: (error: Error): boolean => {
    const networkCodes = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"];
    const code = (error as { code?: string }).code;
    return !!code && networkCodes.includes(code);
  },

  /**
   * Retry on rate limits (with backoff)
   */
  rateLimits: (error: Error): boolean => {
    const status = (error as { status?: number }).status;
    return status === 429;
  },

  /**
   * Retry on server errors
   */
  serverErrors: (error: Error): boolean => {
    const status = (error as { status?: number }).status;
    return !!status && status >= 500 && status < 600;
  },

  /**
   * Retry on specific error codes
   */
  specificCodes: (codes: string[]) => (error: Error): boolean => {
    const code = (error as { code?: string }).code;
    return !!code && codes.includes(code);
  },

  /**
   * Combine multiple conditions
   */
  any: (...conditions: ((error: Error) => boolean)[]): ((error: Error) => boolean) => {
    return (error: Error) => conditions.some((c) => c(error));
  },

  /**
   * All conditions must match
   */
  all: (...conditions: ((error: Error) => boolean)[]): ((error: Error) => boolean) => {
    return (error: Error) => conditions.every((c) => c(error));
  },
};

/**
 * Retry decorator for class methods
 */
export function withRetry(config: RetryConfig): MethodDecorator {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const result = await retry(() => originalMethod.apply(this, args), config);
      if (!result.success) {
        throw result.error ?? new Error("All retry attempts failed");
      }
      return result.result;
    };

    return descriptor;
  };
}
