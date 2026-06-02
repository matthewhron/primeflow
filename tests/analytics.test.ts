/**
 * Analytics tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Analytics, createAnalytics, type PaymentMetric } from "../src/analytics/index.js";

describe("Analytics", () => {
  let analytics: Analytics;

  beforeEach(() => {
    analytics = createAnalytics({ maxMetrics: 100 });
  });

  describe("recordPayment", () => {
    it("should record a payment metric", () => {
      const metric: PaymentMetric = {
        intentId: "pi_123",
        region: "eu-west",
        routerId: "stripe-eu",
        amount: 1000,
        currency: "USD",
        status: "succeeded",
        latencyMs: 500,
        timestamp: new Date().toISOString(),
        attempts: 1,
      };

      analytics.recordPayment(metric);
      const snapshot = analytics.getSnapshot();

      expect(snapshot.totalPayments).toBe(1);
      expect(snapshot.successfulPayments).toBe(1);
    });

    it("should trim metrics when over limit", () => {
      for (let i = 0; i < 150; i++) {
        analytics.recordPayment({
          intentId: `pi_${i}`,
          region: "eu-west",
          routerId: "stripe-eu",
          amount: 100,
          currency: "USD",
          status: "succeeded",
          latencyMs: 100,
          timestamp: new Date().toISOString(),
          attempts: 1,
        });
      }

      const snapshot = analytics.getSnapshot();
      expect(snapshot.totalPayments).toBeLessThanOrEqual(100);
    });
  });

  describe("getSnapshot", () => {
    it("should calculate correct success rate", () => {
      // 8 successful, 2 failed = 80% success rate
      for (let i = 0; i < 8; i++) {
        analytics.recordPayment({
          intentId: `pi_success_${i}`,
          region: "eu-west",
          routerId: "stripe-eu",
          amount: 100,
          currency: "USD",
          status: "succeeded",
          latencyMs: 100,
          timestamp: new Date().toISOString(),
          attempts: 1,
        });
      }

      for (let i = 0; i < 2; i++) {
        analytics.recordPayment({
          intentId: `pi_fail_${i}`,
          region: "eu-west",
          routerId: "stripe-eu",
          amount: 100,
          currency: "USD",
          status: "failed",
          latencyMs: 100,
          timestamp: new Date().toISOString(),
          attempts: 1,
          error: "DECLINED",
        });
      }

      const snapshot = analytics.getSnapshot();
      expect(snapshot.overallSuccessRate).toBe(80);
    });

    it("should filter by time period", () => {
      // Old payment
      analytics.recordPayment({
        intentId: "pi_old",
        region: "eu-west",
        routerId: "stripe-eu",
        amount: 100,
        currency: "USD",
        status: "succeeded",
        latencyMs: 100,
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48h ago
        attempts: 1,
      });

      // Recent payment
      analytics.recordPayment({
        intentId: "pi_recent",
        region: "eu-west",
        routerId: "stripe-eu",
        amount: 200,
        currency: "USD",
        status: "succeeded",
        latencyMs: 100,
        timestamp: new Date().toISOString(),
        attempts: 1,
      });

      const last24h = analytics.getSnapshot(24 * 60 * 60 * 1000);
      expect(last24h.totalPayments).toBe(1);
      expect(last24h.totalVolume.USD).toBe(200);
    });
  });

  describe("getRegionStats", () => {
    it("should group by region", () => {
      const regions = ["eu-west", "us-east", "ap-south"];
      
      for (const region of regions) {
        for (let i = 0; i < 5; i++) {
          analytics.recordPayment({
            intentId: `pi_${region}_${i}`,
            region,
            routerId: `router-${region}`,
            amount: 100,
            currency: "USD",
            status: "succeeded",
            latencyMs: 100,
            timestamp: new Date().toISOString(),
            attempts: 1,
          });
        }
      }

      const stats = analytics.getRegionStats();
      expect(stats.length).toBe(3);
      expect(stats[0].totalPayments).toBe(5);
    });
  });

  describe("getErrorBreakdown", () => {
    it("should count errors by type", () => {
      const errors = ["DECLINED", "DECLINED", "TIMEOUT", "FRAUD"];
      
      for (const error of errors) {
        analytics.recordPayment({
          intentId: `pi_${Date.now()}_${Math.random()}`,
          region: "eu-west",
          routerId: "stripe-eu",
          amount: 100,
          currency: "USD",
          status: "failed",
          latencyMs: 100,
          timestamp: new Date().toISOString(),
          attempts: 1,
          error,
        });
      }

      const breakdown = analytics.getErrorBreakdown();
      expect(breakdown.DECLINED).toBe(2);
      expect(breakdown.TIMEOUT).toBe(1);
      expect(breakdown.FRAUD).toBe(1);
    });
  });

  describe("getBestRegions", () => {
    it("should rank regions by score", () => {
      // Region A: 100% success, fast
      for (let i = 0; i < 20; i++) {
        analytics.recordPayment({
          intentId: `pi_a_${i}`,
          region: "region-a",
          routerId: "router-a",
          amount: 100,
          currency: "USD",
          status: "succeeded",
          latencyMs: 100,
          timestamp: new Date().toISOString(),
          attempts: 1,
        });
      }

      // Region B: 50% success, slow
      for (let i = 0; i < 10; i++) {
        analytics.recordPayment({
          intentId: `pi_b_success_${i}`,
          region: "region-b",
          routerId: "router-b",
          amount: 100,
          currency: "USD",
          status: "succeeded",
          latencyMs: 500,
          timestamp: new Date().toISOString(),
          attempts: 1,
        });
      }
      for (let i = 0; i < 10; i++) {
        analytics.recordPayment({
          intentId: `pi_b_fail_${i}`,
          region: "region-b",
          routerId: "router-b",
          amount: 100,
          currency: "USD",
          status: "failed",
          latencyMs: 500,
          timestamp: new Date().toISOString(),
          attempts: 1,
          error: "DECLINED",
        });
      }

      const best = analytics.getBestRegions(2);
      expect(best[0].region).toBe("region-a");
    });
  });

  describe("exportMetrics / importMetrics", () => {
    it("should export and import metrics", () => {
      analytics.recordPayment({
        intentId: "pi_export",
        region: "eu-west",
        routerId: "stripe-eu",
        amount: 100,
        currency: "USD",
        status: "succeeded",
        latencyMs: 100,
        timestamp: new Date().toISOString(),
        attempts: 1,
      });

      const exported = analytics.exportMetrics();
      expect(exported.payments.length).toBe(1);

      const newAnalytics = createAnalytics();
      newAnalytics.importMetrics(exported);

      const snapshot = newAnalytics.getSnapshot();
      expect(snapshot.totalPayments).toBe(1);
    });
  });
});
