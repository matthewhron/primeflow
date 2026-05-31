/**
 * Routing strategy implementations
 */

import type { RegionQuote, RouteDecision, QuoteResult } from "../types/quote.js";
import type { PaymentIntent } from "../types/intent.js";
import type { RoutingConfig, RoutingStrategy } from "../types/config.js";
import { scoreQuotes, customScore } from "./scorer.js";

/**
 * Strategy function type
 */
export type StrategyFn = (
  quotes: RegionQuote[],
  intent: PaymentIntent,
  config: RoutingConfig
) => RegionQuote[];

/**
 * Built-in strategies
 */
const strategies: Record<Exclude<RoutingStrategy, "custom">, StrategyFn> = {
  /**
   * Cheapest: Minimize total cost
   */
  cheapest: (quotes) => {
    return scoreQuotes(quotes, { price: 1.0, success: 0, latency: 0 }).quotes;
  },

  /**
   * Highest Success: Maximize success rate
   */
  highest_success: (quotes) => {
    return scoreQuotes(quotes, { price: 0, success: 1.0, latency: 0 }).quotes;
  },

  /**
   * Balanced: Use weighted scoring
   */
  balanced: (quotes, _intent, config) => {
    const weights = config.weights ?? { price: 0.7, success: 0.25, latency: 0.05 };
    return scoreQuotes(quotes, weights).quotes;
  },
};

/**
 * Apply routing strategy to quotes
 */
export function applyStrategy(
  quotes: RegionQuote[],
  intent: PaymentIntent,
  config: RoutingConfig
): RegionQuote[] {
  const strategy = config.strategy ?? "balanced";

  if (strategy === "custom") {
    if (config.customScorer) {
      const weights = config.weights ?? { price: 0.7, success: 0.25, latency: 0.05 };
      return config.customScorer(quotes, weights);
    }
    // No custom scorer provided → fallback to balanced
    return strategies.balanced(quotes, intent, config);
  }

  const strategyFn = strategies[strategy];
  if (!strategyFn) {
    // Fallback to balanced
    return strategies.balanced(quotes, intent, config);
  }

  return strategyFn(quotes, intent, config);
}

/**
 * Make route decision from quotes
 */
export function makeRouteDecision(
  quoteResult: QuoteResult,
  intent: PaymentIntent,
  config: RoutingConfig
): RouteDecision | null {
  // Handle pinned mode
  if (config.mode === "pinned" && config.pinnedRegion) {
    const pinnedQuote = quoteResult.quotes.find(
      (q) => q.region === config.pinnedRegion && q.available
    );

    if (pinnedQuote) {
      return {
        intentId: intent.id,
        chosenRegion: pinnedQuote.region,
        chosenRouterId: pinnedQuote.routerId,
        alternatives: quoteResult.quotes.filter((q) => q.region !== pinnedQuote.region),
        reasonSummary: `Pinned to region ${config.pinnedRegion}`,
        quoteResult,
        strategy: "pinned",
        decidedAt: new Date().toISOString(),
      };
    }
  }

  // Filter available quotes
  const availableQuotes = quoteResult.quotes.filter((q) => q.available);
  
  if (availableQuotes.length === 0) {
    return null;
  }

  // Apply strategy
  const rankedQuotes = applyStrategy(availableQuotes, intent, config);
  const best = rankedQuotes[0];

  if (!best) {
    return null;
  }

  // Generate reason summary
  const reasonSummary = generateDecisionSummary(best, rankedQuotes, config);

  return {
    intentId: intent.id,
    chosenRegion: best.region,
    chosenRouterId: best.routerId,
    alternatives: rankedQuotes.slice(1),
    reasonSummary,
    quoteResult,
    strategy: config.strategy ?? "balanced",
    decidedAt: new Date().toISOString(),
  };
}

/**
 * Generate human-readable decision summary
 */
function generateDecisionSummary(
  chosen: RegionQuote,
  alternatives: RegionQuote[],
  config: RoutingConfig
): string {
  const parts: string[] = [];

  parts.push(`Selected ${chosen.region} (${chosen.routerName ?? chosen.routerId})`);
  parts.push(`Cost: ${chosen.totalCost.toFixed(2)}`);

  if (chosen.successRate !== undefined) {
    parts.push(`Success rate: ${(chosen.successRate * 100).toFixed(1)}%`);
  }

  if (alternatives.length > 0) {
    parts.push(`${alternatives.length} alternatives available`);
  }

  const strategy = config.strategy ?? "balanced";
  parts.push(`Strategy: ${strategy}`);

  return parts.join(" | ");
}

/**
 * Get next fallback region
 */
export function getNextFallback(
  decision: RouteDecision,
  failedRegions: Set<string>
): RegionQuote | null {
  for (const alternative of decision.alternatives) {
    if (!failedRegions.has(alternative.region) && alternative.available) {
      return alternative;
    }
  }
  return null;
}

/**
 * Create custom strategy from scoring function
 */
export function createCustomStrategy(
  scoreFn: (quote: RegionQuote, intent: PaymentIntent) => number
): StrategyFn {
  return (quotes, intent, _config) => {
    return customScore(quotes, (quote) => scoreFn(quote, intent));
  };
}

/**
 * Combine multiple strategies with weights
 */
export function combineStrategies(
  strategyWeights: Array<{ strategy: RoutingStrategy; weight: number }>
): StrategyFn {
  return (quotes, intent, config) => {
    // Score with each strategy
    const scoresByStrategy: Map<string, Map<string, number>> = new Map();

    for (const { strategy, weight } of strategyWeights) {
      if (strategy === "custom") continue;
      
      const strategyFn = strategies[strategy];
      const scored = strategyFn(quotes, intent, config);
      
      const scores = new Map<string, number>();
      scored.forEach((q, index) => {
        // Lower index = better = lower score
        scores.set(`${q.region}:${q.routerId}`, (index / scored.length) * weight);
      });
      
      scoresByStrategy.set(strategy, scores);
    }

    // Combine scores
    return quotes
      .map((quote) => {
        const key = `${quote.region}:${quote.routerId}`;
        let combinedScore = 0;

        for (const [, scores] of scoresByStrategy) {
          combinedScore += scores.get(key) ?? 1;
        }

        return { ...quote, score: combinedScore };
      })
      .sort((a, b) => a.score - b.score);
  };
}
