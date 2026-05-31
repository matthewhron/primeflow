/**
 * Request signing for Layer-403 authentication
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface SignedRequest {
  /** Original headers with added auth headers */
  headers: Record<string, string>;
  /** Signature for verification */
  signature: string;
  /** Timestamp used for signing */
  timestamp: string;
  /** Nonce for replay protection */
  nonce: string;
}

export interface SignatureParams {
  method: string;
  path: string;
  body?: string;
  timestamp?: string;
  nonce?: string;
}

/**
 * Create HMAC-SHA256 signer
 */
export class RequestSigner {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly algorithm = "sha256";

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Sign a request
   */
  sign(params: SignatureParams): SignedRequest {
    const timestamp = params.timestamp ?? new Date().toISOString();
    const nonce = params.nonce ?? randomBytes(16).toString("hex");
    
    // Create signature payload
    const signaturePayload = this.createSignaturePayload(
      params.method,
      params.path,
      timestamp,
      nonce,
      params.body
    );

    // Generate HMAC signature
    const signature = this.computeHmac(signaturePayload);

    // Build auth headers
    const headers: Record<string, string> = {
      "X-PrimeFlow-Key": this.apiKey,
      "X-PrimeFlow-Timestamp": timestamp,
      "X-PrimeFlow-Nonce": nonce,
      "X-PrimeFlow-Signature": signature,
    };

    return {
      headers,
      signature,
      timestamp,
      nonce,
    };
  }

  /**
   * Verify a webhook signature
   */
  verifyWebhook(payload: string, signature: string, timestamp: string): boolean {
    // Check timestamp freshness (5 minute window)
    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (Math.abs(now - requestTime) > fiveMinutes) {
      return false;
    }

    // Compute expected signature
    const expectedPayload = `${timestamp}.${payload}`;
    const expectedSignature = this.computeHmac(expectedPayload);

    // Timing-safe comparison
    try {
      const sigBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");
      
      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Create signature payload string
   */
  private createSignaturePayload(
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    body?: string
  ): string {
    const parts = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce,
    ];

    if (body) {
      // Hash body for signature
      const bodyHash = createHmac(this.algorithm, this.apiSecret)
        .update(body)
        .digest("hex");
      parts.push(bodyHash);
    }

    return parts.join("\n");
  }

  /**
   * Compute HMAC-SHA256
   */
  private computeHmac(data: string): string {
    return createHmac(this.algorithm, this.apiSecret)
      .update(data)
      .digest("hex");
  }
}

/**
 * Generate random idempotency key
 */
export function generateIdempotencyKey(): string {
  return `idem_${randomBytes(16).toString("hex")}`;
}

/**
 * Generate request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${randomBytes(8).toString("hex")}`;
}
