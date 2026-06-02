/**
 * Tests for error handling
 */

import { describe, it, expect } from "vitest";
import {
  PrimeFlowException,
  createError,
  wrapError,
  isRetryableError,
  httpStatusToErrorCode,
} from "../src/types/errors";

describe("PrimeFlowException", () => {
  it("should create exception with all properties", () => {
    const error = createError(
      "PAYMENT_DECLINED",
      "Card was declined",
      { reason: "insufficient_funds" },
      "req_123"
    );

    const exception = new PrimeFlowException(error);

    expect(exception.code).toBe("PAYMENT_DECLINED");
    expect(exception.message).toBe("Card was declined");
    expect(exception.isRetryable).toBe(false);
    expect(exception.details).toEqual({ reason: "insufficient_funds" });
    expect(exception.requestId).toBe("req_123");
    expect(exception.timestamp).toBeDefined();
  });

  it("should extend Error", () => {
    const error = createError("TIMEOUT", "Request timed out");
    const exception = new PrimeFlowException(error);

    expect(exception instanceof Error).toBe(true);
    expect(exception.name).toBe("PrimeFlowException");
  });

  it("should serialize to JSON", () => {
    const error = createError("NETWORK_ERROR", "Connection failed");
    const exception = new PrimeFlowException(error);
    const json = exception.toJSON();

    expect(json.code).toBe("NETWORK_ERROR");
    expect(json.message).toBe("Connection failed");
    expect(json.isRetryable).toBe(true);
  });

  it("should have stack trace", () => {
    const error = createError("INTERNAL_ERROR", "Something went wrong");
    const exception = new PrimeFlowException(error);

    expect(exception.stack).toBeDefined();
    expect(exception.stack).toContain("PrimeFlowException");
  });
});

describe("createError", () => {
  it("should create error with required fields", () => {
    const error = createError("INVALID_INTENT", "Intent is invalid");

    expect(error.code).toBe("INVALID_INTENT");
    expect(error.message).toBe("Intent is invalid");
    expect(error.timestamp).toBeDefined();
  });

  it("should include optional details", () => {
    const error = createError(
      "REGION_NOT_ALLOWED",
      "Region blocked",
      { region: "RU" }
    );

    expect(error.details).toEqual({ region: "RU" });
  });

  it("should include request ID", () => {
    const error = createError(
      "TIMEOUT",
      "Request timed out",
      undefined,
      "req_abc123"
    );

    expect(error.requestId).toBe("req_abc123");
  });

  it("should set isRetryable based on error code", () => {
    // Retryable errors
    expect(createError("TIMEOUT", "").isRetryable).toBe(true);
    expect(createError("NETWORK_ERROR", "").isRetryable).toBe(true);
    expect(createError("SERVICE_UNAVAILABLE", "").isRetryable).toBe(true);
    expect(createError("RATE_LIMITED", "").isRetryable).toBe(true);
    expect(createError("INTERNAL_ERROR", "").isRetryable).toBe(true);
    expect(createError("LAYER403_ERROR", "").isRetryable).toBe(true);

    // Non-retryable errors
    expect(createError("PAYMENT_DECLINED", "").isRetryable).toBe(false);
    expect(createError("INSUFFICIENT_FUNDS", "").isRetryable).toBe(false);
    expect(createError("INVALID_INTENT", "").isRetryable).toBe(false);
    expect(createError("REGION_NOT_ALLOWED", "").isRetryable).toBe(false);
    expect(createError("FRAUD_DETECTED", "").isRetryable).toBe(false);
  });
});

describe("wrapError", () => {
  it("should pass through PrimeFlowException", () => {
    const original = new PrimeFlowException(
      createError("PAYMENT_DECLINED", "Declined")
    );

    const wrapped = wrapError(original);

    expect(wrapped.code).toBe("PAYMENT_DECLINED");
  });

  it("should wrap timeout errors", () => {
    const error = new Error("Request timeout exceeded");
    error.message = "ETIMEDOUT: connection timed out";

    const wrapped = wrapError(error);

    expect(wrapped.code).toBe("TIMEOUT");
  });

  it("should wrap network errors", () => {
    const error = new Error("ECONNREFUSED: connection refused");
    const wrapped = wrapError(error);

    expect(wrapped.code).toBe("NETWORK_ERROR");
  });

  it("should wrap DNS errors", () => {
    const error = new Error("ENOTFOUND: getaddrinfo failed");
    const wrapped = wrapError(error);

    expect(wrapped.code).toBe("NETWORK_ERROR");
  });

  it("should wrap unknown errors", () => {
    const error = new Error("Something unexpected happened");
    const wrapped = wrapError(error);

    expect(wrapped.code).toBe("UNKNOWN_ERROR");
    expect(wrapped.message).toBe("Something unexpected happened");
  });

  it("should wrap non-Error objects", () => {
    const wrapped = wrapError("string error");

    expect(wrapped.code).toBe("UNKNOWN_ERROR");
    expect(wrapped.message).toBe("string error");
  });

  it("should include request ID", () => {
    const error = new Error("test");
    const wrapped = wrapError(error, "req_xyz");

    expect(wrapped.requestId).toBe("req_xyz");
  });

  it("should include stack trace in details", () => {
    const error = new Error("test error");
    const wrapped = wrapError(error);

    expect(wrapped.details?.stack).toBeDefined();
  });
});

describe("isRetryableError", () => {
  it("should return true for retryable PrimeFlowError", () => {
    const error = createError("TIMEOUT", "Timed out");
    expect(isRetryableError(error)).toBe(true);
  });

  it("should return false for non-retryable PrimeFlowError", () => {
    const error = createError("PAYMENT_DECLINED", "Declined");
    expect(isRetryableError(error)).toBe(false);
  });

  it("should work with PrimeFlowException", () => {
    const retryable = new PrimeFlowException(createError("SERVICE_UNAVAILABLE", ""));
    const nonRetryable = new PrimeFlowException(createError("INVALID_INTENT", ""));

    expect(isRetryableError(retryable)).toBe(true);
    expect(isRetryableError(nonRetryable)).toBe(false);
  });
});

describe("httpStatusToErrorCode", () => {
  it("should map 400 to INVALID_INTENT", () => {
    expect(httpStatusToErrorCode(400)).toBe("INVALID_INTENT");
  });

  it("should map 401 to AUTHENTICATION_ERROR", () => {
    expect(httpStatusToErrorCode(401)).toBe("AUTHENTICATION_ERROR");
  });

  it("should map 403 to REGION_NOT_ALLOWED", () => {
    expect(httpStatusToErrorCode(403)).toBe("REGION_NOT_ALLOWED");
  });

  it("should map 404 to REGION_NOT_FOUND", () => {
    expect(httpStatusToErrorCode(404)).toBe("REGION_NOT_FOUND");
  });

  it("should map 408 to TIMEOUT", () => {
    expect(httpStatusToErrorCode(408)).toBe("TIMEOUT");
  });

  it("should map 429 to RATE_LIMITED", () => {
    expect(httpStatusToErrorCode(429)).toBe("RATE_LIMITED");
  });

  it("should map 5xx to SERVICE_UNAVAILABLE", () => {
    expect(httpStatusToErrorCode(500)).toBe("SERVICE_UNAVAILABLE");
    expect(httpStatusToErrorCode(502)).toBe("SERVICE_UNAVAILABLE");
    expect(httpStatusToErrorCode(503)).toBe("SERVICE_UNAVAILABLE");
    expect(httpStatusToErrorCode(504)).toBe("SERVICE_UNAVAILABLE");
  });

  it("should map unknown status to UNKNOWN_ERROR", () => {
    expect(httpStatusToErrorCode(418)).toBe("UNKNOWN_ERROR");
    expect(httpStatusToErrorCode(999)).toBe("UNKNOWN_ERROR");
  });
});
