/**
 * Region scoring logic
 */

import type { RegionQuote } from "../types/quote.js";
import type { RoutingWeights } from "../types/config.js";

export interface ScoringResult {
  /** Scored and sorted quotes */
  quotes: RegionQuote[];
  /** Best quote (lowest score) */
  best: RegionQuote | null;
  /** Scoring metadata */
  meta: ScoringMeta;
}

export interface ScoringMeta {
  /** Number of quotes scored */
  totalQuotes: number;
  /** Weights used for scoring */
  weightsUsed: RoutingWeights;
  /** Normalization ranges */
  ranges: {
    cost: { min: number; max: number };
    successRate: { min: number; max: number };
    latency: { min: number; max: number };
  };
}

const DEFAULT_WEIGHTS: RoutingWeights = {
  price: 0.7,
  success: 0.25,
  latency: 0.05,
};

/**
 * Score and rank quotes
 * Lower score = better
 */
export function scoreQuotes(
  quotes: RegionQuote[],
  weights: RoutingWeights = DEFAULT_WEIGHTS
): ScoringResult {
  if (quotes.length === 0) {
    return {
      quotes: [],
      best: null,
      meta: {
        totalQuotes: 0,
        weightsUsed: weights,
        ranges: {
          cost: { min: 0, max: 0 },
          successRate: { min: 0, max: 0 },
          latency: { min: 0, max: 0 },
        },
      },
    };
  }

  // Calculate ranges for normalization
  const costs = quotes.map((q) => q.totalCost);
  const successRates = quotes.map((q) => q.successRate ?? 0.9);
  const latencies = quotes.map((q) => q.latencyMs ?? 100);

  const ranges = {
    cost: { min: Math.min(...costs), max: Math.max(...costs) },
    successRate: { min: Math.min(...successRates), max: Math.max(...successRates) },
    latency: { min: Math.min(...latencies), max: Math.max(...latencies) },
  };

  // Score each quote
  const scoredQuotes = quotes.map((quote) => {
    const score = calculateScore(quote, weights, ranges);
    const reasons = generateReasons(quote, score, weights);

    return {
      ...quote,
      score,
      reasons,
    };
  });

  // Sort by score (ascending - lower is better)
  scoredQuotes.sort((a, b) => a.score - b.score);

  return {
    quotes: scoredQuotes,
    best: scoredQuotes[0] ?? null,
    meta: {
      totalQuotes: quotes.length,
      weightsUsed: weights,
      ranges,
    },
  };
}

/**
 * Calculate score for a single quote
 */
function calculateScore(
  quote: RegionQuote,
  weights: RoutingWeights,
  ranges: ScoringMeta["ranges"]
): number {
  // Normalize values to 0-1 range
  const normalizedCost = normalize(quote.totalCost, ranges.cost.min, ranges.cost.max);
  
  // For success rate, higher is better, so we invert
  const successRate = quote.successRate ?? 0.9;
  const normalizedSuccessInverted = 1 - normalize(
    successRate,
    ranges.successRate.min,
    ranges.successRate.max
  );

  // Normalize latency (lower is better)
  const latency = quote.latencyMs ?? 100;
  const normalizedLatency = normalize(latency, ranges.latency.min, ranges.latency.max);

  // Calculate weighted score
  let score = 
    weights.price * normalizedCost +
    weights.success * normalizedSuccessInverted +
    weights.latency * normalizedLatency;

  // Apply penalties
  score += calculatePenalties(quote);

  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate additional penalties
 */
function calculatePenalties(quote: RegionQuote): number {
  let penalty = 0;

  // Penalty for being close to limits
  if (quote.limits.remainingDaily !== undefined) {
    const limitRatio = 1 - (quote.limits.remainingDaily / quote.limits.max);
    if (limitRatio > 0.8) {
      penalty += 0.1 * (limitRatio - 0.8) * 5; // Scale up penalty near limit
    }
  }

  // Penalty for low success rate
  if (quote.successRate !== undefined && quote.successRate < 0.8) {
    penalty += (0.8 - quote.successRate) * 0.2;
  }

  // Penalty for high latency
  if (quote.latencyMs !== undefined && quote.latencyMs > 500) {
    penalty += 0.05;
  }

  return penalty;
}

/**
 * Normalize value to 0-1 range
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return (value - min) / (max - min);
}

/**
 * Generate human-readable reasons for the score
 */
function generateReasons(
  quote: RegionQuote,
  score: number,
  weights: RoutingWeights
): string[] {
  const reasons: string[] = [];

  // Cost reasoning
  if (weights.price > 0.5) {
    reasons.push(`Cost: ${quote.totalCost.toFixed(2)} (weight: ${weights.price})`);
  }

  // Success rate reasoning
  if (quote.successRate !== undefined) {
    const successPct = (quote.successRate * 100).toFixed(1);
    reasons.push(`Success rate: ${successPct}%`);
    
    if (quote.successRate < 0.85) {
      reasons.push("⚠️ Below average success rate");
    }
  }

  // Latency reasoning
  if (quote.latencyMs !== undefined) {
    reasons.push(`Latency: ${quote.latencyMs}ms`);
    
    if (quote.latencyMs > 500) {
      reasons.push("⚠️ Higher than average latency");
    }
  }

  // Limit warnings
  if (quote.limits.remainingDaily !== undefined) {
    const remainingPct = (quote.limits.remainingDaily / quote.limits.max * 100).toFixed(0);
    reasons.push(`Daily limit: ${remainingPct}% remaining`);
  }

  // Final score
  reasons.push(`Final score: ${score.toFixed(3)}`);

  return reasons;
}

/**
 * Re-score with custom function
 */
export function customScore(
  quotes: RegionQuote[],
  scoreFn: (quote: RegionQuote) => number
): RegionQuote[] {
  return quotes
    .map((quote) => ({
      ...quote,
      score: scoreFn(quote),
    }))
    .sort((a, b) => a.score - b.score);
}

/**
 * Get score explanation
 */
export function explainScore(quote: RegionQuote): string {
  const parts = [
    `Region: ${quote.region}`,
    `Router: ${quote.routerName ?? quote.routerId}`,
    `Total Cost: ${quote.totalCost.toFixed(2)}`,
    `Score: ${quote.score.toFixed(3)}`,
  ];

  if (quote.successRate !== undefined) {
    parts.push(`Success Rate: ${(quote.successRate * 100).toFixed(1)}%`);
  }

  if (quote.latencyMs !== undefined) {
    parts.push(`Latency: ${quote.latencyMs}ms`);
  }

  parts.push("---");
  parts.push(...quote.reasons);

  return parts.join("\n");
}
