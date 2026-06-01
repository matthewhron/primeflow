/**
 * Circuit Breaker Module
 * Prevent cascading failures and provide graceful degradation
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeoutMs: number;
  /** Number of successful calls needed to close circuit from half-open */
  successThreshold?: number;
  /** Time window in ms for counting failures */
  rollingWindowMs?: number;
  /** Function to determine if error should count as failure */
  isFailure?: (error: Error) => boolean;
  /** Callback when circuit opens */
  onOpen?: (stats: CircuitStats) => void;
  /** Callback when circuit closes */
  onClose?: (stats: CircuitStats) => void;
  /** Callback when circuit half-opens */
  onHalfOpen?: (stats: CircuitStats) => void;
  /** Fallback function when circuit is open */
  fallback?: <T>() => T | Promise<T>;
  /** Monitor interval for stats */
  monitorIntervalMs?: number;
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  openedAt: number | null;
  totalCalls: number;
  failureRate: number;
}

export interface CircuitCall {
  timestamp: number;
  success: boolean;
  duration: number;
  error?: Error;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private config: Required<CircuitBreakerConfig>;
  private calls: CircuitCall[] = [];
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private openedAt: number | null = null;
  private halfOpenTimer?: ReturnType<typeof setTimeout>;
  private monitorTimer?: ReturnType<typeof setInterval>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: config.failureThreshold,
      resetTimeoutMs: config.resetTimeoutMs,
      successThreshold: config.successThreshold ?? 3,
      rollingWindowMs: config.rollingWindowMs ?? 60000,
      isFailure: config.isFailure ?? (() => true),
      onOpen: config.onOpen ?? (() => {}),
      onClose: config.onClose ?? (() => {}),
      onHalfOpen: config.onHalfOpen ?? (() => {}),
      fallback: config.fallback ?? (() => {
        throw new CircuitOpenError("Circuit is open");
      }),
      monitorIntervalMs: config.monitorIntervalMs ?? 10000,
    };

    // Start monitoring
    if (this.config.monitorIntervalMs > 0) {
      this.startMonitoring();
    }
  }

  /**
   * Execute function through circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === "open") {
      // Check if we should try half-open
      if (this.shouldAttemptReset()) {
        this.transitionTo("half-open");
      } else {
        return this.config.fallback<T>();
      }
    }

    const startTime = Date.now();
    
    try {
      const result = await fn();
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      const isFailure = this.config.isFailure(error as Error);
      
      if (isFailure) {
        this.recordFailure(Date.now() - startTime, error as Error);
      } else {
        // Not counted as failure
        this.recordSuccess(Date.now() - startTime);
      }
      
      throw error;
    }
  }

  /**
   * Execute with fallback value
   */
  async executeWithFallback<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await this.execute(fn);
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return fallback;
      }
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get detailed stats
   */
  getStats(): CircuitStats {
    this.cleanupOldCalls();
    
    const failures = this.calls.filter((c) => !c.success).length;
    const successes = this.calls.filter((c) => c.success).length;
    
    return {
      state: this.state,
      failures,
      successes,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      totalCalls: this.calls.length,
      failureRate: this.calls.length > 0 ? failures / this.calls.length : 0,
    };
  }

  /**
   * Manually trip the circuit
   */
  trip(): void {
    this.transitionTo("open");
  }

  /**
   * Manually reset the circuit
   */
  reset(): void {
    this.transitionTo("closed");
    this.calls = [];
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.openedAt = null;
  }

  /**
   * Check if circuit should allow request
   */
  isAllowed(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "half-open") return true;
    return this.shouldAttemptReset();
  }

  /**
   * Record a success
   */
  private recordSuccess(duration: number): void {
    this.calls.push({
      timestamp: Date.now(),
      success: true,
      duration,
    });
    
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
    
    this.cleanupOldCalls();

    // Check if we should close from half-open
    if (
      this.state === "half-open" &&
      this.consecutiveSuccesses >= this.config.successThreshold
    ) {
      this.transitionTo("closed");
    }
  }

  /**
   * Record a failure
   */
  private recordFailure(duration: number, error?: Error): void {
    this.calls.push({
      timestamp: Date.now(),
      success: false,
      duration,
      error,
    });
    
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();
    
    this.cleanupOldCalls();

    // Check if we should open from half-open or closed
    if (this.state === "half-open") {
      this.transitionTo("open");
    } else if (this.state === "closed") {
      const failures = this.calls.filter((c) => !c.success).length;
      if (failures >= this.config.failureThreshold) {
        this.transitionTo("open");
      }
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    this.state = newState;

    // Clear any pending timer
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
      this.halfOpenTimer = undefined;
    }

    const stats = this.getStats();

    switch (newState) {
      case "open":
        this.openedAt = Date.now();
        this.config.onOpen(stats);
        // Schedule half-open attempt
        this.halfOpenTimer = setTimeout(() => {
          if (this.state === "open") {
            this.transitionTo("half-open");
          }
        }, this.config.resetTimeoutMs);
        break;

      case "half-open":
        this.config.onHalfOpen(stats);
        break;

      case "closed":
        this.openedAt = null;
        this.consecutiveFailures = 0;
        this.config.onClose(stats);
        break;
    }
  }

  /**
   * Check if we should attempt to reset from open
   */
  private shouldAttemptReset(): boolean {
    if (!this.openedAt) return true;
    return Date.now() - this.openedAt >= this.config.resetTimeoutMs;
  }

  /**
   * Cleanup old calls outside rolling window
   */
  private cleanupOldCalls(): void {
    const cutoff = Date.now() - this.config.rollingWindowMs;
    this.calls = this.calls.filter((c) => c.timestamp >= cutoff);
  }

  /**
   * Start monitoring for state transitions
   */
  private startMonitoring(): void {
    this.monitorTimer = setInterval(() => {
      this.cleanupOldCalls();
      
      // Auto-recovery check for half-open
      if (this.state === "open" && this.shouldAttemptReset()) {
        this.transitionTo("half-open");
      }
    }, this.config.monitorIntervalMs);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
    }
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

/**
 * Circuit breaker registry for multiple services
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig?: Partial<CircuitBreakerConfig>) {
    this.defaultConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      ...defaultConfig,
    };
  }

  /**
   * Get or create circuit breaker for a service
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(
        name,
        new CircuitBreaker({
          ...this.defaultConfig,
          ...config,
        })
      );
    }
    return this.breakers.get(name)!;
  }

  /**
   * Execute through named circuit breaker
   */
  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return this.get(name).execute(fn);
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    for (const breaker of this.breakers.values()) {
      breaker.destroy();
    }
    this.breakers.clear();
  }
}

/**
 * Create circuit breaker
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Create circuit breaker registry
 */
export function createCircuitBreakerRegistry(
  defaultConfig?: Partial<CircuitBreakerConfig>
): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry(defaultConfig);
}

/**
 * Decorator for class methods
 */
export function withCircuitBreaker(
  breaker: CircuitBreaker
): MethodDecorator {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return breaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
