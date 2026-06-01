/**
 * Reporting & Reconciliation Module
 * Generate reports and reconcile payments
 */

import type { PaymentResult, RefundResult } from "../types/payment.js";

export interface PaymentRecord {
  intentId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "pending" | "refunded";
  region: string;
  routerId: string;
  createdAt: string;
  completedAt?: string;
  fees?: {
    processing: number;
    platform: number;
    total: number;
  };
  refunds?: RefundRecord[];
  metadata?: Record<string, unknown>;
}

export interface RefundRecord {
  refundId: string;
  paymentIntentId: string;
  amount: number;
  status: "succeeded" | "failed" | "pending";
  createdAt: string;
  completedAt?: string;
}

export interface DailyReport {
  date: string;
  payments: {
    count: number;
    succeeded: number;
    failed: number;
    pending: number;
  };
  volume: Record<string, number>;
  fees: Record<string, number>;
  refunds: {
    count: number;
    amount: Record<string, number>;
  };
  byRegion: Record<string, {
    count: number;
    volume: number;
    successRate: number;
  }>;
  byRouter: Record<string, {
    count: number;
    volume: number;
    successRate: number;
  }>;
}

export interface ReconciliationResult {
  date: string;
  status: "matched" | "discrepancy";
  internal: {
    payments: number;
    volume: Record<string, number>;
  };
  external: {
    payments: number;
    volume: Record<string, number>;
  };
  discrepancies: Discrepancy[];
  matchRate: number;
}

export interface Discrepancy {
  type: "missing_internal" | "missing_external" | "amount_mismatch" | "status_mismatch";
  paymentId: string;
  internal?: PaymentRecord;
  external?: ExternalPaymentRecord;
  details: string;
}

export interface ExternalPaymentRecord {
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  timestamp: string;
}

export interface ReportingConfig {
  /** Custom record transformer */
  transformRecord?: (record: PaymentRecord) => PaymentRecord;
  /** Date format */
  dateFormat?: string;
  /** Timezone */
  timezone?: string;
}

/**
 * In-memory payment store for reporting
 */
class PaymentStore {
  private payments = new Map<string, PaymentRecord>();
  private byDate = new Map<string, Set<string>>();

  add(record: PaymentRecord): void {
    this.payments.set(record.intentId, record);
    
    const date = record.createdAt.split("T")[0]!;
    if (!this.byDate.has(date)) {
      this.byDate.set(date, new Set());
    }
    this.byDate.get(date)!.add(record.intentId);
  }

  get(intentId: string): PaymentRecord | undefined {
    return this.payments.get(intentId);
  }

  getByDate(date: string): PaymentRecord[] {
    const ids = this.byDate.get(date);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.payments.get(id))
      .filter((p): p is PaymentRecord => p !== undefined);
  }

  getDateRange(startDate: string, endDate: string): PaymentRecord[] {
    const records: PaymentRecord[] = [];
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    for (const record of this.payments.values()) {
      const ts = new Date(record.createdAt).getTime();
      if (ts >= start && ts <= end) {
        records.push(record);
      }
    }

    return records;
  }

  all(): PaymentRecord[] {
    return Array.from(this.payments.values());
  }

  clear(): void {
    this.payments.clear();
    this.byDate.clear();
  }
}

/**
 * Reporting manager
 */
export class ReportingManager {
  private store = new PaymentStore();
  private config: Required<ReportingConfig>;

  constructor(config?: ReportingConfig) {
    this.config = {
      transformRecord: config?.transformRecord ?? ((r) => r),
      dateFormat: config?.dateFormat ?? "YYYY-MM-DD",
      timezone: config?.timezone ?? "UTC",
    };
  }

  /**
   * Record a payment
   */
  recordPayment(result: PaymentResult, intent: { 
    id: string; 
    amount: number; 
    currency: string;
    metadata?: Record<string, unknown>;
  }): void {
    const record: PaymentRecord = {
      intentId: intent.id,
      paymentId: result.providerPaymentId,
      amount: intent.amount,
      currency: intent.currency,
      status: result.status === "succeeded" ? "succeeded" :
              result.status === "pending" ? "pending" : "failed",
      region: result.regionUsed,
      routerId: result.routerId,
      createdAt: new Date().toISOString(),
      completedAt: result.status === "succeeded" ? new Date().toISOString() : undefined,
      fees: {
        processing: result.costApplied,
        platform: 0,
        total: result.costApplied,
      },
      metadata: intent.metadata,
    };

    this.store.add(this.config.transformRecord(record));
  }

  /**
   * Record a refund
   */
  recordRefund(result: RefundResult, paymentIntentId: string): void {
    const payment = this.store.get(paymentIntentId);
    if (!payment) return;

    const refund: RefundRecord = {
      refundId: result.refundId,
      paymentIntentId,
      amount: result.amount,
      status: result.status === "succeeded" ? "succeeded" :
              result.status === "pending" ? "pending" : "failed",
      createdAt: new Date().toISOString(),
      completedAt: result.status === "succeeded" ? new Date().toISOString() : undefined,
    };

    payment.refunds = payment.refunds || [];
    payment.refunds.push(refund);

    if (result.status === "succeeded") {
      payment.status = "refunded";
    }
  }

  /**
   * Generate daily report
   */
  generateDailyReport(date: string): DailyReport {
    const records = this.store.getByDate(date);

    // Initialize report
    const report: DailyReport = {
      date,
      payments: {
        count: records.length,
        succeeded: 0,
        failed: 0,
        pending: 0,
      },
      volume: {},
      fees: {},
      refunds: {
        count: 0,
        amount: {},
      },
      byRegion: {},
      byRouter: {},
    };

    // Process records
    for (const record of records) {
      // Count by status
      if (record.status === "succeeded" || record.status === "refunded") {
        report.payments.succeeded++;
      } else if (record.status === "failed") {
        report.payments.failed++;
      } else {
        report.payments.pending++;
      }

      // Volume by currency
      if (record.status === "succeeded" || record.status === "refunded") {
        report.volume[record.currency] = 
          (report.volume[record.currency] || 0) + record.amount;
      }

      // Fees
      if (record.fees) {
        report.fees[record.currency] = 
          (report.fees[record.currency] || 0) + record.fees.total;
      }

      // Refunds
      if (record.refunds) {
        for (const refund of record.refunds) {
          if (refund.status === "succeeded") {
            report.refunds.count++;
            report.refunds.amount[record.currency] = 
              (report.refunds.amount[record.currency] || 0) + refund.amount;
          }
        }
      }

      // By region
      const regionStats =
        report.byRegion[record.region] ??
        (report.byRegion[record.region] = { count: 0, volume: 0, successRate: 0 });
      regionStats.count++;
      if (record.status === "succeeded" || record.status === "refunded") {
        regionStats.volume += record.amount;
      }

      // By router
      const routerStats =
        report.byRouter[record.routerId] ??
        (report.byRouter[record.routerId] = { count: 0, volume: 0, successRate: 0 });
      routerStats.count++;
      if (record.status === "succeeded" || record.status === "refunded") {
        routerStats.volume += record.amount;
      }
    }

    // Calculate success rates
    for (const region in report.byRegion) {
      const stats = report.byRegion[region]!;
      const succeeded = records.filter(
        (r) => r.region === region && (r.status === "succeeded" || r.status === "refunded")
      ).length;
      stats.successRate = stats.count > 0 ? (succeeded / stats.count) * 100 : 0;
    }

    for (const router in report.byRouter) {
      const stats = report.byRouter[router]!;
      const succeeded = records.filter(
        (r) => r.routerId === router && (r.status === "succeeded" || r.status === "refunded")
      ).length;
      stats.successRate = stats.count > 0 ? (succeeded / stats.count) * 100 : 0;
    }

    return report;
  }

  /**
   * Generate report for date range
   */
  generateRangeReport(startDate: string, endDate: string): DailyReport[] {
    const reports: DailyReport[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split("T")[0]!;
      reports.push(this.generateDailyReport(date));
    }

    return reports;
  }

  /**
   * Reconcile with external data
   */
  reconcile(
    date: string,
    externalRecords: ExternalPaymentRecord[]
  ): ReconciliationResult {
    const internalRecords = this.store.getByDate(date);
    const discrepancies: Discrepancy[] = [];

    // Create maps for comparison
    const internalMap = new Map(internalRecords.map((r) => [r.paymentId, r]));
    const externalMap = new Map(externalRecords.map((r) => [r.paymentId, r]));

    // Check for missing in external
    for (const [paymentId, internal] of internalMap) {
      if (!externalMap.has(paymentId)) {
        discrepancies.push({
          type: "missing_external",
          paymentId,
          internal,
          details: `Payment ${paymentId} exists internally but not in external records`,
        });
        continue;
      }

      const external = externalMap.get(paymentId)!;

      // Check amount match
      if (internal.amount !== external.amount) {
        discrepancies.push({
          type: "amount_mismatch",
          paymentId,
          internal,
          external,
          details: `Amount mismatch: internal=${internal.amount}, external=${external.amount}`,
        });
      }

      // Check status match (simplified)
      const internalSuccess = internal.status === "succeeded" || internal.status === "refunded";
      const externalSuccess = external.status === "succeeded" || external.status === "completed";
      if (internalSuccess !== externalSuccess) {
        discrepancies.push({
          type: "status_mismatch",
          paymentId,
          internal,
          external,
          details: `Status mismatch: internal=${internal.status}, external=${external.status}`,
        });
      }
    }

    // Check for missing in internal
    for (const [paymentId, external] of externalMap) {
      if (!internalMap.has(paymentId)) {
        discrepancies.push({
          type: "missing_internal",
          paymentId,
          external,
          details: `Payment ${paymentId} exists in external records but not internally`,
        });
      }
    }

    // Calculate volumes
    const internalVolume: Record<string, number> = {};
    const externalVolume: Record<string, number> = {};

    for (const r of internalRecords) {
      if (r.status === "succeeded" || r.status === "refunded") {
        internalVolume[r.currency] = (internalVolume[r.currency] || 0) + r.amount;
      }
    }

    for (const r of externalRecords) {
      if (r.status === "succeeded" || r.status === "completed") {
        externalVolume[r.currency] = (externalVolume[r.currency] || 0) + r.amount;
      }
    }

    const total = internalRecords.length + externalRecords.length;
    const matched = total - discrepancies.length * 2;

    return {
      date,
      status: discrepancies.length === 0 ? "matched" : "discrepancy",
      internal: {
        payments: internalRecords.length,
        volume: internalVolume,
      },
      external: {
        payments: externalRecords.length,
        volume: externalVolume,
      },
      discrepancies,
      matchRate: total > 0 ? (matched / total) * 100 : 100,
    };
  }

  /**
   * Export records to CSV format
   */
  exportToCSV(startDate: string, endDate: string): string {
    const records = this.store.getDateRange(startDate, endDate);
    
    const headers = [
      "intentId",
      "paymentId",
      "amount",
      "currency",
      "status",
      "region",
      "routerId",
      "createdAt",
      "completedAt",
      "processingFee",
      "platformFee",
      "totalFee",
    ];

    const rows = records.map((r) => [
      r.intentId,
      r.paymentId,
      r.amount.toString(),
      r.currency,
      r.status,
      r.region,
      r.routerId,
      r.createdAt,
      r.completedAt || "",
      r.fees?.processing.toString() || "",
      r.fees?.platform.toString() || "",
      r.fees?.total.toString() || "",
    ]);

    return [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
  }

  /**
   * Get payment by ID
   */
  getPayment(intentId: string): PaymentRecord | undefined {
    return this.store.get(intentId);
  }

  /**
   * Get all payments
   */
  getAllPayments(): PaymentRecord[] {
    return this.store.all();
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Create reporting manager
 */
export function createReportingManager(config?: ReportingConfig): ReportingManager {
  return new ReportingManager(config);
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });
  return formatter.format(amount);
}

/**
 * Calculate summary statistics
 */
export function calculateSummary(reports: DailyReport[]): {
  totalPayments: number;
  totalVolume: Record<string, number>;
  totalFees: Record<string, number>;
  totalRefunds: number;
  avgSuccessRate: number;
  bestRegion: string | null;
  worstRegion: string | null;
} {
  let totalPayments = 0;
  const totalVolume: Record<string, number> = {};
  const totalFees: Record<string, number> = {};
  let totalRefunds = 0;
  let successSum = 0;
  
  const regionStats: Record<string, { success: number; total: number }> = {};

  for (const report of reports) {
    totalPayments += report.payments.count;
    totalRefunds += report.refunds.count;
    successSum += report.payments.succeeded;

    for (const [currency, amount] of Object.entries(report.volume)) {
      totalVolume[currency] = (totalVolume[currency] || 0) + amount;
    }

    for (const [currency, amount] of Object.entries(report.fees)) {
      totalFees[currency] = (totalFees[currency] || 0) + amount;
    }

    for (const [region, stats] of Object.entries(report.byRegion)) {
      const rs = regionStats[region] ?? (regionStats[region] = { success: 0, total: 0 });
      rs.total += stats.count;
      rs.success += Math.round((stats.count * stats.successRate) / 100);
    }
  }

  // Find best/worst regions
  let bestRegion: string | null = null;
  let worstRegion: string | null = null;
  let bestRate = -1;
  let worstRate = 101;

  for (const [region, stats] of Object.entries(regionStats)) {
    if (stats.total < 10) continue; // Min sample size
    const rate = (stats.success / stats.total) * 100;
    if (rate > bestRate) {
      bestRate = rate;
      bestRegion = region;
    }
    if (rate < worstRate) {
      worstRate = rate;
      worstRegion = region;
    }
  }

  return {
    totalPayments,
    totalVolume,
    totalFees,
    totalRefunds,
    avgSuccessRate: totalPayments > 0 ? (successSum / totalPayments) * 100 : 0,
    bestRegion,
    worstRegion,
  };
}
