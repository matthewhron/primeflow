/**
 * Quote and region pricing types
 */

export interface FeeBreakdown {
  /** Percentage-based fee */
  percentFee: number;
  /** Fixed fee in target currency */
  fixedFee: number;
  /** Foreign exchange fee if currency conversion needed */
  fxFee: number;
  /** Network/interchange fee */
  networkFee?: number;
  /** Cross-border fee */
  crossBorderFee?: number;
}

export interface RegionLimits {
  /** Minimum transaction amount */
  min: number;
  /** Maximum transaction amount */
  max: number;
  /** Remaining daily limit */
  remainingDaily?: number;
  /** Remaining monthly limit */
  remainingMonthly?: number;
  /** Single transaction limit */
  perTransaction?: number;
}

export interface RegionQuote {
  /** Region code (EU, UK, SG, BR, etc.) */
  region: string;
  /** Router/PSP identifier */
  routerId: string;
  /** Router display name */
  routerName?: string;
  /** Total cost in intent currency */
  totalCost: number;
  /** Detailed fee breakdown */
  feeBreakdown: FeeBreakdown;
  /** Region limits */
  limits: RegionLimits;
  /** Historical success rate (0-1) */
  successRate?: number;
  /** Average latency in milliseconds */
  latencyMs?: number;
  /** Calculated score (lower = better) */
  score: number;
  /** Human-readable reasons for this score */
  reasons: string[];
  /** Whether this region is available for the intent */
  available: boolean;
  /** Unavailability reason if not available */
  unavailableReason?: string;
  /** Supported payment methods */
  supportedMethods?: string[];
  /** Currency used by this region */
  regionCurrency?: string;
  /** FX rate applied (if any) */
  fxRate?: number;
  /** Quote timestamp */
  quotedAt?: string;
  /** Quote validity TTL in seconds */
  validForSec?: number;
}

export interface QuoteResult {
  /** Original intent ID */
  intentId: string;
  /** All region quotes */
  quotes: RegionQuote[];
  /** Best available quote */
  best: RegionQuote | null;
  /** Quote generation timestamp */
  generatedAt: string;
  /** Time taken to generate quotes in ms */
  durationMs: number;
  /** Cached or fresh data */
  fromCache: boolean;
  /** Any warnings during quote generation */
  warnings?: string[];
}

export interface QuoteOptions {
  /** Force refresh, bypass cache */
  force?: boolean;
  /** Include unavailable regions in response */
  includeUnavailable?: boolean;
  /** Limit number of quotes returned */
  limit?: number;
  /** Filter by specific regions */
  regions?: string[];
  /** Custom timeout for this request */
  timeoutMs?: number;
}

export interface RouteDecision {
  /** Original intent ID */
  intentId: string;
  /** Chosen region code */
  chosenRegion: string;
  /** Chosen router/PSP ID */
  chosenRouterId: string;
  /** Alternative options considered */
  alternatives: RegionQuote[];
  /** Human-readable summary of decision */
  reasonSummary: string;
  /** Full quote result */
  quoteResult: QuoteResult;
  /** Strategy used for decision */
  strategy: string;
  /** Timestamp of decision */
  decidedAt: string;
}

/**
 * Calculate total cost from fee breakdown
 */
export function calculateTotalCost(amount: number, fees: FeeBreakdown): number {
  const percentCost = amount * (fees.percentFee / 100);
  const fixedCost = fees.fixedFee;
  const fxCost = fees.fxFee;
  const networkCost = fees.networkFee ?? 0;
  const crossBorderCost = fees.crossBorderFee ?? 0;
  
  return percentCost + fixedCost + fxCost + networkCost + crossBorderCost;
}

/**
 * Format cost as human-readable string
 */
export function formatCost(cost: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}
