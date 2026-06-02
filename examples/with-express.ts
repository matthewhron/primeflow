/**
 * Express integration example
 * 
 * This example shows how to integrate PrimeFlow
 * with an Express.js application, including:
 * - Middleware for idempotency and request tracking
 * - Webhook verification
 * - Error handling
 */

import express, { Request, Response, NextFunction } from "express";
import {
  PrimeFlow,
  createPrimeFlowMiddleware,
  createWebhookVerificationMiddleware,
  createErrorMiddleware,
  PrimeFlowException,
  WebhookPayload,
} from "prime-flow";

// Initialize Express app
const app = express();

// Initialize PrimeFlow client
const primeflow = new PrimeFlow({
  layer403: {
    baseUrl: process.env.LAYER403_URL!,
    apiKey: process.env.PRIMEFLOW_API_KEY!,
    apiSecret: process.env.PRIMEFLOW_API_SECRET!,
  },
  routing: {
    mode: "auto",
    strategy: "balanced",
    fallback: { enabled: true, maxTries: 3 },
  },
  observability: {
    logLevel: "info",
    onEvent: (event) => {
      // Send to your metrics/logging system
      console.log(`[PrimeFlow Event] ${event.type}`, event.data);
    },
  },
});

// ============================================
// Middleware Setup
// ============================================

// Parse JSON for regular routes
app.use(express.json());

// Add PrimeFlow middleware for payment routes
// This adds idempotency key and request tracking
app.use("/api/payments", createPrimeFlowMiddleware({
  idempotencyHeader: "X-Idempotency-Key",
  requestIdHeader: "X-Request-ID",
  autoGenerateIdempotencyKey: true,
}));

// ============================================
// Payment Routes
// ============================================

// Get payment quotes
app.post("/api/payments/quote", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, currency, paymentMethod, userCountry, cardToken } = req.body;

    const intent = {
      id: `quote_${Date.now()}`,
      amount,
      currency,
      paymentMethod,
      userCountry,
      cardToken,
    };

    const quotes = await primeflow.quote(intent);

    res.json({
      success: true,
      data: {
        quotes: quotes.quotes.map((q) => ({
          region: q.region,
          router: q.routerName ?? q.routerId,
          totalCost: q.totalCost,
          fees: q.feeBreakdown,
          successRate: q.successRate,
          score: q.score,
        })),
        recommended: quotes.best ? {
          region: quotes.best.region,
          totalCost: quotes.best.totalCost,
        } : null,
        generatedAt: quotes.generatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Execute payment
app.post("/api/payments/pay", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      orderId,
      amount,
      currency,
      paymentMethod,
      userCountry,
      cardToken,
      customerEmail,
      metadata,
    } = req.body;

    // Use idempotency key from middleware
    const idempotencyKey = req.primeflow?.idempotencyKey;

    const intent = {
      id: orderId ?? `order_${Date.now()}`,
      amount,
      currency,
      paymentMethod,
      userCountry,
      cardToken,
      customerEmail,
      metadata,
      webhookUrl: `${process.env.BASE_URL}/api/webhooks/primeflow`,
    };

    const result = await primeflow.pay(intent, { idempotencyKey });

    // Handle different statuses
    if (result.status === "requires_action" && result.nextAction) {
      res.json({
        success: true,
        status: "requires_action",
        data: {
          paymentId: result.providerPaymentId,
          nextAction: result.nextAction,
        },
      });
      return;
    }

    res.json({
      success: result.status === "succeeded",
      status: result.status,
      data: {
        paymentId: result.providerPaymentId,
        region: result.regionUsed,
        amountCharged: result.amountCharged,
        currency: result.currencyCharged,
        cost: result.costApplied,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Process refund
app.post("/api/payments/:paymentId/refund", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;
    const idempotencyKey = req.primeflow?.idempotencyKey;

    const result = await primeflow.refund(
      {
        paymentIntentId: paymentId,
        providerPaymentId: paymentId,
        amount,
        reason,
      },
      { idempotencyKey }
    );

    res.json({
      success: result.status === "succeeded",
      status: result.status,
      data: {
        refundId: result.refundId,
        amount: result.amount,
        currency: result.currency,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get available regions
app.get("/api/payments/regions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const regions = await primeflow.listRegions();

    res.json({
      success: true,
      data: regions.map((r) => ({
        code: r.code,
        name: r.name,
        currencies: r.currencies,
        methods: r.methods,
        active: r.active,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Webhook Handler
// ============================================

// Webhook route needs raw body for signature verification
app.post(
  "/api/webhooks/primeflow",
  express.raw({ type: "application/json" }),
  createWebhookVerificationMiddleware(
    (payload, signature, timestamp) => primeflow.verifyWebhook(payload, signature, timestamp),
    {
      signatureHeader: "X-PrimeFlow-Signature",
      timestampHeader: "X-PrimeFlow-Timestamp",
      onFailure: (_req, res) => {
        res.status(401).json({ error: "Invalid webhook signature" });
      },
    }
  ),
  async (req: Request, res: Response) => {
    const event = JSON.parse(req.body.toString()) as WebhookPayload;

    console.log(`[Webhook] Received event: ${event.type}`, event.data);

    switch (event.type) {
      case "payment.succeeded":
        // Update order status in your database
        console.log(`Payment ${event.data.intentId} succeeded`);
        // await updateOrderStatus(event.data.intentId, "paid");
        break;

      case "payment.failed":
        console.log(`Payment ${event.data.intentId} failed:`, event.data.error);
        // await updateOrderStatus(event.data.intentId, "failed");
        break;

      case "payment.refunded":
        console.log(`Payment ${event.data.intentId} refunded`);
        // await updateOrderStatus(event.data.intentId, "refunded");
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Acknowledge receipt
    res.json({ received: true });
  }
);

// ============================================
// Error Handling
// ============================================

// PrimeFlow error handler
app.use(createErrorMiddleware());

// Generic error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: {
      message: "Internal server error",
    },
  });
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Payment API: http://localhost:${PORT}/api/payments`);
  console.log(`Webhook URL: http://localhost:${PORT}/api/webhooks/primeflow`);
});

export default app;
