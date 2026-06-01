/**
 * Express middleware for PrimeFlow
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { generateIdempotencyKey } from "../layer403/signer.js";

declare global {
  namespace Express {
    interface Request {
      primeflow?: {
        idempotencyKey: string;
        requestId: string;
        startTime: number;
      };
    }
  }
}

export interface PrimeFlowMiddlewareOptions {
  /** Header name for idempotency key */
  idempotencyHeader?: string;
  /** Header name for request ID */
  requestIdHeader?: string;
  /** Generate idempotency key if not provided */
  autoGenerateIdempotencyKey?: boolean;
}

const DEFAULT_OPTIONS: Required<PrimeFlowMiddlewareOptions> = {
  idempotencyHeader: "X-Idempotency-Key",
  requestIdHeader: "X-Request-ID",
  autoGenerateIdempotencyKey: true,
};

/**
 * Create PrimeFlow middleware for Express
 * 
 * Adds request tracking and idempotency key handling
 */
export function createPrimeFlowMiddleware(
  options: PrimeFlowMiddlewareOptions = {}
): RequestHandler {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, _res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Get or generate idempotency key
    let idempotencyKey = req.headers[opts.idempotencyHeader.toLowerCase()] as string;
    if (!idempotencyKey && opts.autoGenerateIdempotencyKey) {
      idempotencyKey = generateIdempotencyKey();
    }

    // Get or generate request ID
    let requestId = req.headers[opts.requestIdHeader.toLowerCase()] as string;
    if (!requestId) {
      requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }

    // Attach to request
    req.primeflow = {
      idempotencyKey,
      requestId,
      startTime,
    };

    next();
  };
}

/**
 * Webhook verification middleware
 * 
 * Verifies webhook signatures from Layer-403
 */
export function createWebhookVerificationMiddleware(
  verifyFn: (payload: string, signature: string, timestamp: string) => boolean,
  options?: {
    signatureHeader?: string;
    timestampHeader?: string;
    onFailure?: (req: Request, res: Response) => void;
  }
): RequestHandler {
  const signatureHeader = options?.signatureHeader ?? "X-PrimeFlow-Signature";
  const timestampHeader = options?.timestampHeader ?? "X-PrimeFlow-Timestamp";

  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers[signatureHeader.toLowerCase()] as string;
    const timestamp = req.headers[timestampHeader.toLowerCase()] as string;

    if (!signature || !timestamp) {
      if (options?.onFailure) {
        options.onFailure(req, res);
      } else {
        res.status(401).json({ error: "Missing signature or timestamp" });
      }
      return;
    }

    // Get raw body (requires express.raw() or similar middleware)
    let payload: string;
    if (typeof req.body === "string") {
      payload = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      payload = req.body.toString("utf-8");
    } else {
      payload = JSON.stringify(req.body);
    }

    const isValid = verifyFn(payload, signature, timestamp);

    if (!isValid) {
      if (options?.onFailure) {
        options.onFailure(req, res);
      } else {
        res.status(401).json({ error: "Invalid signature" });
      }
      return;
    }

    next();
  };
}

/**
 * Error handling middleware for PrimeFlowException
 */
export function createErrorMiddleware(): (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (err: Error, _req: Request, res: Response, next: NextFunction): void => {
    // Check if it's a PrimeFlowException
    if ("code" in err && "isRetryable" in err) {
      const primeFlowError = err as unknown as {
        code: string;
        message: string;
        isRetryable: boolean;
        details?: Record<string, unknown>;
      };

      res.status(getStatusFromCode(primeFlowError.code)).json({
        error: {
          code: primeFlowError.code,
          message: primeFlowError.message,
          retryable: primeFlowError.isRetryable,
          details: primeFlowError.details,
        },
      });
      return;
    }

    // Pass to default error handler
    next(err);
  };
}

/**
 * Map error codes to HTTP status
 */
function getStatusFromCode(code: string): number {
  const statusMap: Record<string, number> = {
    INVALID_INTENT: 400,
    MISSING_REQUIRED_FIELD: 400,
    INVALID_AMOUNT: 400,
    INVALID_CURRENCY: 400,
    INVALID_TOKEN: 400,
    AUTHENTICATION_ERROR: 401,
    INVALID_SIGNATURE: 401,
    REGION_NOT_ALLOWED: 403,
    SANCTIONS_BLOCKED: 403,
    COMPLIANCE_REJECTED: 403,
    REGION_NOT_FOUND: 404,
    NO_AVAILABLE_REGIONS: 404,
    TIMEOUT: 408,
    RATE_LIMITED: 429,
    PAYMENT_DECLINED: 402,
    INSUFFICIENT_FUNDS: 402,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  };

  return statusMap[code] ?? 500;
}
