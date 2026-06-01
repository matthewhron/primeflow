/**
 * PrimeFlow main client
 */

import type {
  PrimeFlowConfig,
  RoutingConfig,
  ComplianceConfig,
  CacheConfig,
} from "./types/config.js";
import type { PaymentIntent, RefundIntent } from "./types/intent.js";
import type { QuoteResult, QuoteOptions, RouteDecision } from "./types/quote.js";
import type {
  PaymentResult,
  PaymentOptions,
  RefundResult,
  RefundOptions,
  PaymentAttempt,
} from "./types/payment.js";
import type { RegionInfo, WebhookPayload } from "./types/index.js";
import { PrimeFlowException, createError, isRetryableError } from "./types/errors.js";
import { Layer403Client } from "./layer403/client.js";
import { generateIdempotencyKey } from "./layer403/signer.js";
import { Cache, createQuoteCacheKey, createRegionsCacheKey } from "./cache/index.js";
import { filterQuotes } from "./routing/filter.js";
import { scoreQuotes } from "./routing/scorer.js";
import { makeRouteDecision, getNextFallback } from "./routing/strategy.js";
import { Logger, Timer } from "./utils/logger.js";

/**
 * Main PrimeFlow client
 */
export class PrimeFlow {
  private readonly layer403: Layer403Client;
  private readonly routingConfig: RoutingConfig;
  private readonly complianceConfig: ComplianceConfig;
  private readonly cache: Cache<unknown>;
  private readonly logger: Logger;
  private readonly config: PrimeFlowConfig;

  constructor(config: PrimeFlowConfig) {
    this.config = config;
    
    // Initialize Layer-403 client
    this.layer403 = new Layer403Client(config.layer403);

    // Merge with defaults
    this.routingConfig = {
      mode: "auto",
      pinnedRegion: null,
      allowedRegions: [],
      blockedRegions: [],
      weights: { price: 0.7, success: 0.25, latency: 0.05 },
      fallback: { enabled: true, maxTries: 3, backoffMs: 1000 },
      strategy: "balanced",
      ...config.routing,
    };

    this.complianceConfig = {
      enforceAllowedRegions: true,
      sanctionsCheck: false,
      kycRequired: false,
      ...config.compliance,
    };

    const cacheConfig: CacheConfig = {
      ttlMs: 60000,
      maxEntries: 1000,
      ...config.cache,
    };

    this.cache = new Cache(cacheConfig);
    this.logger = new Logger(config.observability);
  }

  /**
   * Get quotes for a payment intent
   */
  async quote(intent: PaymentIntent, options?: QuoteOptions): Promise<QuoteResult> {
    const timer = new Timer();
    this.logger.event("quote.started", { intentId: intent.id });

    try {
      // Check cache unless forced
      if (!options?.force) {
        const cacheKey = createQuoteCacheKey(
          intent.id,
          intent.amount,
          intent.currency,
          intent.paymentMethod
        );
        const cached = this.cache.get(cacheKey) as QuoteResult | undefined;
        
        if (cached) {
          this.logger.debug("Quote cache hit", { intentId: intent.id });
          return { ...cached, fromCache: true };
        }
      }

      // Fetch quotes from Layer-403
      const rawQuotes = await this.layer403.getQuotes({
        intent,
        regions: options?.regions,
        includeUnavailable: options?.includeUnavailable,
      });

      // Filter quotes
      const { passed, filtered } = filterQuotes(
        rawQuotes,
        intent,
        this.routingConfig,
        this.complianceConfig
      );

      // Score and rank
      const scoringResult = scoreQuotes(passed, this.routingConfig.weights);

      // Build result
      const result: QuoteResult = {
        intentId: intent.id,
        quotes: options?.includeUnavailable
          ? [...scoringResult.quotes, ...filtered.map((f) => f.quote)]
          : scoringResult.quotes,
        best: scoringResult.best,
        generatedAt: new Date().toISOString(),
        durationMs: timer.elapsed(),
        fromCache: false,
        warnings: filtered.length > 0
          ? [`${filtered.length} regions filtered out`]
          : undefined,
      };

      // Cache result
      if (!options?.force) {
        const cacheKey = createQuoteCacheKey(
          intent.id,
          intent.amount,
          intent.currency,
          intent.paymentMethod
        );
        this.cache.set(cacheKey, result);
      }

      this.logger.event("quote.completed", {
        intentId: intent.id,
        quotesCount: result.quotes.length,
        bestRegion: result.best?.region,
      }, { intentId: intent.id, durationMs: timer.elapsed() });

      return result;
    } catch (error) {
      this.logger.event("quote.failed", { intentId: intent.id }, {
        intentId: intent.id,
        error,
        durationMs: timer.elapsed(),
      });
      throw error;
    }
  }

  /**
   * Decide best route without executing payment
   */
  async decideRoute(intent: PaymentIntent, options?: QuoteOptions): Promise<RouteDecision> {
    const quoteResult = await this.quote(intent, options);

    if (this.routingConfig.mode === "dry-run") {
      this.logger.info("Dry-run mode - returning decision without execution", {
        intentId: intent.id,
      });
    }

    const decision = makeRouteDecision(quoteResult, intent, this.routingConfig);

    if (!decision) {
      throw new PrimeFlowException(
        createError(
          "NO_AVAILABLE_REGIONS",
          "No available regions found for this payment",
          { intentId: intent.id }
        )
      );
    }

    this.logger.event("route.chosen", {
      intentId: intent.id,
      region: decision.chosenRegion,
      routerId: decision.chosenRouterId,
    }, { intentId: intent.id, region: decision.chosenRegion });

    return decision;
  }

  /**
   * Execute payment with automatic routing
   */
  async pay(intent: PaymentIntent, options?: PaymentOptions): Promise<PaymentResult> {
    const timer = new Timer();
    const idempotencyKey = options?.idempotencyKey ?? generateIdempotencyKey();
    const attempts: PaymentAttempt[] = [];
    const failedRegions = new Set<string>();

    this.logger.event("payment.started", { intentId: intent.id });

    // Dry-run mode check
    if (this.routingConfig.mode === "dry-run") {
      const decision = await this.decideRoute(intent);
      throw new PrimeFlowException(
        createError(
          "INTERNAL_ERROR",
          "Dry-run mode enabled - payment not executed",
          { decision }
        )
      );
    }

    // Get route decision
    let decision = await this.decideRoute(intent);
    let currentRegion = options?.forceRegion ?? decision.chosenRegion;
    let currentRouterId = decision.chosenRouterId;

    // Override if force region
    if (options?.forceRegion) {
      const forcedQuote = decision.quoteResult.quotes.find(
        (q) => q.region === options.forceRegion
      );
      if (forcedQuote) {
        currentRouterId = forcedQuote.routerId;
      }
    }

    const maxAttempts = options?.noFallback ? 1 : (this.routingConfig.fallback?.maxTries ?? 3);

    // Attempt payment with fallback
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptTimer = new Timer();

      try {
        this.logger.event("payment.attempt", {
          intentId: intent.id,
          attempt,
          region: currentRegion,
          routerId: currentRouterId,
        }, { intentId: intent.id, region: currentRegion });

        const result = await this.layer403.executePayment({
          intent,
          region: currentRegion,
          routerId: currentRouterId,
          idempotencyKey: `${idempotencyKey}-${attempt}`,
        });

        // Record successful attempt
        attempts.push({
          attemptNumber: attempt,
          region: currentRegion,
          routerId: currentRouterId,
          status: "succeeded",
          timestamp: new Date().toISOString(),
          durationMs: attemptTimer.elapsed(),
        });

        this.logger.event("payment.completed", {
          intentId: intent.id,
          region: currentRegion,
          status: result.status,
        }, { intentId: intent.id, region: currentRegion, durationMs: timer.elapsed() });

        return {
          ...result,
          attempts,
          idempotencyKey,
        };
      } catch (error) {
        const primeFlowError = error instanceof PrimeFlowException ? error.toJSON() : null;

        // Record failed attempt
        attempts.push({
          attemptNumber: attempt,
          region: currentRegion,
          routerId: currentRouterId,
          status: "failed",
          error: primeFlowError ?? undefined,
          timestamp: new Date().toISOString(),
          durationMs: attemptTimer.elapsed(),
        });

        failedRegions.add(currentRegion);

        // Check if retryable
        if (!primeFlowError || !isRetryableError(primeFlowError)) {
          this.logger.event("payment.failed", {
            intentId: intent.id,
            region: currentRegion,
            error: primeFlowError?.code,
            retryable: false,
          }, { intentId: intent.id, region: currentRegion, error });

          throw error;
        }

        // Try fallback
        if (attempt < maxAttempts && this.routingConfig.fallback?.enabled) {
          const fallback = getNextFallback(decision, failedRegions);
          
          if (fallback) {
            this.logger.event("payment.fallback", {
              intentId: intent.id,
              fromRegion: currentRegion,
              toRegion: fallback.region,
              attempt: attempt + 1,
            }, { intentId: intent.id, region: fallback.region });

            currentRegion = fallback.region;
            currentRouterId = fallback.routerId;

            // Backoff
            if (this.routingConfig.fallback?.backoffMs) {
              await this.sleep(this.routingConfig.fallback.backoffMs * attempt);
            }

            continue;
          }
        }

        // No more fallbacks
        this.logger.event("payment.failed", {
          intentId: intent.id,
          region: currentRegion,
          error: primeFlowError?.code,
          attempts: attempts.length,
        }, { intentId: intent.id, region: currentRegion, error, durationMs: timer.elapsed() });

        throw error;
      }
    }

    // Should not reach here
    throw new PrimeFlowException(
      createError(
        "INTERNAL_ERROR",
        "Payment failed after all attempts",
        { attempts }
      )
    );
  }

  /**
   * Process refund
   */
  async refund(refundIntent: RefundIntent, options?: RefundOptions): Promise<RefundResult> {
    const timer = new Timer();
    const idempotencyKey = options?.idempotencyKey ?? generateIdempotencyKey();

    this.logger.event("refund.started", {
      paymentIntentId: refundIntent.paymentIntentId,
    });

    try {
      // We need to know which region the original payment was in
      // This should be stored/tracked by the merchant
      // For now, we'll use the first available region
      const regions = await this.listRegions();
      const region = regions[0]?.code;

      if (!region) {
        throw new PrimeFlowException(
          createError("NO_AVAILABLE_REGIONS", "No regions available for refund")
        );
      }

      const result = await this.layer403.executeRefund({
        refundIntent,
        region,
        idempotencyKey,
      });

      this.logger.event("refund.completed", {
        paymentIntentId: refundIntent.paymentIntentId,
        refundId: result.refundId,
        status: result.status,
      }, { durationMs: timer.elapsed() });

      return result;
    } catch (error) {
      this.logger.event("refund.failed", {
        paymentIntentId: refundIntent.paymentIntentId,
      }, { error, durationMs: timer.elapsed() });

      throw error;
    }
  }

  /**
   * List available regions
   */
  async listRegions(): Promise<RegionInfo[]> {
    const cacheKey = createRegionsCacheKey();
    
    return this.cache.getOrSet(
      cacheKey,
      () => this.layer403.getRegions(),
      this.config.cache?.ttlMs ?? 60000
    ) as Promise<RegionInfo[]>;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string | WebhookPayload, signature: string, timestamp?: string): boolean {
    const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);
    const ts = timestamp ?? new Date().toISOString();
    
    return this.layer403.verifyWebhook(payloadString, signature, ts);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.stats();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create PrimeFlow client
 */
export function createClient(config: PrimeFlowConfig): PrimeFlow {
  return new PrimeFlow(config);
}
