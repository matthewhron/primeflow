/**
 * Type exports
 */

export * from "./config.js";
export * from "./intent.js";
export * from "./quote.js";
export * from "./payment.js";
export * from "./errors.js";

// Region info type (from Layer-403)
export interface RegionInfo {
  /** Region code */
  code: string;
  /** Display name */
  name: string;
  /** Country codes covered */
  countries: string[];
  /** Supported currencies */
  currencies: string[];
  /** Supported payment methods */
  methods: string[];
  /** Whether region is active */
  active: boolean;
  /** Region-specific limits */
  limits: {
    minAmount: number;
    maxAmount: number;
    dailyLimit?: number;
    monthlyLimit?: number;
  };
  /** Base fees for this region */
  baseFees: {
    percentFee: number;
    fixedFee: number;
    currency: string;
  };
  /** Average success rate */
  successRate: number;
  /** Average latency */
  avgLatencyMs: number;
  /** Available routers in this region */
  routers: RouterInfo[];
}

export interface RouterInfo {
  /** Router ID */
  id: string;
  /** Router name */
  name: string;
  /** Provider/PSP name */
  provider: string;
  /** Whether router is active */
  active: boolean;
  /** Router priority (lower = higher priority) */
  priority: number;
  /** Supported methods */
  methods: string[];
  /** Fee structure */
  fees: {
    percentFee: number;
    fixedFee: number;
  };
}

// Webhook types
export interface WebhookPayload {
  /** Event type */
  type: WebhookEventType;
  /** Event ID */
  id: string;
  /** Timestamp */
  timestamp: string;
  /** Event data */
  data: WebhookEventData;
  /** Signature for verification */
  signature: string;
}

export type WebhookEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.pending"
  | "payment.refunded"
  | "refund.succeeded"
  | "refund.failed";

export interface WebhookEventData {
  intentId: string;
  providerPaymentId?: string;
  status: string;
  amount: number;
  currency: string;
  region: string;
  routerId: string;
  error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, unknown>;
}
