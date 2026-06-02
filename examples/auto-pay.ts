/**
 * Auto-pay example with fallback
 * 
 * This example demonstrates automatic payment routing
 * with fallback to alternative regions on failure.
 */

import { PrimeFlow, PrimeFlowException } from "prime-flow";

async function main() {
  // Initialize client with fallback enabled
  const client = new PrimeFlow({
    layer403: {
      baseUrl: process.env.LAYER403_URL ?? "https://403-gateway.example.com",
      apiKey: process.env.PRIMEFLOW_API_KEY!,
      apiSecret: process.env.PRIMEFLOW_API_SECRET!,
      timeoutMs: 10000,
    },
    routing: {
      mode: "auto",
      strategy: "balanced",
      allowedRegions: ["EU", "UK", "SG", "US", "BR"],
      weights: {
        price: 0.6,
        success: 0.35,
        latency: 0.05,
      },
      fallback: {
        enabled: true,
        maxTries: 3,
        backoffMs: 1000, // Wait 1s between retries
      },
    },
    compliance: {
      enforceAllowedRegions: true,
      sanctionsCheck: true,
    },
    observability: {
      logLevel: "info",
      onEvent: (event) => {
        // Send to your monitoring system
        console.log(`[EVENT] ${event.type}:`, JSON.stringify(event.data));
      },
    },
  });

  // Payment intent
  const intent = {
    id: `order_${Date.now()}`,
    amount: 250.00,
    currency: "EUR",
    paymentMethod: "card" as const,
    userCountry: "FR",
    cardToken: "tok_mastercard_5555",
    customerEmail: "customer@example.com",
    customerName: "Jean Dupont",
    description: "Premium subscription - Annual",
    statementDescriptor: "MYAPP*PREMIUM",
    returnUrl: "https://myapp.com/payment/callback",
    webhookUrl: "https://myapp.com/webhooks/primeflow",
    metadata: {
      subscriptionId: "sub_annual_001",
      plan: "premium",
    },
  };

  console.log("Starting payment...");
  console.log(`Intent ID: ${intent.id}`);
  console.log(`Amount: ${intent.amount} ${intent.currency}`);
  console.log("");

  try {
    // Execute payment with auto-routing
    const result = await client.pay(intent, {
      // Optional: specify idempotency key for retry safety
      idempotencyKey: `idem_${intent.id}`,
      // Optional: include raw provider response
      includeRaw: false,
    });

    console.log("\n" + "=".repeat(50));
    console.log("PAYMENT RESULT:");
    console.log("=".repeat(50));
    console.log(`Status: ${result.status}`);
    console.log(`Region Used: ${result.regionUsed}`);
    console.log(`Router: ${result.routerId}`);
    console.log(`Provider Payment ID: ${result.providerPaymentId}`);
    console.log(`Cost Applied: ${result.costApplied.toFixed(2)} ${intent.currency}`);
    console.log(`Amount Charged: ${result.amountCharged} ${result.currencyCharged}`);

    // Show attempts if there were fallbacks
    if (result.attempts.length > 1) {
      console.log("\nAttempts:");
      for (const attempt of result.attempts) {
        const status = attempt.status === "succeeded" ? "✓" : "✗";
        console.log(`  ${status} Attempt ${attempt.attemptNumber}: ${attempt.region} (${attempt.durationMs}ms)`);
        if (attempt.error) {
          console.log(`      Error: ${attempt.error.code} - ${attempt.error.message}`);
        }
      }
    }

    // Handle next action if required (3DS, redirect, etc.)
    if (result.nextAction) {
      console.log("\nNext Action Required:");
      console.log(`  Type: ${result.nextAction.type}`);
      if (result.nextAction.redirectUrl) {
        console.log(`  Redirect URL: ${result.nextAction.redirectUrl}`);
      }
      if (result.nextAction.instructions) {
        console.log(`  Instructions: ${result.nextAction.instructions}`);
      }
    }

  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("PAYMENT FAILED");
    console.error("=".repeat(50));

    if (error instanceof PrimeFlowException) {
      console.error(`Error Code: ${error.code}`);
      console.error(`Message: ${error.message}`);
      console.error(`Retryable: ${error.isRetryable}`);
      
      if (error.details) {
        console.error("Details:", JSON.stringify(error.details, null, 2));
      }

      // Handle specific error cases
      switch (error.code) {
        case "PAYMENT_DECLINED":
          console.error("\n→ Card was declined. Please try a different payment method.");
          break;
        case "INSUFFICIENT_FUNDS":
          console.error("\n→ Insufficient funds. Please use a different card.");
          break;
        case "AUTHENTICATION_REQUIRED":
          console.error("\n→ 3D Secure authentication required.");
          break;
        case "NO_AVAILABLE_REGIONS":
          console.error("\n→ No payment routes available. Contact support.");
          break;
        case "TIMEOUT":
          console.error("\n→ Request timed out. Please retry.");
          break;
        default:
          console.error("\n→ An error occurred. Please try again later.");
      }
    } else {
      console.error("Unexpected error:", error);
    }
  }
}

// Run example
main().catch(console.error);
