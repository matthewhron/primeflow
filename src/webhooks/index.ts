/**
 * Webhooks Manager Module
 * Advanced webhook handling with retries and queuing
 */

import type { WebhookPayload, WebhookEventType } from "../types/index.js";

export interface WebhookEndpoint {
  /** Endpoint ID */
  id: string;
  /** Webhook URL */
  url: string;
  /** Secret for signing */
  secret: string;
  /** Subscribed events */
  events: WebhookEventType[] | "*";
  /** Is active */
  active: boolean;
  /** Created at */
  createdAt: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface WebhookDelivery {
  /** Delivery ID */
  id: string;
  /** Endpoint ID */
  endpointId: string;
  /** Payload */
  payload: WebhookPayload;
  /** Status */
  status: "pending" | "delivered" | "failed" | "retrying";
  /** Attempts */
  attempts: number;
  /** Last attempt at */
  lastAttemptAt?: string;
  /** Next retry at */
  nextRetryAt?: string;
  /** Response status */
  responseStatus?: number;
  /** Response body */
  responseBody?: string;
  /** Error message */
  error?: string;
  /** Created at */
  createdAt: string;
  /** Delivered at */
  deliveredAt?: string;
}

export interface WebhookManagerConfig {
  /** Max retry attempts */
  maxRetries?: number;
  /** Initial retry delay in ms */
  initialRetryDelayMs?: number;
  /** Max retry delay in ms */
  maxRetryDelayMs?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Signing algorithm */
  signingAlgorithm?: "sha256" | "sha512";
  /** Include timestamp in signature */
  includeTimestamp?: boolean;
  /** Custom headers */
  customHeaders?: Record<string, string>;
  /** On delivery success */
  onDeliverySuccess?: (delivery: WebhookDelivery) => void;
  /** On delivery failure */
  onDeliveryFailure?: (delivery: WebhookDelivery) => void;
}

/**
 * Generate HMAC signature
 */
async function generateSignature(
  payload: string,
  secret: string,
  algorithm: "sha256" | "sha512" = "sha256"
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm === "sha256" ? "SHA-256" : "SHA-512" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Webhook manager
 */
export class WebhookManager {
  private endpoints = new Map<string, WebhookEndpoint>();
  private deliveryQueue: WebhookDelivery[] = [];
  private config: Required<WebhookManagerConfig>;
  private processingTimer?: ReturnType<typeof setInterval>;

  constructor(config?: WebhookManagerConfig) {
    this.config = {
      maxRetries: config?.maxRetries ?? 5,
      initialRetryDelayMs: config?.initialRetryDelayMs ?? 1000,
      maxRetryDelayMs: config?.maxRetryDelayMs ?? 3600000,
      timeoutMs: config?.timeoutMs ?? 30000,
      signingAlgorithm: config?.signingAlgorithm ?? "sha256",
      includeTimestamp: config?.includeTimestamp ?? true,
      customHeaders: config?.customHeaders ?? {},
      onDeliverySuccess: config?.onDeliverySuccess ?? (() => {}),
      onDeliveryFailure: config?.onDeliveryFailure ?? (() => {}),
    };
  }

  /**
   * Register a webhook endpoint
   */
  registerEndpoint(endpoint: Omit<WebhookEndpoint, "id" | "createdAt">): WebhookEndpoint {
    const id = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const created: WebhookEndpoint = {
      ...endpoint,
      id,
      createdAt: new Date().toISOString(),
    };
    this.endpoints.set(id, created);
    return created;
  }

  /**
   * Update endpoint
   */
  updateEndpoint(id: string, updates: Partial<WebhookEndpoint>): WebhookEndpoint | null {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) return null;

    const updated = { ...endpoint, ...updates, id };
    this.endpoints.set(id, updated);
    return updated;
  }

  /**
   * Remove endpoint
   */
  removeEndpoint(id: string): boolean {
    return this.endpoints.delete(id);
  }

  /**
   * Get endpoint
   */
  getEndpoint(id: string): WebhookEndpoint | undefined {
    return this.endpoints.get(id);
  }

  /**
   * List all endpoints
   */
  listEndpoints(): WebhookEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Send webhook to all subscribed endpoints
   */
  async send(payload: WebhookPayload): Promise<WebhookDelivery[]> {
    const deliveries: WebhookDelivery[] = [];

    for (const endpoint of this.endpoints.values()) {
      if (!endpoint.active) continue;
      if (endpoint.events !== "*" && !endpoint.events.includes(payload.type)) continue;

      const delivery = await this.createDelivery(endpoint, payload);
      deliveries.push(delivery);
    }

    return deliveries;
  }

  /**
   * Create and attempt delivery
   */
  private async createDelivery(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: `whd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      endpointId: endpoint.id,
      payload,
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    // Attempt immediate delivery
    await this.attemptDelivery(delivery, endpoint);

    return delivery;
  }

  /**
   * Attempt to deliver webhook
   */
  private async attemptDelivery(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint
  ): Promise<void> {
    delivery.attempts++;
    delivery.lastAttemptAt = new Date().toISOString();

    try {
      const payloadString = JSON.stringify(delivery.payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      // Generate signature
      const signaturePayload = this.config.includeTimestamp
        ? `${timestamp}.${payloadString}`
        : payloadString;
      const signature = await generateSignature(
        signaturePayload,
        endpoint.secret,
        this.config.signingAlgorithm
      );

      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-ID": delivery.id,
        ...this.config.customHeaders,
      };

      if (this.config.includeTimestamp) {
        headers["X-Webhook-Timestamp"] = timestamp;
      }

      // Send request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      delivery.responseStatus = response.status;
      
      try {
        delivery.responseBody = await response.text();
      } catch {
        delivery.responseBody = "";
      }

      if (response.ok) {
        delivery.status = "delivered";
        delivery.deliveredAt = new Date().toISOString();
        this.config.onDeliverySuccess(delivery);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      delivery.error = error instanceof Error ? error.message : "Unknown error";

      if (delivery.attempts >= this.config.maxRetries) {
        delivery.status = "failed";
        this.config.onDeliveryFailure(delivery);
      } else {
        delivery.status = "retrying";
        const delay = this.calculateRetryDelay(delivery.attempts);
        delivery.nextRetryAt = new Date(Date.now() + delay).toISOString();
        this.deliveryQueue.push(delivery);
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.config.initialRetryDelayMs * Math.pow(2, attempt - 1);
    const jitter = delay * 0.1 * Math.random();
    return Math.min(delay + jitter, this.config.maxRetryDelayMs);
  }

  /**
   * Process retry queue
   */
  async processRetryQueue(): Promise<number> {
    const now = Date.now();
    let processed = 0;

    const toProcess = this.deliveryQueue.filter((d) => {
      if (!d.nextRetryAt) return false;
      return new Date(d.nextRetryAt).getTime() <= now;
    });

    for (const delivery of toProcess) {
      const endpoint = this.endpoints.get(delivery.endpointId);
      if (!endpoint) {
        delivery.status = "failed";
        delivery.error = "Endpoint not found";
        continue;
      }

      await this.attemptDelivery(delivery, endpoint);
      processed++;

      // Remove from queue if no longer retrying
      if (delivery.status !== "retrying") {
        const index = this.deliveryQueue.indexOf(delivery);
        if (index !== -1) {
          this.deliveryQueue.splice(index, 1);
        }
      }
    }

    return processed;
  }

  /**
   * Start automatic retry processing
   */
  startProcessing(intervalMs: number = 60000): void {
    if (this.processingTimer) return;

    this.processingTimer = setInterval(() => {
      this.processRetryQueue().catch((err) => {
        console.error("Webhook retry processing error:", err);
      });
    }, intervalMs);
  }

  /**
   * Stop automatic processing
   */
  stopProcessing(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  /**
   * Get pending deliveries
   */
  getPendingDeliveries(): WebhookDelivery[] {
    return this.deliveryQueue.filter((d) => d.status === "retrying");
  }

  /**
   * Get delivery stats
   */
  getStats(): {
    endpoints: number;
    activeEndpoints: number;
    pendingDeliveries: number;
  } {
    return {
      endpoints: this.endpoints.size,
      activeEndpoints: Array.from(this.endpoints.values()).filter((e) => e.active).length,
      pendingDeliveries: this.deliveryQueue.length,
    };
  }

  /**
   * Manually retry a delivery
   */
  async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveryQueue.find((d) => d.id === deliveryId);
    if (!delivery) return false;

    const endpoint = this.endpoints.get(delivery.endpointId);
    if (!endpoint) return false;

    delivery.status = "pending";
    await this.attemptDelivery(delivery, endpoint);
    return true;
  }

  /**
   * Test endpoint connectivity
   */
  async testEndpoint(endpointId: string): Promise<{
    success: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) {
      return { success: false, latencyMs: 0, error: "Endpoint not found" };
    }

    const testPayload: WebhookPayload = {
      type: "payment.succeeded",
      id: "test_" + Date.now(),
      timestamp: new Date().toISOString(),
      data: {
        intentId: "test",
        status: "test",
        amount: 0,
        currency: "USD",
        region: "test",
        routerId: "test",
      },
      signature: "",
    };

    const start = Date.now();

    try {
      const payloadString = JSON.stringify(testPayload);
      const signature = await generateSignature(payloadString, endpoint.secret);

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Test": "true",
        },
        body: payloadString,
      });

      return {
        success: response.ok,
        latencyMs: Date.now() - start,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

/**
 * Create webhook manager
 */
export function createWebhookManager(config?: WebhookManagerConfig): WebhookManager {
  return new WebhookManager(config);
}

/**
 * Webhook signature verifier for incoming webhooks
 */
export class WebhookVerifier {
  private secret: string;
  private algorithm: "sha256" | "sha512";
  private timestampTolerance: number;

  constructor(secret: string, options?: {
    algorithm?: "sha256" | "sha512";
    timestampToleranceSeconds?: number;
  }) {
    this.secret = secret;
    this.algorithm = options?.algorithm ?? "sha256";
    this.timestampTolerance = (options?.timestampToleranceSeconds ?? 300) * 1000;
  }

  /**
   * Verify webhook signature
   */
  async verify(
    payload: string,
    signature: string,
    timestamp?: string
  ): Promise<{ valid: boolean; error?: string }> {
    // Check timestamp if provided
    if (timestamp) {
      const ts = parseInt(timestamp, 10) * 1000;
      const age = Math.abs(Date.now() - ts);
      if (age > this.timestampTolerance) {
        return { valid: false, error: "Timestamp expired" };
      }
    }

    // Generate expected signature
    const signaturePayload = timestamp ? `${timestamp}.${payload}` : payload;
    const expected = await generateSignature(signaturePayload, this.secret, this.algorithm);

    // Constant-time comparison
    if (signature.length !== expected.length) {
      return { valid: false, error: "Invalid signature" };
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }

    if (result !== 0) {
      return { valid: false, error: "Invalid signature" };
    }

    return { valid: true };
  }

  /**
   * Verify and parse payload
   */
  async verifyAndParse<T = WebhookPayload>(
    payload: string,
    signature: string,
    timestamp?: string
  ): Promise<{ valid: boolean; data?: T; error?: string }> {
    const verification = await this.verify(payload, signature, timestamp);
    
    if (!verification.valid) {
      return verification;
    }

    try {
      const data = JSON.parse(payload) as T;
      return { valid: true, data };
    } catch {
      return { valid: false, error: "Invalid JSON payload" };
    }
  }
}

/**
 * Create webhook verifier
 */
export function createWebhookVerifier(
  secret: string,
  options?: { algorithm?: "sha256" | "sha512"; timestampToleranceSeconds?: number }
): WebhookVerifier {
  return new WebhookVerifier(secret, options);
}
