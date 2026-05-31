/**
 * Region filtering logic
 */

import type { PaymentIntent } from "../types/intent.js";
import type { RegionQuote } from "../types/quote.js";
import type { RoutingConfig, ComplianceConfig } from "../types/config.js";

export interface FilterResult {
  /** Quotes that passed filtering */
  passed: RegionQuote[];
  /** Quotes that were filtered out */
  filtered: FilteredQuote[];
}

export interface FilteredQuote {
  quote: RegionQuote;
  reason: FilterReason;
  details?: string;
}

export type FilterReason =
  | "region_not_allowed"
  | "region_blocked"
  | "amount_below_min"
  | "amount_above_max"
  | "daily_limit_exceeded"
  | "method_not_supported"
  | "region_unavailable"
  | "compliance_blocked"
  | "currency_not_supported";

/**
 * Filter quotes based on routing config and intent
 */
export function filterQuotes(
  quotes: RegionQuote[],
  intent: PaymentIntent,
  routingConfig?: RoutingConfig,
  complianceConfig?: ComplianceConfig
): FilterResult {
  const passed: RegionQuote[] = [];
  const filtered: FilteredQuote[] = [];

  for (const quote of quotes) {
    const filterResult = checkQuote(quote, intent, routingConfig, complianceConfig);
    
    if (filterResult === null) {
      passed.push(quote);
    } else {
      filtered.push(filterResult);
    }
  }

  return { passed, filtered };
}

/**
 * Check single quote against filters
 * Returns null if passed, or FilteredQuote if filtered
 */
function checkQuote(
  quote: RegionQuote,
  intent: PaymentIntent,
  routingConfig?: RoutingConfig,
  complianceConfig?: ComplianceConfig
): FilteredQuote | null {
  // Check if region is available
  if (!quote.available) {
    return {
      quote,
      reason: "region_unavailable",
      details: quote.unavailableReason,
    };
  }

  // Check allowlist
  if (routingConfig?.allowedRegions && routingConfig.allowedRegions.length > 0) {
    if (!routingConfig.allowedRegions.includes(quote.region)) {
      return {
        quote,
        reason: "region_not_allowed",
        details: `Region ${quote.region} not in allowed list`,
      };
    }
  }

  // Check blocklist
  if (routingConfig?.blockedRegions && routingConfig.blockedRegions.length > 0) {
    if (routingConfig.blockedRegions.includes(quote.region)) {
      return {
        quote,
        reason: "region_blocked",
        details: `Region ${quote.region} is blocked`,
      };
    }
  }

  // Check amount limits
  if (intent.amount < quote.limits.min) {
    return {
      quote,
      reason: "amount_below_min",
      details: `Amount ${intent.amount} below minimum ${quote.limits.min}`,
    };
  }

  if (intent.amount > quote.limits.max) {
    return {
      quote,
      reason: "amount_above_max",
      details: `Amount ${intent.amount} above maximum ${quote.limits.max}`,
    };
  }

  // Check daily limit
  if (
    quote.limits.remainingDaily !== undefined &&
    intent.amount > quote.limits.remainingDaily
  ) {
    return {
      quote,
      reason: "daily_limit_exceeded",
      details: `Amount ${intent.amount} exceeds daily limit ${quote.limits.remainingDaily}`,
    };
  }

  // Check payment method support
  if (quote.supportedMethods && quote.supportedMethods.length > 0) {
    if (!quote.supportedMethods.includes(intent.paymentMethod)) {
      return {
        quote,
        reason: "method_not_supported",
        details: `Method ${intent.paymentMethod} not supported in ${quote.region}`,
      };
    }
  }

  // Compliance checks
  if (complianceConfig?.enforceAllowedRegions) {
    // Additional compliance logic could go here
  }

  return null;
}

/**
 * Check if a specific region is allowed
 */
export function isRegionAllowed(
  region: string,
  routingConfig?: RoutingConfig
): boolean {
  if (!routingConfig) {
    return true;
  }

  // Check blocklist first
  if (routingConfig.blockedRegions?.includes(region)) {
    return false;
  }

  // Check allowlist
  if (routingConfig.allowedRegions && routingConfig.allowedRegions.length > 0) {
    return routingConfig.allowedRegions.includes(region);
  }

  return true;
}

/**
 * Get filter reason description
 */
export function getFilterReasonDescription(reason: FilterReason): string {
  const descriptions: Record<FilterReason, string> = {
    region_not_allowed: "Region is not in the allowed list",
    region_blocked: "Region is in the blocked list",
    amount_below_min: "Transaction amount is below the minimum limit",
    amount_above_max: "Transaction amount is above the maximum limit",
    daily_limit_exceeded: "Daily transaction limit would be exceeded",
    method_not_supported: "Payment method is not supported in this region",
    region_unavailable: "Region is currently unavailable",
    compliance_blocked: "Blocked by compliance rules",
    currency_not_supported: "Currency is not supported in this region",
  };

  return descriptions[reason] ?? "Unknown filter reason";
}
