/**
 * Health Check Module
 * Monitor system health and dependencies
 */

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs: number;
  lastChecked: string;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  checks: HealthCheckResult[];
  summary: {
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export interface HealthCheckConfig {
  /** Check name */
  name: string;
  /** Check function */
  check: () => Promise<HealthCheckResult | boolean>;
  /** Check interval in ms (0 = manual only) */
  intervalMs?: number;
  /** Timeout for the check in ms */
  timeoutMs?: number;
  /** Whether this check is critical (affects overall status) */
  critical?: boolean;
  /** Number of failures before marking unhealthy */
  failureThreshold?: number;
}

export interface HealthMonitorConfig {
  /** Version string to report */
  version?: string;
  /** Default check interval */
  defaultIntervalMs?: number;
  /** Default timeout */
  defaultTimeoutMs?: number;
  /** Callback on status change */
  onStatusChange?: (status: HealthStatus, health: SystemHealth) => void;
}

/**
 * Health check for a single dependency
 */
class HealthCheck {
  private config: Required<HealthCheckConfig>;
  private lastResult: HealthCheckResult | null = null;
  private consecutiveFailures = 0;
  private timer?: ReturnType<typeof setInterval>;

  constructor(config: HealthCheckConfig, defaults: Partial<HealthCheckConfig>) {
    this.config = {
      name: config.name,
      check: config.check,
      intervalMs: config.intervalMs ?? defaults.intervalMs ?? 30000,
      timeoutMs: config.timeoutMs ?? defaults.timeoutMs ?? 5000,
      critical: config.critical ?? true,
      failureThreshold: config.failureThreshold ?? 3,
    };
  }

  /**
   * Start periodic checks
   */
  start(): void {
    if (this.config.intervalMs > 0 && !this.timer) {
      // Run immediately
      this.runCheck();
      // Then on interval
      this.timer = setInterval(() => this.runCheck(), this.config.intervalMs);
    }
  }

  /**
   * Stop periodic checks
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Run the health check
   */
  async runCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.withTimeout(
        this.config.check(),
        this.config.timeoutMs
      );

      // Handle boolean result
      if (typeof result === "boolean") {
        this.lastResult = {
          name: this.config.name,
          status: result ? "healthy" : "unhealthy",
          latencyMs: Date.now() - startTime,
          lastChecked: new Date().toISOString(),
        };
      } else {
        this.lastResult = {
          ...result,
          latencyMs: Date.now() - startTime,
          lastChecked: new Date().toISOString(),
        };
      }

      // Reset failures on success
      if (this.lastResult.status === "healthy") {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
      }
    } catch (error) {
      this.consecutiveFailures++;
      
      this.lastResult = {
        name: this.config.name,
        status: this.getStatusFromFailures(),
        message: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
      };
    }

    return this.lastResult;
  }

  /**
   * Get last result without running check
   */
  getLastResult(): HealthCheckResult | null {
    return this.lastResult;
  }

  /**
   * Is this check critical?
   */
  isCritical(): boolean {
    return this.config.critical;
  }

  /**
   * Get name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Determine status based on failure count
   */
  private getStatusFromFailures(): HealthStatus {
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      return "unhealthy";
    }
    if (this.consecutiveFailures > 0) {
      return "degraded";
    }
    return "healthy";
  }

  /**
   * Run with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), timeoutMs)
      ),
    ]);
  }
}

/**
 * Health monitor for the entire system
 */
export class HealthMonitor {
  private checks = new Map<string, HealthCheck>();
  private config: Required<HealthMonitorConfig>;
  private startTime = Date.now();
  private lastStatus: HealthStatus = "healthy";

  constructor(config?: HealthMonitorConfig) {
    this.config = {
      version: config?.version ?? "1.0.0",
      defaultIntervalMs: config?.defaultIntervalMs ?? 30000,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 5000,
      onStatusChange: config?.onStatusChange ?? (() => {}),
    };
  }

  /**
   * Register a health check
   */
  register(config: HealthCheckConfig): this {
    const check = new HealthCheck(config, {
      intervalMs: this.config.defaultIntervalMs,
      timeoutMs: this.config.defaultTimeoutMs,
    });
    
    this.checks.set(config.name, check);
    check.start();
    
    return this;
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): boolean {
    const check = this.checks.get(name);
    if (check) {
      check.stop();
      this.checks.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Run all checks and get system health
   */
  async getHealth(forceRefresh: boolean = false): Promise<SystemHealth> {
    const results: HealthCheckResult[] = [];

    for (const check of this.checks.values()) {
      if (forceRefresh) {
        results.push(await check.runCheck());
      } else {
        const lastResult = check.getLastResult();
        if (lastResult) {
          results.push(lastResult);
        } else {
          results.push(await check.runCheck());
        }
      }
    }

    // Calculate summary
    const summary = {
      healthy: results.filter((r) => r.status === "healthy").length,
      degraded: results.filter((r) => r.status === "degraded").length,
      unhealthy: results.filter((r) => r.status === "unhealthy").length,
    };

    // Determine overall status
    let overallStatus: HealthStatus = "healthy";
    
    // Check critical checks first
    for (const check of this.checks.values()) {
      if (check.isCritical()) {
        const result = results.find((r) => r.name === check.getName());
        if (result?.status === "unhealthy") {
          overallStatus = "unhealthy";
          break;
        }
        if (result?.status === "degraded" && overallStatus === "healthy") {
          overallStatus = "degraded";
        }
      }
    }

    // If no critical issues, check non-critical
    if (overallStatus === "healthy" && summary.degraded > 0) {
      overallStatus = "degraded";
    }

    // Notify on status change
    if (overallStatus !== this.lastStatus) {
      const health: SystemHealth = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        version: this.config.version,
        checks: results,
        summary,
      };
      this.config.onStatusChange(overallStatus, health);
      this.lastStatus = overallStatus;
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: this.config.version,
      checks: results,
      summary,
    };
  }

  /**
   * Quick check - just return status
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status === "healthy";
  }

  /**
   * Get readiness (are all critical checks passing?)
   */
  async isReady(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status !== "unhealthy";
  }

  /**
   * Start all checks
   */
  startAll(): void {
    for (const check of this.checks.values()) {
      check.start();
    }
  }

  /**
   * Stop all checks
   */
  stopAll(): void {
    for (const check of this.checks.values()) {
      check.stop();
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAll();
    this.checks.clear();
  }
}

/**
 * Built-in health checks
 */
export const BuiltInChecks = {
  /**
   * Check HTTP endpoint
   */
  http: (name: string, url: string, expectedStatus = 200): HealthCheckConfig => ({
    name,
    check: async () => {
      const response = await fetch(url);
      return {
        name,
        status: response.status === expectedStatus ? "healthy" : "unhealthy",
        message: `HTTP ${response.status}`,
        latencyMs: 0,
        lastChecked: new Date().toISOString(),
        metadata: { url, status: response.status },
      };
    },
  }),

  /**
   * Check memory usage
   */
  memory: (thresholdPercent = 90): HealthCheckConfig => ({
    name: "memory",
    check: async () => {
      if (typeof process !== "undefined" && process.memoryUsage) {
        const usage = process.memoryUsage();
        const usedPercent = (usage.heapUsed / usage.heapTotal) * 100;
        
        return {
          name: "memory",
          status: usedPercent > thresholdPercent ? "degraded" : "healthy",
          message: `${usedPercent.toFixed(1)}% heap used`,
          latencyMs: 0,
          lastChecked: new Date().toISOString(),
          metadata: {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            rss: usage.rss,
          },
        };
      }
      return true;
    },
  }),

  /**
   * Check custom function
   */
  custom: (
    name: string,
    checkFn: () => Promise<boolean>
  ): HealthCheckConfig => ({
    name,
    check: checkFn,
  }),
};

/**
 * Create health monitor
 */
export function createHealthMonitor(config?: HealthMonitorConfig): HealthMonitor {
  return new HealthMonitor(config);
}

/**
 * Express middleware for health endpoint
 */
export function healthMiddleware(monitor: HealthMonitor) {
  return async (
    req: { url: string },
    res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } },
    next: () => void
  ) => {
    if (req.url === "/health" || req.url === "/healthz") {
      const health = await monitor.getHealth();
      const statusCode = health.status === "healthy" ? 200 : 503;
      res.status(statusCode).json(health);
      return;
    }
    
    if (req.url === "/ready" || req.url === "/readyz") {
      const ready = await monitor.isReady();
      const statusCode = ready ? 200 : 503;
      res.status(statusCode).json({ ready });
      return;
    }

    if (req.url === "/live" || req.url === "/livez") {
      res.json({ alive: true, uptime: Date.now() });
      return;
    }

    next();
  };
}
