/**
 * Tests for request signing
 */

import { describe, it, expect, beforeEach } from "vitest";
import { 
  RequestSigner, 
  generateIdempotencyKey, 
  generateRequestId 
} from "../src/layer403/signer";

describe("RequestSigner", () => {
  let signer: RequestSigner;

  beforeEach(() => {
    signer = new RequestSigner("test_api_key", "test_api_secret_12345");
  });

  describe("sign", () => {
    it("should generate signature with required headers", () => {
      const result = signer.sign({
        method: "POST",
        path: "/quote",
      });

      expect(result.headers["X-PrimeFlow-Key"]).toBe("test_api_key");
      expect(result.headers["X-PrimeFlow-Timestamp"]).toBeDefined();
      expect(result.headers["X-PrimeFlow-Nonce"]).toBeDefined();
      expect(result.headers["X-PrimeFlow-Signature"]).toBeDefined();
    });

    it("should use provided timestamp and nonce", () => {
      const timestamp = "2024-01-15T12:00:00.000Z";
      const nonce = "test_nonce_123";

      const result = signer.sign({
        method: "POST",
        path: "/quote",
        timestamp,
        nonce,
      });

      expect(result.headers["X-PrimeFlow-Timestamp"]).toBe(timestamp);
      expect(result.headers["X-PrimeFlow-Nonce"]).toBe(nonce);
      expect(result.timestamp).toBe(timestamp);
      expect(result.nonce).toBe(nonce);
    });

    it("should produce different signatures for different methods", () => {
      const sig1 = signer.sign({
        method: "GET",
        path: "/regions",
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      const sig2 = signer.sign({
        method: "POST",
        path: "/regions",
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      expect(sig1.signature).not.toBe(sig2.signature);
    });

    it("should produce different signatures for different paths", () => {
      const sig1 = signer.sign({
        method: "POST",
        path: "/quote",
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      const sig2 = signer.sign({
        method: "POST",
        path: "/pay",
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      expect(sig1.signature).not.toBe(sig2.signature);
    });

    it("should produce different signatures for different bodies", () => {
      const sig1 = signer.sign({
        method: "POST",
        path: "/pay",
        body: JSON.stringify({ amount: 100 }),
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      const sig2 = signer.sign({
        method: "POST",
        path: "/pay",
        body: JSON.stringify({ amount: 200 }),
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      expect(sig1.signature).not.toBe(sig2.signature);
    });

    it("should produce consistent signatures with same inputs", () => {
      const params = {
        method: "POST",
        path: "/quote",
        body: JSON.stringify({ test: true }),
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "fixed_nonce",
      };

      const sig1 = signer.sign(params);
      const sig2 = signer.sign(params);

      expect(sig1.signature).toBe(sig2.signature);
    });

    it("should include body hash in signature when body provided", () => {
      const withBody = signer.sign({
        method: "POST",
        path: "/pay",
        body: JSON.stringify({ amount: 100 }),
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      const withoutBody = signer.sign({
        method: "POST",
        path: "/pay",
        timestamp: "2024-01-15T12:00:00.000Z",
        nonce: "nonce1",
      });

      expect(withBody.signature).not.toBe(withoutBody.signature);
    });
  });

  describe("verifyWebhook", () => {
    it("should verify valid signature", () => {
      const payload = JSON.stringify({ type: "payment.succeeded", id: "123" });
      const timestamp = new Date().toISOString();
      
      // Create signature the same way the webhook would
      const signer2 = new RequestSigner("test_api_key", "test_api_secret_12345");
      const expectedPayload = `${timestamp}.${payload}`;
      
      // Get signature using internal method simulation
      const crypto = require("node:crypto");
      const signature = crypto
        .createHmac("sha256", "test_api_secret_12345")
        .update(expectedPayload)
        .digest("hex");

      const isValid = signer.verifyWebhook(payload, signature, timestamp);
      expect(isValid).toBe(true);
    });

    it("should reject invalid signature", () => {
      const payload = JSON.stringify({ type: "payment.succeeded" });
      const timestamp = new Date().toISOString();
      const badSignature = "invalid_signature_abc123";

      const isValid = signer.verifyWebhook(payload, badSignature, timestamp);
      expect(isValid).toBe(false);
    });

    it("should reject old timestamps (replay protection)", () => {
      const payload = JSON.stringify({ type: "payment.succeeded" });
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      
      const crypto = require("node:crypto");
      const signature = crypto
        .createHmac("sha256", "test_api_secret_12345")
        .update(`${oldTimestamp}.${payload}`)
        .digest("hex");

      const isValid = signer.verifyWebhook(payload, signature, oldTimestamp);
      expect(isValid).toBe(false);
    });

    it("should reject future timestamps", () => {
      const payload = JSON.stringify({ type: "payment.succeeded" });
      const futureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min ahead
      
      const crypto = require("node:crypto");
      const signature = crypto
        .createHmac("sha256", "test_api_secret_12345")
        .update(`${futureTimestamp}.${payload}`)
        .digest("hex");

      const isValid = signer.verifyWebhook(payload, signature, futureTimestamp);
      expect(isValid).toBe(false);
    });

    it("should accept timestamps within 5 minute window", () => {
      const payload = JSON.stringify({ type: "payment.succeeded" });
      const recentTimestamp = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min ago
      
      const crypto = require("node:crypto");
      const signature = crypto
        .createHmac("sha256", "test_api_secret_12345")
        .update(`${recentTimestamp}.${payload}`)
        .digest("hex");

      const isValid = signer.verifyWebhook(payload, signature, recentTimestamp);
      expect(isValid).toBe(true);
    });
  });
});

describe("generateIdempotencyKey", () => {
  it("should generate unique keys", () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    
    expect(key1).not.toBe(key2);
  });

  it("should generate keys with correct prefix", () => {
    const key = generateIdempotencyKey();
    expect(key.startsWith("idem_")).toBe(true);
  });

  it("should generate keys of reasonable length", () => {
    const key = generateIdempotencyKey();
    expect(key.length).toBeGreaterThan(20);
    expect(key.length).toBeLessThan(50);
  });
});

describe("generateRequestId", () => {
  it("should generate unique request IDs", () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    
    expect(id1).not.toBe(id2);
  });

  it("should generate IDs with correct prefix", () => {
    const id = generateRequestId();
    expect(id.startsWith("req_")).toBe(true);
  });

  it("should include timestamp in ID", () => {
    const before = Date.now();
    const id = generateRequestId();
    const after = Date.now();
    
    // Extract timestamp from ID (format: req_TIMESTAMP_RANDOM)
    const parts = id.split("_");
    const timestamp = parseInt(parts[1]!, 10);
    
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
