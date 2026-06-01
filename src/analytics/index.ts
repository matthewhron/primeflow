/**
 * Analytics & Metrics Module
 * Track payment performance, success rates, and regional statistics
 */

export interface PaymentMetric {
  intentId: string;
  region: string;
  routerId: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "pending";
  latencyMs: number;
  timestamp: string;
  attempts: number;
  error?: string;
}

export interface RefundMetric {
  refundId: string;
  paymentIntentId: string;
  region: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "pending";
  latencyMs: number;
  timestamp: string;
}

export interface RegionStats {
  region: string;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  successRate: number;
  avgLatencyMs: number;
  totalVolume: number;
  avgAmount: number;
  lastUpdated: string;
}

export interface RouterStats {
  routerId: string;
  region: string;
  totalPayments: number;
  successfulPayments: number;
  successRate: number;
  avgLatencyMs: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface AnalyticsSnapshot {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  overallSuccessRate: number;
  avgLatencyMs: number;
  totalVolume: Record<string, number>;
  regionStats: RegionStats[];
  routerStats: RouterStats[];
  periodStart: string;
  periodEnd: string;
}

export interface AnalyticsConfig {
  /** Max metrics to store in memory */
  maxMetrics?: number;
  /** Auto-aggregate interval in ms */
  aggregateIntervalMs?: number;
  /** Enable detailed logging */
  verbose?: boolean;
  /** Persistence callback */
  onPersist?: (metrics: PaymentMetric[]) => Promise<void>;
}

/**
 * Analytics collector for payment metrics
 */
export class Analytics {
  private paymentMetrics: PaymentMetric[] = [];
  private refundMetrics: RefundMetric[] = [];
  private config: Required<AnalyticsConfig>;
  private aggregateTimer?: ReturnType<typeof setInterval>;
  private regionCache = new Map<string, RegionStats>();
  private routerCache = new Map<string, RouterStats>();

  constructor(config: AnalyticsConfig = {}) {
    this.config = {
      maxMetrics: config.maxMetrics ?? 10000,
      aggregateIntervalMs: config.aggregateIntervalMs ?? 60000,
      verbose: config.verbose ?? false,
      onPersist: config.onPersist ?? (async () => {}),
    };

    if (this.config.aggregateIntervalMs > 0) {
      this.startAggregation();
    }
  }

  /**
   * Record a payment metric
   */
  recordPayment(metric: PaymentMetric): void {
    this.paymentMetrics.push({
      ...metric,
      timestamp: metric.timestamp || new Date().toISOString(),
    });

    // Trim if over limit
    if (this.paymentMetrics.length > this.config.maxMetrics) {
      const toRemove = this.paymentMetrics.length - this.config.maxMetrics;
      this.paymentMetrics.splice(0, toRemove);
    }

    // Invalidate caches
    this.regionCache.delete(metric.region);
    this.routerCache.delete(metric.routerId);
  }

  /**
   * Record a refund metric
   */
  recordRefund(metric: RefundMetric): void {
    this.refundMetrics.push({
      ...metric,
      timestamp: metric.timestamp || new Date().toISOString(),
    });

    if (this.refundMetrics.length > this.config.maxMetrics) {
      const toRemove = this.refundMetrics.length - this.config.maxMetrics;
      this.refundMetrics.splice(0, toRemove);
    }
  }

  /**
   * Get overall analytics snapshot
   */
  getSnapshot(periodMs?: number): AnalyticsSnapshot {
    const now = Date.now();
    const cutoff = periodMs ? now - periodMs : 0;
    
    const filtered = this.paymentMetrics.filter(
      (m) => new Date(m.timestamp).getTime() >= cutoff
    );

    const successful = filtered.filter((m) => m.status === "succeeded");
    const failed = filtered.filter((m) => m.status === "failed");
    const pending = filtered.filter((m) => m.status === "pending");

    // Calculate volumes by currency
    const volumes: Record<string, number> = {};
    for (const m of successful) {
      volumes[m.currency] = (volumes[m.currency] || 0) + m.amount;
    }

    // Calculate latencies
    const latencies = filtered.map((m) => m.latencyMs);
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    return {
      totalPayments: filtered.length,
      successfulPayments: successful.length,
      failedPayments: failed.length,
      pendingPayments: pending.length,
      overallSuccessRate: filtered.length > 0
        ? (successful.length / filtered.length) * 100
        : 0,
      avgLatencyMs: Math.round(avgLatency),
      totalVolume: volumes,
      regionStats: this.getRegionStats(periodMs),
      routerStats: this.getRouterStats(periodMs),
      periodStart: cutoff ? new Date(cutoff).toISOString() : "all-time",
      periodEnd: new Date(now).toISOString(),
    };
  }

  /**
   * Get stats per region
   */
  getRegionStats(periodMs?: number): RegionStats[] {
    const now = Date.now();
    const cutoff = periodMs ? now - periodMs : 0;
    
    const filtered = this.paymentMetrics.filter(
      (m) => new Date(m.timestamp).getTime() >= cutoff
    );

    // Group by region
    const byRegion = new Map<string, PaymentMetric[]>();
    for (const m of filtered) {
      const arr = byRegion.get(m.region) || [];
      arr.push(m);
      byRegion.set(m.region, arr);
    }

    const stats: RegionStats[] = [];
    for (const [region, metrics] of byRegion) {
      const successful = metrics.filter((m) => m.status === "succeeded");
      const failed = metrics.filter((m) => m.status === "failed");
      const latencies = metrics.map((m) => m.latencyMs);
      const amounts = successful.map((m) => m.amount);

      stats.push({
        region,
        totalPayments: metrics.length,
        successfulPayments: successful.length,
        failedPayments: failed.length,
        successRate: metrics.length > 0
          ? (successful.length / metrics.length) * 100
          : 0,
        avgLatencyMs: latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : 0,
        totalVolume: amounts.reduce((a, b) => a + b, 0),
        avgAmount: amounts.length > 0
          ? amounts.reduce((a, b) => a + b, 0) / amounts.length
          : 0,
        lastUpdated: new Date().toISOString(),
      });
    }

    return stats.sort((a, b) => b.totalPayments - a.totalPayments);
  }

  /**
   * Get stats per router
   */
  getRouterStats(periodMs?: number): RouterStats[] {
    const now = Date.now();
    const cutoff = periodMs ? now - periodMs : 0;
    
    const filtered = this.paymentMetrics.filter(
      (m) => new Date(m.timestamp).getTime() >= cutoff
    );

    // Group by router
    const byRouter = new Map<string, PaymentMetric[]>();
    for (const m of filtered) {
      const arr = byRouter.get(m.routerId) || [];
      arr.push(m);
      byRouter.set(m.routerId, arr);
    }

    const stats: RouterStats[] = [];
    for (const [routerId, metrics] of byRouter) {
      const successful = metrics.filter((m) => m.status === "succeeded");
      const latencies = metrics.map((m) => m.latencyMs);

      stats.push({
        routerId,
        region: metrics[0]?.region || "unknown",
        totalPayments: metrics.length,
        successfulPayments: successful.length,
        successRate: metrics.length > 0
          ? (successful.length / metrics.length) * 100
          : 0,
        avgLatencyMs: latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : 0,
      });
    }

    return stats.sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Get time series data for charting
   */
  getTimeSeries(
    metric: "payments" | "success_rate" | "latency" | "volume",
    intervalMs: number = 3600000, // 1 hour default
    periodMs?: number
  ): TimeSeriesPoint[] {
    const now = Date.now();
    const cutoff = periodMs ? now - periodMs : now - 86400000 * 7; // 7 days default
    
    const filtered = this.paymentMetrics.filter(
      (m) => new Date(m.timestamp).getTime() >= cutoff
    );

    // Create buckets
    const buckets = new Map<number, PaymentMetric[]>();
    for (const m of filtered) {
      const ts = new Date(m.timestamp).getTime();
      const bucket = Math.floor(ts / intervalMs) * intervalMs;
      const arr = buckets.get(bucket) || [];
      arr.push(m);
      buckets.set(bucket, arr);
    }

    // Calculate values per bucket
    const points: TimeSeriesPoint[] = [];
    const sortedBuckets = Array.from(buckets.keys()).sort();

    for (const bucket of sortedBuckets) {
      const metrics = buckets.get(bucket)!;
      let value: number;

      switch (metric) {
        case "payments":
          value = metrics.length;
          break;
        case "success_rate":
          const successful = metrics.filter((m) => m.status === "succeeded");
          value = metrics.length > 0 ? (successful.length / metrics.length) * 100 : 0;
          break;
        case "latency":
          const latencies = metrics.map((m) => m.latencyMs);
          value = latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0;
          break;
        case "volume":
          value = metrics
            .filter((m) => m.status === "succeeded")
            .reduce((sum, m) => sum + m.amount, 0);
          break;
      }

      points.push({
        timestamp: new Date(bucket).toISOString(),
        value: Math.round(value * 100) / 100,
      });
    }

    return points;
  }

  /**
   * Get error breakdown
   */
  getErrorBreakdown(periodMs?: number): Record<string, number> {
    const now = Date.now();
    const cutoff = periodMs ? now - periodMs : 0;
    
    const failed = this.paymentMetrics.filter(
      (m) =>
        m.status === "failed" &&
        new Date(m.timestamp).getTime() >= cutoff
    );

    const errors: Record<string, number> = {};
    for (const m of failed) {
      const error = m.error || "UNKNOWN";
      errors[error] = (errors[error] || 0) + 1;
    }

    return errors;
  }

  /**
   * Get best performing regions
   */
  getBestRegions(limit: number = 5): RegionStats[] {
    return this.getRegionStats()
      .filter((r) => r.totalPayments >= 10) // Min sample size
      .sort((a, b) => {
        // Score: 70% success rate, 30% inverse latency
        const scoreA = a.successRate * 0.7 + (1000 / (a.avgLatencyMs || 1000)) * 30;
        const scoreB = b.successRate * 0.7 + (1000 / (b.avgLatencyMs || 1000)) * 30;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * Export metrics for persistence
   */
  exportMetrics(): { payments: PaymentMetric[]; refunds: RefundMetric[] } {
    return {
      payments: [...this.paymentMetrics],
      refunds: [...this.refundMetrics],
    };
  }

  /**
   * Import metrics from persistence
   */
  importMetrics(data: { payments: PaymentMetric[]; refunds: RefundMetric[] }): void {
    this.paymentMetrics = [...data.payments];
    this.refundMetrics = [...data.refunds];
    this.regionCache.clear();
    this.routerCache.clear();
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.paymentMetrics = [];
    this.refundMetrics = [];
    this.regionCache.clear();
    this.routerCache.clear();
  }

  /**
   * Start auto-aggregation
   */
  private startAggregation(): void {
    this.aggregateTimer = setInterval(async () => {
      try {
        await this.config.onPersist(this.paymentMetrics);
      } catch (error) {
        if (this.config.verbose) {
          console.error("[Analytics] Persist failed:", error);
        }
      }
    }, this.config.aggregateIntervalMs);
  }

  /**
   * Stop aggregation and cleanup
   */
  destroy(): void {
    if (this.aggregateTimer) {
      clearInterval(this.aggregateTimer);
    }
  }
}

/**
 * Create analytics instance
 */
export function createAnalytics(config?: AnalyticsConfig): Analytics {
  return new Analytics(config);
}
