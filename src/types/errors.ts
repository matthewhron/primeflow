/**
 * Error types and error handling
 */

export type PrimeFlowErrorCode =
  // Routing errors
  | "REGION_NOT_ALLOWED"
  | "REGION_NOT_FOUND"
  | "NO_AVAILABLE_REGIONS"
  | "REGION_LIMIT_EXCEEDED"
  | "METHOD_NOT_SUPPORTED"
  
  // Payment errors
  | "PAYMENT_DECLINED"
  | "INSUFFICIENT_FUNDS"
  | "CARD_EXPIRED"
  | "INVALID_CARD"
  | "FRAUD_DETECTED"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  
  // Network/System errors
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  
  // Validation errors
  | "INVALID_INTENT"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_AMOUNT"
  | "INVALID_CURRENCY"
  | "INVALID_TOKEN"
  
  // Compliance errors
  | "SANCTIONS_BLOCKED"
  | "KYC_REQUIRED"
  | "COMPLIANCE_REJECTED"
  
  // Layer-403 errors
  | "LAYER403_ERROR"
  | "INVALID_SIGNATURE"
  | "AUTHENTICATION_ERROR"
  
  // Generic
  | "UNKNOWN_ERROR";

export interface PrimeFlowError {
  /** Error code for programmatic handling */
  code: PrimeFlowErrorCode;
  /** Human-readable error message */
  message: string;
  /** Whether this error can be retried/fallback */
  isRetryable: boolean;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Original error if wrapped */
  cause?: Error;
  /** Timestamp of error */
  timestamp: string;
  /** Request ID for debugging */
  requestId?: string;
}

/**
 * Map of retryable error codes
 */
const RETRYABLE_CODES: Set<PrimeFlowErrorCode> = new Set([
  "TIMEOUT",
  "NETWORK_ERROR",
  "SERVICE_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "LAYER403_ERROR",
]);

/**
 * Custom error class for PrimeFlow errors
 */
export class PrimeFlowException extends Error {
  readonly code: PrimeFlowErrorCode;
  readonly isRetryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly timestamp: string;
  readonly requestId?: string;

  constructor(error: PrimeFlowError) {
    super(error.message);
    this.name = "PrimeFlowException";
    this.code = error.code;
    this.isRetryable = error.isRetryable;
    this.details = error.details;
    this.timestamp = error.timestamp;
    this.requestId = error.requestId;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PrimeFlowException);
    }
  }

  toJSON(): PrimeFlowError {
    return {
      code: this.code,
      message: this.message,
      isRetryable: this.isRetryable,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
    };
  }
}

/**
 * Create a PrimeFlowError object
 */
export function createError(
  code: PrimeFlowErrorCode,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string
): PrimeFlowError {
  return {
    code,
    message,
    isRetryable: RETRYABLE_CODES.has(code),
    details,
    timestamp: new Date().toISOString(),
    requestId,
  };
}

/**
 * Wrap unknown error into PrimeFlowError
 */
export function wrapError(error: unknown, requestId?: string): PrimeFlowError {
  if (error instanceof PrimeFlowException) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
      return createError("TIMEOUT", error.message, undefined, requestId);
    }
    
    if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
      return createError("NETWORK_ERROR", error.message, undefined, requestId);
    }

    return createError("UNKNOWN_ERROR", error.message, { stack: error.stack }, requestId);
  }

  return createError("UNKNOWN_ERROR", String(error), undefined, requestId);
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: PrimeFlowError | PrimeFlowException): boolean {
  if (error instanceof PrimeFlowException) {
    return error.isRetryable;
  }
  return error.isRetryable;
}

/**
 * Map HTTP status to error code
 */
export function httpStatusToErrorCode(status: number): PrimeFlowErrorCode {
  switch (status) {
    case 400:
      return "INVALID_INTENT";
    case 401:
      return "AUTHENTICATION_ERROR";
    case 403:
      return "REGION_NOT_ALLOWED";
    case 404:
      return "REGION_NOT_FOUND";
    case 408:
      return "TIMEOUT";
    case 429:
      return "RATE_LIMITED";
    case 500:
    case 502:
    case 503:
    case 504:
      return "SERVICE_UNAVAILABLE";
    default:
      return "UNKNOWN_ERROR";
  }
}
