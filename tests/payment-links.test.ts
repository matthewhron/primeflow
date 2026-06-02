import { describe, it, expect, beforeEach } from "vitest";
import {
  PaymentLinksManager,
  createPaymentLinksManager,
} from "../src/payment-links/index.js";

describe("PaymentLinksManager", () => {
  let manager: PaymentLinksManager;

  beforeEach(() => {
    manager = createPaymentLinksManager({
      baseUrl: "https://pay.example.com",
      defaultExpirationSeconds: 3600,
      signingSecret: "test-secret",
    });
  });

  describe("create", () => {
    it("should create a payment link with required fields", () => {
      const link = manager.create({
        amount: 2500,
        currency: "USD",
      });

      expect(link.id).toBeDefined();
      expect(link.shortCode).toBeDefined();
      expect(link.url).toContain("https://pay.example.com/p/");
      expect(link.amount).toBe(2500);
      expect(link.currency).toBe("USD");
      expect(link.status).toBe("active");
    });

    it("should create a payment link with all options", () => {
      const link = manager.create({
        amount: 5000,
        currency: "eur",
        description: "Test payment",
        metadata: { orderId: "123" },
        customerEmail: "test@example.com",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(link.currency).toBe("EUR");
      expect(link.description).toBe("Test payment");
      expect(link.metadata).toEqual({ orderId: "123" });
      expect(link.customerEmail).toBe("test@example.com");
      expect(link.successUrl).toBe("https://example.com/success");
    });
  });

  describe("get", () => {
    it("should retrieve a link by short code", () => {
      const created = manager.create({ amount: 1000, currency: "USD" });
      const retrieved = manager.get(created.shortCode);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should return undefined for non-existent code", () => {
      const link = manager.get("nonexistent");
      expect(link).toBeUndefined();
    });
  });

  describe("getById", () => {
    it("should retrieve a link by ID", () => {
      const created = manager.create({ amount: 1000, currency: "USD" });
      const retrieved = manager.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.shortCode).toBe(created.shortCode);
    });
  });

  describe("isValid", () => {
    it("should return true for active non-expired links", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      expect(manager.isValid(link.shortCode)).toBe(true);
    });

    it("should return false for completed links", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      manager.complete(link.shortCode);
      expect(manager.isValid(link.shortCode)).toBe(false);
    });

    it("should return false for canceled links", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      manager.cancel(link.shortCode);
      expect(manager.isValid(link.shortCode)).toBe(false);
    });
  });

  describe("complete", () => {
    it("should mark active link as completed", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      const result = manager.complete(link.shortCode);

      expect(result).toBe(true);
      expect(manager.get(link.shortCode)?.status).toBe("completed");
    });

    it("should return false for already completed link", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      manager.complete(link.shortCode);
      const result = manager.complete(link.shortCode);

      expect(result).toBe(false);
    });
  });

  describe("cancel", () => {
    it("should mark active link as canceled", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      const result = manager.cancel(link.shortCode);

      expect(result).toBe(true);
      expect(manager.get(link.shortCode)?.status).toBe("canceled");
    });
  });

  describe("list", () => {
    it("should list all links sorted by creation date", () => {
      manager.create({ amount: 1000, currency: "USD" });
      manager.create({ amount: 2000, currency: "EUR" });
      manager.create({ amount: 3000, currency: "GBP" });

      const links = manager.list();
      expect(links.length).toBe(3);
    });

    it("should filter by status", () => {
      const link1 = manager.create({ amount: 1000, currency: "USD" });
      manager.create({ amount: 2000, currency: "EUR" });
      manager.complete(link1.shortCode);

      const activeLinks = manager.list("active");
      const completedLinks = manager.list("completed");

      expect(activeLinks.length).toBe(1);
      expect(completedLinks.length).toBe(1);
    });
  });

  describe("signature", () => {
    it("should generate and verify signed URLs", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      const signedUrl = manager.generateSignedUrl(link);

      expect(signedUrl).toContain("?sig=");

      const sig = signedUrl.split("?sig=")[1];
      expect(manager.verifySignature(link.shortCode, sig)).toBe(true);
    });

    it("should reject invalid signatures", () => {
      const link = manager.create({ amount: 1000, currency: "USD" });
      expect(manager.verifySignature(link.shortCode, "invalid")).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      const link1 = manager.create({ amount: 1000, currency: "USD" });
      const link2 = manager.create({ amount: 2000, currency: "EUR" });
      manager.create({ amount: 3000, currency: "GBP" });

      manager.complete(link1.shortCode);
      manager.cancel(link2.shortCode);

      const stats = manager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.canceled).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("should remove non-active links", () => {
      const link1 = manager.create({ amount: 1000, currency: "USD" });
      const link2 = manager.create({ amount: 2000, currency: "EUR" });

      manager.complete(link1.shortCode);
      manager.cancel(link2.shortCode);

      const removed = manager.cleanup();

      expect(removed).toBe(2);
      expect(manager.list().length).toBe(0);
    });
  });
});
