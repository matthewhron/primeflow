/**
 * Layer-403 HTTP client
 */

import type { Layer403Config } from "../types/config.js";
import type { PaymentIntent, RefundIntent } from "../types/intent.js";
import type { RegionQuote } from "../types/quote.js";
import type { PaymentResult, RefundResult } from "../types/payment.js";
import type { RegionInfo } from "../types/index.js";
import { 
  createError, 
  wrapError, 
  httpStatusToErrorCode, 
  PrimeFlowException 
} from "../types/errors.js";
import { RequestSigner, generateRequestId } from "./signer.js";

export interface Layer403Response<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}

export interface QuoteRequest {
  intent: PaymentIntent;
  regions?: string[];
  includeUnavailable?: boolean;
}

export interface PayRequest {
  intent: PaymentIntent;
  region: string;
  routerId: string;
  idempotencyKey: string;
}

export interface RefundRequest {
  refundIntent: RefundIntent;
  region: string;
  idempotencyKey: string;
}

/**
 * Layer-403 gateway client
 */
export class Layer403Client {
  private readonly config: Required<Layer403Config>;
  private readonly signer: RequestSigner;
  private readonly baseUrl: string;

  constructor(config: Layer403Config) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""), // Remove trailing slash
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      timeoutMs: config.timeoutMs ?? 8000,
      customHeaders: config.customHeaders ?? {},
    };

    this.baseUrl = this.config.baseUrl;
    this.signer = new RequestSigner(config.apiKey, config.apiSecret);
  }

  /**
   * Get available regions
   */
  async getRegions(): Promise<RegionInfo[]> {
    const response = await this.request<RegionInfo[]>("GET", "/regions");
    return response.data ?? [];
  }

  /**
   * Get quotes for payment intent
   */
  async getQuotes(request: QuoteRequest): Promise<RegionQuote[]> {
    const response = await this.request<{ quotes: RegionQuote[] }>(
      "POST",
      "/quote",
      request
    );
    return response.data?.quotes ?? [];
  }

  /**
   * Execute payment
   */
  async executePayment(request: PayRequest): Promise<PaymentResult> {
    const response = await this.request<PaymentResult>(
      "POST",
      "/pay",
      request,
      {
        "X-PrimeFlow-Region": request.region,
        "X-Idempotency-Key": request.idempotencyKey,
      }
    );

    if (!response.success || !response.data) {
      throw new PrimeFlowException(
        createError(
          "LAYER403_ERROR",
          response.error?.message ?? "Payment failed",
          response.error?.details,
          response.requestId
        )
      );
    }

    return response.data;
  }

  /**
   * Execute refund
   */
  async executeRefund(request: RefundRequest): Promise<RefundResult> {
    const response = await this.request<RefundResult>(
      "POST",
      "/refund",
      request,
      {
        "X-PrimeFlow-Region": request.region,
        "X-Idempotency-Key": request.idempotencyKey,
      }
    );

    if (!response.success || !response.data) {
      throw new PrimeFlowException(
        createError(
          "LAYER403_ERROR",
          response.error?.message ?? "Refund failed",
          response.error?.details,
          response.requestId
        )
      );
    }

    return response.data;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string, timestamp: string): boolean {
    return this.signer.verifyWebhook(payload, signature, timestamp);
  }

  /**
   * Make authenticated request to Layer-403
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<Layer403Response<T>> {
    const requestId = generateRequestId();
    const url = `${this.baseUrl}${path}`;
    const bodyString = body ? JSON.stringify(body) : undefined;

    // Sign request
    const signed = this.signer.sign({
      method,
      path,
      body: bodyString,
    });

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Request-ID": requestId,
      ...this.config.customHeaders,
      ...signed.headers,
      ...extraHeaders,
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response
      const responseText = await response.text();
      let data: Layer403Response<T>;

      try {
        data = JSON.parse(responseText) as Layer403Response<T>;
      } catch {
        // Non-JSON response
        throw new PrimeFlowException(
          createError(
            "LAYER403_ERROR",
            `Invalid response from Layer-403: ${responseText.substring(0, 100)}`,
            { status: response.status },
            requestId
          )
        );
      }

      // Handle HTTP errors
      if (!response.ok) {
        const errorCode = httpStatusToErrorCode(response.status);
        throw new PrimeFlowException(
          createError(
            errorCode,
            data.error?.message ?? `HTTP ${response.status}`,
            {
              status: response.status,
              ...data.error?.details,
            },
            requestId
          )
        );
      }

      return {
        ...data,
        requestId,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof PrimeFlowException) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw new PrimeFlowException(
          createError(
            "TIMEOUT",
            `Request timed out after ${this.config.timeoutMs}ms`,
            { url, method },
            requestId
          )
        );
      }

      // Wrap other errors
      throw new PrimeFlowException(wrapError(error, requestId));
    }
  }
}

/**
 * Create Layer-403 client instance
 */
export function createLayer403Client(config: Layer403Config): Layer403Client {
  return new Layer403Client(config);
}
