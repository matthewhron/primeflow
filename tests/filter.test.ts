/**
 * Tests for region filtering logic
 */

import { describe, it, expect } from "vitest";
import { 
  filterQuotes, 
  isRegionAllowed, 
  getFilterReasonDescription 
} from "../src/routing/filter";
import type { RegionQuote } from "../src/types/quote";
import type { PaymentIntent } from "../src/types/intent";
import type { RoutingConfig } from "../src/types/config";

// Helper to create mock quote
function createMockQuote(overrides: Partial<RegionQuote>): RegionQuote {
  return {
    region: "EU",
    routerId: "router_eu_1",
    totalCost: 2.50,
    feeBreakdown: { percentFee: 2.5, fixedFee: 0.25, fxFee: 0 },
    limits: { min: 1, max: 10000 },
    score: 0,
    reasons: [],
    available: true,
    supportedMethods: ["card", "bank_transfer", "wallet"],
    ...overrides,
  };
}

// Helper to create mock intent
function createMockIntent(overrides: Partial<PaymentIntent>): PaymentIntent {
  return {
    id: "test_intent_1",
    amount: 100,
    currency: "USD",
    paymentMethod: "card",
    ...overrides,
  };
}

describe("filterQuotes", () => {
  it("should pass all quotes when no filters applied", () => {
    const quotes = [
      createMockQuote({ region: "EU" }),
      createMockQuote({ region: "UK" }),
      createMockQuote({ region: "SG" }),
    ];
    const intent = createMockIntent({});

    const result = filterQuotes(quotes, intent);

    expect(result.passed).toHaveLength(3);
    expect(result.filtered).toHaveLength(0);
  });

  it("should filter unavailable regions", () => {
    const quotes = [
      createMockQuote({ region: "EU", available: true }),
      createMockQuote({ region: "UK", available: false, unavailableReason: "Maintenance" }),
    ];
    const intent = createMockIntent({});

    const result = filterQuotes(quotes, intent);

    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.region).toBe("EU");
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.reason).toBe("region_unavailable");
  });

  it("should filter by allowlist", () => {
    const quotes = [
      createMockQuote({ region: "EU" }),
      createMockQuote({ region: "UK" }),
      createMockQuote({ region: "SG" }),
    ];
    const intent = createMockIntent({});
    const config: RoutingConfig = {
      mode: "auto",
      allowedRegions: ["EU", "UK"],
    };

    const result = filterQuotes(quotes, intent, config);

    expect(result.passed).toHaveLength(2);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.reason).toBe("region_not_allowed");
    expect(result.filtered[0]?.quote.region).toBe("SG");
  });

  it("should filter by blocklist", () => {
    const quotes = [
      createMockQuote({ region: "EU" }),
      createMockQuote({ region: "UK" }),
      createMockQuote({ region: "SG" }),
    ];
    const intent = createMockIntent({});
    const config: RoutingConfig = {
      mode: "auto",
      blockedRegions: ["UK"],
    };

    const result = filterQuotes(quotes, intent, config);

    expect(result.passed).toHaveLength(2);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.reason).toBe("region_blocked");
  });

  it("should filter when amount below minimum", () => {
    const quotes = [
      createMockQuote({ region: "EU", limits: { min: 10, max: 1000 } }),
      createMockQuote({ region: "UK", limits: { min: 1, max: 1000 } }),
    ];
    const intent = createMockIntent({ amount: 5 }); // Below EU min

    const result = filterQuotes(quotes, intent);

    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.region).toBe("UK");
    expect(result.filtered[0]?.reason).toBe("amount_below_min");
  });

  it("should filter when amount above maximum", () => {
    const quotes = [
      createMockQuote({ region: "EU", limits: { min: 1, max: 100 } }),
      createMockQuote({ region: "UK", limits: { min: 1, max: 10000 } }),
    ];
    const intent = createMockIntent({ amount: 500 }); // Above EU max

    const result = filterQuotes(quotes, intent);

    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.region).toBe("UK");
    expect(result.filtered[0]?.reason).toBe("amount_above_max");
  });

  it("should filter when daily limit exceeded", () => {
    const quotes = [
      createMockQuote({ 
        region: "EU", 
        limits: { min: 1, max: 10000, remainingDaily: 50 } 
      }),
      createMockQuote({ 
        region: "UK", 
        limits: { min: 1, max: 10000, remainingDaily: 1000 } 
      }),
    ];
    const intent = createMockIntent({ amount: 100 }); // Exceeds EU daily

    const result = filterQuotes(quotes, intent);

    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.region).toBe("UK");
    expect(result.filtered[0]?.reason).toBe("daily_limit_exceeded");
  });

  it("should filter when payment method not supported", () => {
    const quotes = [
      createMockQuote({ region: "EU", supportedMethods: ["card", "sepa"] }),
      createMockQuote({ region: "UK", supportedMethods: ["card", "bank_transfer"] }),
    ];
    const intent = createMockIntent({ paymentMethod: "bank_transfer" });

    const result = filterQuotes(quotes, intent);

    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.region).toBe("UK");
    expect(result.filtered[0]?.reason).toBe("method_not_supported");
  });

  it("should handle multiple filter reasons", () => {
    const quotes = [
      createMockQuote({ region: "EU", available: false }),
      createMockQuote({ region: "UK", limits: { min: 500, max: 10000 } }),
      createMockQuote({ region: "SG", supportedMethods: ["wallet"] }),
    ];
    const intent = createMockIntent({ amount: 100, paymentMethod: "card" });
    const config: RoutingConfig = {
      mode: "auto",
      blockedRegions: [],
    };

    const result = filterQuotes(quotes, intent, config);

    expect(result.passed).toHaveLength(0);
    expect(result.filtered).toHaveLength(3);
  });
});

describe("isRegionAllowed", () => {
  it("should return true when no config", () => {
    expect(isRegionAllowed("EU")).toBe(true);
    expect(isRegionAllowed("ANY")).toBe(true);
  });

  it("should return true when region in allowlist", () => {
    const config: RoutingConfig = {
      mode: "auto",
      allowedRegions: ["EU", "UK"],
    };

    expect(isRegionAllowed("EU", config)).toBe(true);
    expect(isRegionAllowed("UK", config)).toBe(true);
    expect(isRegionAllowed("SG", config)).toBe(false);
  });

  it("should return false when region in blocklist", () => {
    const config: RoutingConfig = {
      mode: "auto",
      blockedRegions: ["RU", "CN"],
    };

    expect(isRegionAllowed("RU", config)).toBe(false);
    expect(isRegionAllowed("CN", config)).toBe(false);
    expect(isRegionAllowed("EU", config)).toBe(true);
  });

  it("should check blocklist before allowlist", () => {
    const config: RoutingConfig = {
      mode: "auto",
      allowedRegions: ["EU", "UK", "RU"],
      blockedRegions: ["RU"],
    };

    expect(isRegionAllowed("EU", config)).toBe(true);
    expect(isRegionAllowed("RU", config)).toBe(false); // Blocked takes priority
  });
});

describe("getFilterReasonDescription", () => {
  it("should return descriptions for all reasons", () => {
    const reasons = [
      "region_not_allowed",
      "region_blocked",
      "amount_below_min",
      "amount_above_max",
      "daily_limit_exceeded",
      "method_not_supported",
      "region_unavailable",
      "compliance_blocked",
      "currency_not_supported",
    ] as const;

    for (const reason of reasons) {
      const description = getFilterReasonDescription(reason);
      expect(description).toBeTruthy();
      expect(description.length).toBeGreaterThan(10);
    }
  });
});
