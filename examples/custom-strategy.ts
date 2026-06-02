/**
 * Custom routing strategy example
 * 
 * This example shows how to implement custom scoring logic
 * for payment routing decisions.
 */

import { 
  PrimeFlow, 
  createCustomStrategy,
  combineStrategies,
  type RegionQuote,
  type PaymentIntent,
} from "prime-flow";

// ===========================================
// Example 1: Simple Custom Scorer
// ===========================================

/**
 * Custom scorer that prefers specific regions for high-value payments
 * and cheapest options for low-value payments.
 */
function tieredPricingScorer(quote: RegionQuote, intent: PaymentIntent): number {
  const isHighValue = intent.amount > 1000;
  
  if (isHighValue) {
    // For high-value: prioritize success rate heavily
    const successPenalty = quote.successRate ? (1 - quote.successRate) * 2 : 0.5;
    const costPenalty = quote.totalCost / intent.amount * 0.3;
    return successPenalty + costPenalty;
  } else {
    // For low-value: prioritize cost
    const costPenalty = quote.totalCost / intent.amount;
    const successPenalty = quote.successRate ? (1 - quote.successRate) * 0.2 : 0.1;
    return costPenalty + successPenalty;
  }
}

// ===========================================
// Example 2: Region Preference Scorer
// ===========================================

/**
 * Scorer that prefers specific regions based on user country
 */
function regionAffinityScorer(quote: RegionQuote, intent: PaymentIntent): number {
  // Define region affinities by user country
  const affinities: Record<string, string[]> = {
    // European users prefer EU, then UK
    DE: ["EU", "UK", "US"],
    FR: ["EU", "UK", "US"],
    IT: ["EU", "UK", "US"],
    ES: ["EU", "UK", "US"],
    
    // UK users prefer UK, then EU
    GB: ["UK", "EU", "US"],
    
    // Asian users prefer SG, then JP
    SG: ["SG", "JP", "US"],
    JP: ["JP", "SG", "US"],
    CN: ["SG", "JP", "US"],
    
    // Americas prefer US
    US: ["US", "EU", "UK"],
    CA: ["US", "EU", "UK"],
    BR: ["BR", "US", "EU"],
    MX: ["US", "MX", "EU"],
  };

  const userCountry = intent.userCountry ?? "US";
  const preferred = affinities[userCountry] ?? ["US", "EU", "UK"];
  
  // Score based on position in preference list
  const position = preferred.indexOf(quote.region);
  const affinityScore = position === -1 ? 1 : position * 0.1;
  
  // Combine with cost
  const costScore = quote.totalCost / intent.amount * 0.5;
  
  return affinityScore + costScore;
}

// ===========================================
// Example 3: Time-Based Scorer
// ===========================================

/**
 * Scorer that considers time of day for regional preferences
 * (route to regions where it's business hours)
 */
function timeAwareScorer(quote: RegionQuote, _intent: PaymentIntent): number {
  const now = new Date();
  const hour = now.getUTCHours();
  
  // Define business hours (9-17) offsets from UTC
  const regionOffsets: Record<string, number> = {
    US: -5,   // EST
    EU: 1,    // CET
    UK: 0,    // GMT
    SG: 8,    // SGT
    JP: 9,    // JST
    BR: -3,   // BRT
    AU: 10,   // AEST
  };

  const offset = regionOffsets[quote.region] ?? 0;
  const localHour = (hour + offset + 24) % 24;
  
  // Prefer regions in business hours (9-17)
  const isBusinessHours = localHour >= 9 && localHour <= 17;
  const timeScore = isBusinessHours ? 0 : 0.2;
  
  // Combine with cost and success rate
  const costScore = quote.totalCost * 0.01;
  const successScore = quote.successRate ? (1 - quote.successRate) * 0.3 : 0.15;
  
  return timeScore + costScore + successScore;
}

// ===========================================
// Example 4: Risk-Aware Scorer
// ===========================================

/**
 * Scorer that factors in risk indicators
 */
function riskAwareScorer(quote: RegionQuote, intent: PaymentIntent): number {
  let riskScore = 0;
  
  // Higher risk for cross-border (different user country and region)
  const isCrossBorder = intent.userCountry && 
    !quote.region.includes(intent.userCountry);
  if (isCrossBorder) {
    riskScore += 0.1;
  }
  
  // Higher risk for high amounts
  if (intent.amount > 5000) {
    riskScore += 0.15;
  }
  
  // Prefer regions with higher success rates when risk is elevated
  const successFactor = quote.successRate ?? 0.9;
  if (riskScore > 0.1) {
    // Amplify success rate importance for risky transactions
    riskScore += (1 - successFactor) * 0.5;
  }
  
  // Add cost factor
  const costScore = quote.totalCost / intent.amount * 0.3;
  
  return riskScore + costScore;
}

// ===========================================
// Usage Examples
// ===========================================

async function main() {
  // Example 1: Using simple custom scorer
  const client1 = new PrimeFlow({
    layer403: {
      baseUrl: process.env.LAYER403_URL!,
      apiKey: process.env.PRIMEFLOW_API_KEY!,
      apiSecret: process.env.PRIMEFLOW_API_SECRET!,
    },
    routing: {
      mode: "auto",
      strategy: "custom",
      customScorer: (quotes, _weights) => {
        const intent: PaymentIntent = { 
          id: "test", 
          amount: 500, 
          currency: "USD", 
          paymentMethod: "card" 
        };
        
        return quotes
          .map(q => ({ ...q, score: tieredPricingScorer(q, intent) }))
          .sort((a, b) => a.score - b.score);
      },
    },
  });

  // Example 2: Using createCustomStrategy helper
  const regionAffinityStrategy = createCustomStrategy(regionAffinityScorer);

  const client2 = new PrimeFlow({
    layer403: {
      baseUrl: process.env.LAYER403_URL!,
      apiKey: process.env.PRIMEFLOW_API_KEY!,
      apiSecret: process.env.PRIMEFLOW_API_SECRET!,
    },
    routing: {
      mode: "auto",
      strategy: "custom",
      customScorer: (quotes, weights) => {
        // Use the strategy directly
        const intent: PaymentIntent = { 
          id: "test", 
          amount: 100, 
          currency: "EUR", 
          paymentMethod: "card",
          userCountry: "DE",
        };
        
        return regionAffinityStrategy(quotes, intent, { 
          mode: "auto", 
          weights 
        });
      },
    },
  });

  // Example 3: Combining multiple strategies
  const combinedStrategy = combineStrategies([
    { strategy: "cheapest", weight: 0.4 },
    { strategy: "highest_success", weight: 0.4 },
    { strategy: "balanced", weight: 0.2 },
  ]);

  const client3 = new PrimeFlow({
    layer403: {
      baseUrl: process.env.LAYER403_URL!,
      apiKey: process.env.PRIMEFLOW_API_KEY!,
      apiSecret: process.env.PRIMEFLOW_API_SECRET!,
    },
    routing: {
      mode: "auto",
      strategy: "custom",
      customScorer: (quotes, weights) => {
        const intent: PaymentIntent = { 
          id: "test", 
          amount: 100, 
          currency: "USD", 
          paymentMethod: "card" 
        };
        return combinedStrategy(quotes, intent, { mode: "auto", weights });
      },
    },
  });

  // Test the clients
  const testIntent: PaymentIntent = {
    id: `order_${Date.now()}`,
    amount: 150.00,
    currency: "EUR",
    paymentMethod: "card",
    userCountry: "DE",
    cardToken: "tok_visa_4242",
  };

  console.log("Testing custom routing strategies...\n");

  // Test tiered pricing
  console.log("=== Tiered Pricing Strategy ===");
  const quotes1 = await client1.quote(testIntent);
  console.log(`Best region: ${quotes1.best?.region}`);
  console.log(`Score: ${quotes1.best?.score.toFixed(4)}`);
  console.log("");

  // Test region affinity
  console.log("=== Region Affinity Strategy ===");
  const quotes2 = await client2.quote(testIntent);
  console.log(`Best region: ${quotes2.best?.region}`);
  console.log(`Score: ${quotes2.best?.score.toFixed(4)}`);
  console.log("");

  // Test combined strategy
  console.log("=== Combined Strategy ===");
  const quotes3 = await client3.quote(testIntent);
  console.log(`Best region: ${quotes3.best?.region}`);
  console.log(`Score: ${quotes3.best?.score.toFixed(4)}`);
}

main().catch(console.error);
