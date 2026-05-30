/**
 * Payment result types
 */

import type { PrimeFlowError } from "./errors.js";

export type PaymentStatus = 
  | "succeeded" 
  | "failed" 
  | "pending" 
  | "requires_action"
  | "processing"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export interface PaymentResult {
  /** Original intent ID */
  intentId: string;
  /** Payment status */
  status: PaymentStatus;
  /** Region used for payment */
  regionUsed: string;
  /** Router/PSP used */
  routerId: string;
  /** Provider's payment ID */
  providerPaymentId: string;
  /** Actual cost applied */
  costApplied: number;
  /** Amount charged */
  amountCharged: number;
  /** Currency charged */
  currencyCharged: string;
  /** Timestamp of payment */
  processedAt: string;
  /** Raw provider response (if enabled) */
  raw?: unknown;
  /** Error details if failed */
  error?: PrimeFlowError;
  /** Next action required (3DS, redirect, etc.) */
  nextAction?: PaymentNextAction;
  /** Receipt URL if available */
  receiptUrl?: string;
  /** Authorization code */
  authCode?: string;
  /** Attempts made (including fallbacks) */
  attempts: PaymentAttempt[];
  /** Idempotency key used */
  idempotencyKey: string;
}

export interface PaymentNextAction {
  /** Type of action required */
  type: "redirect" | "three_d_secure" | "display_qr" | "await_webhook";
  /** Redirect URL for browser-based flows */
  redirectUrl?: string;
  /** QR code data for display */
  qrCodeData?: string;
  /** Instructions for user */
  instructions?: string;
  /** Timeout for action in seconds */
  expiresInSec?: number;
}

export interface PaymentAttempt {
  /** Attempt number (1-based) */
  attemptNumber: number;
  /** Region tried */
  region: string;
  /** Router tried */
  routerId: string;
  /** Result of attempt */
  status: "succeeded" | "failed";
  /** Error if failed */
  error?: PrimeFlowError;
  /** Timestamp */
  timestamp: string;
  /** Duration in ms */
  durationMs: number;
}

export interface RefundResult {
  /** Original payment intent ID */
  paymentIntentId: string;
  /** Refund ID from provider */
  refundId: string;
  /** Refund status */
  status: "succeeded" | "pending" | "failed";
  /** Amount refunded */
  amount: number;
  /** Currency */
  currency: string;
  /** Region where refund processed */
  regionUsed: string;
  /** Timestamp */
  processedAt: string;
  /** Error if failed */
  error?: PrimeFlowError;
  /** Raw provider response */
  raw?: unknown;
}

export interface PaymentOptions {
  /** Idempotency key for request deduplication */
  idempotencyKey?: string;
  /** Custom timeout for this payment */
  timeoutMs?: number;
  /** Force specific region (overrides routing) */
  forceRegion?: string;
  /** Skip fallback on failure */
  noFallback?: boolean;
  /** Include raw provider response */
  includeRaw?: boolean;
  /** Custom metadata for this payment */
  metadata?: Record<string, unknown>;
  /** Webhook URL override */
  webhookUrl?: string;
}

export interface RefundOptions {
  /** Idempotency key */
  idempotencyKey?: string;
  /** Custom timeout */
  timeoutMs?: number;
  /** Include raw response */
  includeRaw?: boolean;
}

/**
 * Generate idempotency key
 */
export function generateIdempotencyKey(intentId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${intentId}-${timestamp}-${random}`;
}
