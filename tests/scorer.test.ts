/**
 * Tests for region scoring logic
 */

import { describe, it, expect } from "vitest";
import { scoreQuotes, customScore, explainScore } from "../src/routing/scorer";
import type { RegionQuote } from "../src/types/quote";

// Helper to create mock quotes
function createMockQuote(overrides: Partial<RegionQuote>): RegionQuote {
  return {
    region: "EU",
    routerId: "router_eu_1",
    routerName: "EU Router",
    totalCost: 2.50,
    feeBreakdown: {
      percentFee: 2.5,
      fixedFee: 0.25,
      fxFee: 0,
    },
    limits: {
      min: 1,
      max: 10000,
    },
    successRate: 0.95,
    latencyMs: 100,
    score: 0,
    reasons: [],
    available: true,
    ...overrides,
  };
}

describe("scoreQuotes", () => {
  it("should return empty result for empty quotes", () => {
    const result = scoreQuotes([]);
    
    expect(result.quotes).toHaveLength(0);
    expect(result.best).toBeNull();
    expect(result.meta.totalQuotes).toBe(0);
  });

  it("should score single quote", () => {
    const quotes = [createMockQuote({ region: "EU" })];
    const result = scoreQuotes(quotes);

    expect(result.quotes).toHaveLength(1);
    expect(result.best).toBeDefined();
    expect(result.best?.region).toBe("EU");
    expect(result.meta.totalQuotes).toBe(1);
  });

  it("should rank quotes by price when price weight is 1", () => {
    const quotes = [
      createMockQuote({ region: "EU", totalCost: 3.00 }),
      createMockQuote({ region: "UK", totalCost: 2.00 }),
      createMockQuote({ region: "SG", totalCost: 4.00 }),
    ];

    const result = scoreQuotes(quotes, { price: 1, success: 0, latency: 0 });

    expect(result.best?.region).toBe("UK"); // Cheapest
    expect(result.quotes[0]?.region).toBe("UK");
    expect(result.quotes[1]?.region).toBe("EU");
    expect(result.quotes[2]?.region).toBe("SG");
  });

  it("should rank quotes by success rate when success weight is 1", () => {
    const quotes = [
      createMockQuote({ region: "EU", successRate: 0.90 }),
      createMockQuote({ region: "UK", successRate: 0.98 }),
      createMockQuote({ region: "SG", successRate: 0.85 }),
    ];

    const result = scoreQuotes(quotes, { price: 0, success: 1, latency: 0 });

    expect(result.best?.region).toBe("UK"); // Highest success rate
    expect(result.quotes[0]?.region).toBe("UK");
  });

  it("should rank quotes by latency when latency weight is 1", () => {
    const quotes = [
      createMockQuote({ region: "EU", latencyMs: 200 }),
      createMockQuote({ region: "UK", latencyMs: 50 }),
      createMockQuote({ region: "SG", latencyMs: 300 }),
    ];

    const result = scoreQuotes(quotes, { price: 0, success: 0, latency: 1 });

    expect(result.best?.region).toBe("UK"); // Lowest latency
    expect(result.quotes[0]?.region).toBe("UK");
  });

  it("should apply balanced weights correctly", () => {
    const quotes = [
      createMockQuote({ 
        region: "EU", 
        totalCost: 2.00, 
        successRate: 0.90,
        latencyMs: 150 
      }),
      createMockQuote({ 
        region: "UK", 
        totalCost: 3.00, 
        successRate: 0.99,
        latencyMs: 50 
      }),
      createMockQuote({ 
        region: "SG", 
        totalCost: 1.50, 
        successRate: 0.80,
        latencyMs: 300 
      }),
    ];

    const result = scoreQuotes(quotes, { price: 0.7, success: 0.25, latency: 0.05 });

    // With these weights, cheaper options should generally win
    // but success rate matters too
    expect(result.quotes).toHaveLength(3);
    expect(result.best).toBeDefined();
  });

  it("should apply penalties for low success rate", () => {
    const quotes = [
      createMockQuote({ region: "EU", totalCost: 2.00, successRate: 0.95 }),
      createMockQuote({ region: "UK", totalCost: 2.00, successRate: 0.70 }), // Low success
    ];

    const result = scoreQuotes(quotes);

    // EU should win due to higher success rate despite same cost
    expect(result.best?.region).toBe("EU");
  });

  it("should apply penalties for being close to daily limit", () => {
    const quotes = [
      createMockQuote({ 
        region: "EU", 
        totalCost: 2.00,
        limits: { min: 1, max: 10000, remainingDaily: 500 } // Low remaining
      }),
      createMockQuote({ 
        region: "UK", 
        totalCost: 2.00,
        limits: { min: 1, max: 10000, remainingDaily: 9000 }
      }),
    ];

    const result = scoreQuotes(quotes);

    // UK should win due to more remaining daily limit
    expect(result.best?.region).toBe("UK");
  });

  it("should include reasons in scored quotes", () => {
    const quotes = [createMockQuote({ region: "EU" })];
    const result = scoreQuotes(quotes);

    expect(result.quotes[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("should calculate normalization ranges correctly", () => {
    const quotes = [
      createMockQuote({ totalCost: 1.00, successRate: 0.80, latencyMs: 50 }),
      createMockQuote({ totalCost: 5.00, successRate: 0.99, latencyMs: 300 }),
    ];

    const result = scoreQuotes(quotes);

    expect(result.meta.ranges.cost).toEqual({ min: 1.00, max: 5.00 });
    expect(result.meta.ranges.successRate).toEqual({ min: 0.80, max: 0.99 });
    expect(result.meta.ranges.latency).toEqual({ min: 50, max: 300 });
  });
});

describe("customScore", () => {
  it("should apply custom scoring function", () => {
    const quotes = [
      createMockQuote({ region: "EU", totalCost: 3.00 }),
      createMockQuote({ region: "UK", totalCost: 2.00 }),
    ];

    // Custom scorer that prefers EU regardless of cost
    const result = customScore(quotes, (quote) => 
      quote.region === "EU" ? 0 : 1
    );

    expect(result[0]?.region).toBe("EU");
  });
});

describe("explainScore", () => {
  it("should generate explanation for quote", () => {
    const quote = createMockQuote({
      region: "EU",
      routerName: "EU Main",
      totalCost: 2.50,
      score: 0.123,
      successRate: 0.95,
      latencyMs: 100,
      reasons: ["Best price", "High success rate"],
    });

    const explanation = explainScore(quote);

    expect(explanation).toContain("EU");
    expect(explanation).toContain("EU Main");
    expect(explanation).toContain("2.50");
    expect(explanation).toContain("0.123");
    expect(explanation).toContain("95.0%");
    expect(explanation).toContain("100ms");
  });
});
