

import express, { Request, Response, NextFunction } from "express";
import {
  PrimeFlow,
  createPrimeFlowMiddleware,
  createWebhookVerificationMiddleware,
  createErrorMiddleware,
  PrimeFlowException,
  type PaymentIntent,
  type RefundIntent,
  type QuoteOptions,
  type PaymentOptions,
  type RefundOptions,
  type WebhookPayload,
  type PrimeFlowConfig,
  validatePaymentIntent,
} from "prime-flow";

// Расширяем Request для типизации
declare global {
  namespace Express {
    interface Request {
      primeflow?: {
        idempotencyKey?: string;
        requestId?: string;
      };
    }
  }
}

const app = express();

// ============================================
// Configuration
// ============================================

const config: PrimeFlowConfig = {
  layer403: {
    baseUrl: process.env.LAYER403_URL || "https://403-gateway.example.com",
    apiKey: process.env.PRIMEFLOW_API_KEY!,
    apiSecret: process.env.PRIMEFLOW_API_SECRET!,
    timeoutMs: parseInt(process.env.TIMEOUT_MS || "8000"),
  },
  routing: {
    mode: (process.env.ROUTING_MODE as any) || "auto",
    pinnedRegion: process.env.PINNED_REGION || null,
    allowedRegions: process.env.ALLOWED_REGIONS?.split(",") || [],
    blockedRegions: process.env.BLOCKED_REGIONS?.split(",") || [],
    weights: {
      price: parseFloat(process.env.WEIGHT_PRICE || "0.7"),
      success: parseFloat(process.env.WEIGHT_SUCCESS || "0.25"),
      latency: parseFloat(process.env.WEIGHT_LATENCY || "0.05"),
    },
    strategy: (process.env.STRATEGY as any) || "balanced",
    fallback: {
      enabled: process.env.FALLBACK_ENABLED !== "false",
      maxTries: parseInt(process.env.FALLBACK_MAX_TRIES || "3"),
      backoffMs: parseInt(process.env.FALLBACK_BACKOFF_MS || "1000"),
    },
  },
  cache: {
    ttlMs: parseInt(process.env.CACHE_TTL_MS || "60000"),
    maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || "1000"),
  },
  compliance: {
    enforceAllowedRegions: process.env.ENFORCE_ALLOWED_REGIONS !== "false",
    sanctionsCheck: process.env.SANCTIONS_CHECK === "true",
    kycRequired: process.env.KYC_REQUIRED === "true",
  },
  observability: {
    logLevel: (process.env.LOG_LEVEL as any) || "info",
    onEvent: (event) => {
      console.log(`[PrimeFlow Event] ${event.type}`, JSON.stringify(event.data));
    },
  },
};

// Initialize PrimeFlow client
const primeflow = new PrimeFlow(config);

// ============================================
// Middleware
// ============================================

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key, X-Request-ID");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Parse JSON (except for webhook route)
app.use((req, res, next) => {
  if (req.path === "/api/webhooks") {
    return next();
  }
  express.json()(req, res, next);
});

// PrimeFlow middleware for payment routes
app.use("/api/payments", createPrimeFlowMiddleware({
  idempotencyHeader: "X-Idempotency-Key",
  requestIdHeader: "X-Request-ID",
  autoGenerateIdempotencyKey: true,
}));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// Health & Info Routes
// ============================================

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /api/info
 * Get API and configuration info
 */
app.get("/api/info", (req: Request, res: Response) => {
  res.json({
    version: "1.0.0",
    config: {
      routing: {
        mode: config.routing?.mode,
        strategy: config.routing?.strategy,
        fallbackEnabled: config.routing?.fallback?.enabled,
        maxTries: config.routing?.fallback?.maxTries,
      },
      cache: {
        ttlMs: config.cache?.ttlMs,
        maxEntries: config.cache?.maxEntries,
      },
    },
  });
});

// ============================================
// Quote Routes
// ============================================

/**
 * POST /api/quotes
 * Get payment route quotes without executing payment
 * 
 * Body: PaymentIntent
 * Query params:
 *   - force: boolean - Force fresh quotes (skip cache)
 *   - regions: string - Comma-separated region codes to include
 *   - includeUnavailable: boolean - Include filtered/unavailable regions
 */
app.post("/api/quotes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const intent: PaymentIntent = req.body;
    
    // Validate intent
    const validation = validatePaymentIntent(intent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_INTENT",
          message: "Invalid payment intent",
          details: validation.errors,
        },
      });
    }

    // Options from query params
    const options: QuoteOptions = {
      force: req.query.force === "true",
      regions: req.query.regions ? (req.query.regions as string).split(",") : undefined,
      includeUnavailable: req.query.includeUnavailable === "true",
    };

    const result = await primeflow.quote(intent, options);

    res.json({
      success: true,
      data: {
        intentId: result.intentId,
        quotes: result.quotes.map((q) => ({
          region: q.region,
          routerId: q.routerId,
          routerName: q.routerName,
          totalCost: q.totalCost,
          feeBreakdown: q.feeBreakdown,
          successRate: q.successRate,
          latencyMs: q.latencyMs,
          score: q.score,
          reasons: q.reasons,
          available: q.available,
          unavailableReason: q.unavailableReason,
        })),
        best: result.best ? {
          region: result.best.region,
          routerId: result.best.routerId,
          totalCost: result.best.totalCost,
          reasons: result.best.reasons,
        } : null,
        generatedAt: result.generatedAt,
        durationMs: result.durationMs,
        fromCache: result.fromCache,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/quotes/decide
 * Get routing decision without executing payment
 * 
 * Body: PaymentIntent
 */
app.post("/api/quotes/decide", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const intent: PaymentIntent = req.body;
    
    const validation = validatePaymentIntent(intent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_INTENT",
          message: "Invalid payment intent",
          details: validation.errors,
        },
      });
    }

    const decision = await primeflow.decideRoute(intent);

    res.json({
      success: true,
      data: {
        chosenRegion: decision.chosenRegion,
        chosenRouterId: decision.chosenRouterId,
        chosenRouterName: decision.chosenRouterName,
        expectedCost: decision.expectedCost,
        reasonSummary: decision.reasonSummary,
        alternatives: decision.alternatives.map((alt) => ({
          region: alt.region,
          routerId: alt.routerId,
          totalCost: alt.totalCost,
          reasons: alt.reasons,
        })),
        quoteResult: {
          quotesCount: decision.quoteResult.quotes.length,
          generatedAt: decision.quoteResult.generatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Payment Routes
// ============================================

/**
 * POST /api/payments
 * Execute payment with automatic routing
 * 
 * Body: PaymentIntent
 * Headers:
 *   - X-Idempotency-Key: string (optional, auto-generated if missing)
 * Query params:
 *   - forceRegion: string - Force specific region
 *   - noFallback: boolean - Disable fallback retries
 */
app.post("/api/payments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const intent: PaymentIntent = req.body;
    
    const validation = validatePaymentIntent(intent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_INTENT",
          message: "Invalid payment intent",
          details: validation.errors,
        },
      });
    }

    const options: PaymentOptions = {
      idempotencyKey: req.primeflow?.idempotencyKey,
      forceRegion: req.query.forceRegion as string | undefined,
      noFallback: req.query.noFallback === "true",
    };

    const result = await primeflow.pay(intent, options);

    // Handle different statuses
    if (result.status === "requires_action" && result.nextAction) {
      return res.json({
        success: true,
        status: "requires_action",
        data: {
          paymentId: result.providerPaymentId,
          status: result.status,
          nextAction: result.nextAction,
          regionUsed: result.regionUsed,
          routerUsed: result.routerUsed,
          attempts: result.attempts,
        },
      });
    }

    res.json({
      success: result.status === "succeeded",
      status: result.status,
      data: {
        paymentId: result.providerPaymentId,
        status: result.status,
        regionUsed: result.regionUsed,
        routerUsed: result.routerUsed,
        amountCharged: result.amountCharged,
        currencyCharged: result.currencyCharged,
        costApplied: result.costApplied,
        attempts: result.attempts,
        idempotencyKey: result.idempotencyKey,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/validate
 * Validate payment intent without executing
 * 
 * Body: PaymentIntent
 */
app.post("/api/payments/validate", (req: Request, res: Response) => {
  const intent: PaymentIntent = req.body;
  const validation = validatePaymentIntent(intent);

  res.json({
    success: validation.valid,
    data: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  });
});

// ============================================
// Refund Routes
// ============================================

/**
 * POST /api/refunds
 * Process a refund
 * 
 * Body: RefundIntent
 * Headers:
 *   - X-Idempotency-Key: string (optional, auto-generated if missing)
 */
app.post("/api/refunds", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refundIntent: RefundIntent = req.body;

    if (!refundIntent.paymentIntentId || !refundIntent.providerPaymentId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REFUND_INTENT",
          message: "Missing required fields: paymentIntentId and providerPaymentId",
        },
      });
    }

    const options: RefundOptions = {
      idempotencyKey: req.primeflow?.idempotencyKey,
    };

    const result = await primeflow.refund(refundIntent, options);

    res.json({
      success: result.status === "succeeded",
      status: result.status,
      data: {
        refundId: result.refundId,
        paymentIntentId: result.paymentIntentId,
        providerPaymentId: result.providerPaymentId,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        reason: result.reason,
        regionUsed: result.regionUsed,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/refunds/:paymentId
 * Get refund info (requires integration with your database)
 */
app.get("/api/refunds/:paymentId", async (req: Request, res: Response) => {
  // This would need to query your database
  res.status(501).json({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Refund lookup requires database integration",
    },
  });
});

// ============================================
// Region Routes
// ============================================

/**
 * GET /api/regions
 * List all available regions
 */
app.get("/api/regions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const regions = await primeflow.listRegions();

    res.json({
      success: true,
      data: {
        regions: regions.map((r) => ({
          code: r.code,
          name: r.name,
          countries: r.countries,
          currencies: r.currencies,
          methods: r.methods,
          active: r.active,
          limits: r.limits,
          baseFees: r.baseFees,
          successRate: r.successRate,
          avgLatencyMs: r.avgLatencyMs,
          routers: r.routers.map((router) => ({
            id: router.id,
            name: router.name,
            provider: router.provider,
            active: router.active,
            priority: router.priority,
            methods: router.methods,
            fees: router.fees,
          })),
        })),
        count: regions.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/regions/:code
 * Get specific region details
 */
app.get("/api/regions/:code", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const regions = await primeflow.listRegions();
    const region = regions.find((r) => r.code === req.params.code.toUpperCase());

    if (!region) {
      return res.status(404).json({
        success: false,
        error: {
          code: "REGION_NOT_FOUND",
          message: `Region ${req.params.code} not found`,
        },
      });
    }

    res.json({
      success: true,
      data: region,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Cache Routes
// ============================================

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
app.get("/api/cache/stats", (req: Request, res: Response) => {
  const stats = primeflow.getCacheStats();

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * DELETE /api/cache
 * Clear all cache
 */
app.delete("/api/cache", (req: Request, res: Response) => {
  primeflow.clearCache();

  res.json({
    success: true,
    message: "Cache cleared successfully",
  });
});

// ============================================
// Webhook Routes
// ============================================

/**
 * POST /api/webhooks
 * Handle webhooks from Layer-403
 * 
 * Headers:
 *   - X-PrimeFlow-Signature: string
 *   - X-PrimeFlow-Timestamp: string
 */
app.post(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  createWebhookVerificationMiddleware(
    (payload, signature, timestamp) => primeflow.verifyWebhook(payload, signature, timestamp),
    {
      signatureHeader: "X-PrimeFlow-Signature",
      timestampHeader: "X-PrimeFlow-Timestamp",
      onFailure: (_req, res) => {
        res.status(401).json({
          success: false,
          error: {
            code: "INVALID_SIGNATURE",
            message: "Webhook signature verification failed",
          },
        });
      },
    }
  ),
  async (req: Request, res: Response) => {
    try {
      const event = JSON.parse(req.body.toString()) as WebhookPayload;

      console.log(`[Webhook] Received event: ${event.type}`, {
        id: event.id,
        intentId: event.data.intentId,
      });

      // Handle different event types
      switch (event.type) {
        case "payment.succeeded":
          console.log(`Payment ${event.data.intentId} succeeded via ${event.data.region}`);
          // TODO: Update your database
          break;

        case "payment.failed":
          console.log(`Payment ${event.data.intentId} failed:`, event.data.error);
          // TODO: Update your database
          break;

        case "payment.pending":
          console.log(`Payment ${event.data.intentId} is pending`);
          // TODO: Update your database
          break;

        case "payment.refunded":
          console.log(`Payment ${event.data.intentId} was refunded`);
          // TODO: Update your database
          break;

        case "refund.succeeded":
          console.log(`Refund for ${event.data.intentId} succeeded`);
          // TODO: Update your database
          break;

        case "refund.failed":
          console.log(`Refund for ${event.data.intentId} failed:`, event.data.error);
          // TODO: Update your database
          break;

        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
      }

      // Acknowledge receipt
      res.json({
        success: true,
        received: true,
        eventId: event.id,
      });
    } catch (error) {
      console.error("[Webhook] Error processing webhook:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "WEBHOOK_PROCESSING_ERROR",
          message: "Failed to process webhook",
        },
      });
    }
  }
);

// ============================================
// Error Handling
// ============================================

// PrimeFlow error handler
app.use(createErrorMiddleware());

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Generic error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err);

  if (err instanceof PrimeFlowException) {
    const errorJson = err.toJSON();
    return res.status(errorJson.statusCode || 500).json({
      success: false,
      error: errorJson,
    });
  }

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: err.message || "Internal server error",
    },
  });
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log("🚀 PrimeFlow API Server");
  console.log("=".repeat(60));
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Info:   http://localhost:${PORT}/api/info`);
  console.log("");
  console.log("Endpoints:");
  console.log("  POST   /api/quotes              - Get payment quotes");
  console.log("  POST   /api/quotes/decide       - Get routing decision");
  console.log("  POST   /api/payments            - Execute payment");
  console.log("  POST   /api/payments/validate   - Validate payment intent");
  console.log("  POST   /api/refunds             - Process refund");
  console.log("  GET    /api/regions             - List regions");
  console.log("  GET    /api/regions/:code       - Get region details");
  console.log("  GET    /api/cache/stats         - Cache statistics");
  console.log("  DELETE /api/cache               - Clear cache");
  console.log("  POST   /api/webhooks            - Webhook handler");
  console.log("=".repeat(60));
});

export default app;