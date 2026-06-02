/**
 * Basic quote example
 * 
 * This example shows how to get payment route quotes
 * without executing the payment.
 */

import { PrimeFlow } from "prime-flow";

async function main() {
  // Initialize client
  const client = new PrimeFlow({
    layer403: {
      baseUrl: "https://403-gateway.example.com",
      apiKey: process.env.PRIMEFLOW_API_KEY!,
      apiSecret: process.env.PRIMEFLOW_API_SECRET!,
      timeoutMs: 5000,
    },
    routing: {
      mode: "auto",
      allowedRegions: ["EU", "UK", "SG", "US"],
      weights: {
        price: 0.7,    // 70% weight on price
        success: 0.25, // 25% weight on success rate
        latency: 0.05, // 5% weight on latency
      },
    },
    cache: {
      ttlMs: 30000, // 30 second cache
    },
  });

  // Create payment intent
  const intent = {
    id: "order_123456",
    amount: 100.00,
    currency: "USD",
    paymentMethod: "card" as const,
    userCountry: "DE", // Germany
    cardToken: "tok_visa_4242",
    metadata: {
      orderId: "ORD-2024-001",
      customerId: "cust_abc",
    },
  };

  try {
    // Get quotes
    console.log("Fetching quotes...\n");
    const quoteResult = await client.quote(intent);

    console.log(`Found ${quoteResult.quotes.length} route options:\n`);

    // Display all quotes
    for (const quote of quoteResult.quotes) {
      console.log(`Region: ${quote.region}`);
      console.log(`  Router: ${quote.routerName ?? quote.routerId}`);
      console.log(`  Total Cost: $${quote.totalCost.toFixed(2)}`);
      console.log(`  Breakdown:`);
      console.log(`    - Percent Fee: ${quote.feeBreakdown.percentFee}%`);
      console.log(`    - Fixed Fee: $${quote.feeBreakdown.fixedFee}`);
      console.log(`    - FX Fee: $${quote.feeBreakdown.fxFee}`);
      if (quote.successRate) {
        console.log(`  Success Rate: ${(quote.successRate * 100).toFixed(1)}%`);
      }
      if (quote.latencyMs) {
        console.log(`  Latency: ${quote.latencyMs}ms`);
      }
      console.log(`  Score: ${quote.score.toFixed(3)} (lower is better)`);
      console.log("");
    }

    // Show best option
    if (quoteResult.best) {
      console.log("=".repeat(50));
      console.log("RECOMMENDED ROUTE:");
      console.log(`  Region: ${quoteResult.best.region}`);
      console.log(`  Total Cost: $${quoteResult.best.totalCost.toFixed(2)}`);
      console.log(`  Reasons: ${quoteResult.best.reasons.join(", ")}`);
    }

    // Get route decision (without paying)
    console.log("\n" + "=".repeat(50));
    console.log("Getting route decision...\n");
    
    const decision = await client.decideRoute(intent);
    console.log(`Chosen Region: ${decision.chosenRegion}`);
    console.log(`Router: ${decision.chosenRouterId}`);
    console.log(`Reason: ${decision.reasonSummary}`);
    console.log(`Alternatives: ${decision.alternatives.length}`);

  } catch (error) {
    console.error("Error:", error);
  }
}

main();
