/**
 * Payment Links Module
 *
 * Generate shareable payment links for one-time or recurring payments.
 * Supports expiration, metadata, and custom branding.
 *
 * @module payment-links
 */

import { generateRequestId } from "../layer403/signer.js";

/**
 * Payment link status
 */
export type PaymentLinkStatus = "active" | "expired" | "completed" | "canceled";

/**
 * Payment link configuration
 */
export interface PaymentLinkConfig {
  /** Base URL for payment links (e.g., "https://pay.example.com") */
  baseUrl: string;
  /** Default expiration time in seconds (default: 24 hours) */
  defaultExpirationSeconds?: number;
  /** Secret key for signing links */
  signingSecret?: string;
}

/**
 * Options for creating a payment link
 */
export interface CreatePaymentLinkOptions {
  /** Amount in smallest currency unit (e.g., cents) */
  amount: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Description shown to the payer */
  description?: string;
  /** Custom expiration time in seconds */
  expirationSeconds?: number;
  /** Custom metadata attached to the link */
  metadata?: Record<string, string>;
  /** Allowed payment methods */
  allowedMethods?: string[];
  /** Customer email for receipts */
  customerEmail?: string;
  /** URL to redirect after successful payment */
  successUrl?: string;
  /** URL to redirect after canceled payment */
  cancelUrl?: string;
}

/**
 * Payment link object
 */
export interface PaymentLink {
  /** Unique link ID */
  id: string;
  /** Full payment URL */
  url: string;
  /** Short code for the link */
  shortCode: string;
  /** Amount in smallest unit */
  amount: number;
  /** Currency code */
  currency: string;
  /** Link description */
  description?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Expiration timestamp */
  expiresAt: Date;
  /** Current status */
  status: PaymentLinkStatus;
  /** Attached metadata */
  metadata?: Record<string, string>;
  /** Allowed payment methods */
  allowedMethods?: string[];
  /** Customer email */
  customerEmail?: string;
  /** Success redirect URL */
  successUrl?: string;
  /** Cancel redirect URL */
  cancelUrl?: string;
}

/**
 * Generates a short alphanumeric code
 */
function generateShortCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Simple HMAC-like signature for link verification
 */
function signPayload(payload: string, secret: string): string {
  let hash = 0;
  const combined = payload + secret;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Payment Links Manager
 *
 * @example
 * ```typescript
 * const links = new PaymentLinksManager({
 *   baseUrl: "https://pay.mystore.com",
 *   defaultExpirationSeconds: 3600, // 1 hour
 * });
 *
 * const link = links.create({
 *   amount: 2500,
 *   currency: "USD",
 *   description: "Premium subscription",
 * });
 *
 * console.log(link.url); // https://pay.mystore.com/p/AbC123xY
 * ```
 */
export class PaymentLinksManager {
  private config: Required<PaymentLinkConfig>;
  private links: Map<string, PaymentLink> = new Map();

  constructor(config: PaymentLinkConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      defaultExpirationSeconds: config.defaultExpirationSeconds ?? 86400,
      signingSecret: config.signingSecret ?? "default-secret",
    };
  }

  /**
   * Create a new payment link
   */
  create(options: CreatePaymentLinkOptions): PaymentLink {
    const id = generateRequestId();
    const shortCode = generateShortCode();
    const now = new Date();
    const expirationMs =
      (options.expirationSeconds ?? this.config.defaultExpirationSeconds) *
      1000;

    const link: PaymentLink = {
      id,
      shortCode,
      url: `${this.config.baseUrl}/p/${shortCode}`,
      amount: options.amount,
      currency: options.currency.toUpperCase(),
      description: options.description,
      createdAt: now,
      expiresAt: new Date(now.getTime() + expirationMs),
      status: "active",
      metadata: options.metadata,
      allowedMethods: options.allowedMethods,
      customerEmail: options.customerEmail,
      successUrl: options.successUrl,
      cancelUrl: options.cancelUrl,
    };

    this.links.set(shortCode, link);
    return link;
  }

  /**
   * Get a payment link by short code
   */
  get(shortCode: string): PaymentLink | undefined {
    const link = this.links.get(shortCode);
    if (link && this.isExpired(link)) {
      link.status = "expired";
    }
    return link;
  }

  /**
   * Get a payment link by ID
   */
  getById(id: string): PaymentLink | undefined {
    for (const link of this.links.values()) {
      if (link.id === id) {
        if (this.isExpired(link)) {
          link.status = "expired";
        }
        return link;
      }
    }
    return undefined;
  }

  /**
   * Check if a link is expired
   */
  isExpired(link: PaymentLink): boolean {
    return new Date() > link.expiresAt;
  }

  /**
   * Check if a link is valid for payment
   */
  isValid(shortCode: string): boolean {
    const link = this.get(shortCode);
    return link !== undefined && link.status === "active" && !this.isExpired(link);
  }

  /**
   * Mark a link as completed (after successful payment)
   */
  complete(shortCode: string): boolean {
    const link = this.links.get(shortCode);
    if (link && link.status === "active") {
      link.status = "completed";
      return true;
    }
    return false;
  }

  /**
   * Cancel a payment link
   */
  cancel(shortCode: string): boolean {
    const link = this.links.get(shortCode);
    if (link && link.status === "active") {
      link.status = "canceled";
      return true;
    }
    return false;
  }

  /**
   * List all payment links with optional status filter
   */
  list(status?: PaymentLinkStatus): PaymentLink[] {
    const links: PaymentLink[] = [];
    for (const link of this.links.values()) {
      if (this.isExpired(link) && link.status === "active") {
        link.status = "expired";
      }
      if (!status || link.status === status) {
        links.push(link);
      }
    }
    return links.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Generate a signed URL for secure link verification
   */
  generateSignedUrl(link: PaymentLink): string {
    const payload = `${link.shortCode}:${link.amount}:${link.currency}`;
    const signature = signPayload(payload, this.config.signingSecret);
    return `${link.url}?sig=${signature}`;
  }

  /**
   * Verify a signed URL
   */
  verifySignature(shortCode: string, signature: string): boolean {
    const link = this.get(shortCode);
    if (!link) return false;
    const payload = `${link.shortCode}:${link.amount}:${link.currency}`;
    const expected = signPayload(payload, this.config.signingSecret);
    return signature === expected;
  }

  /**
   * Clean up expired links
   */
  cleanup(): number {
    let removed = 0;
    for (const [code, link] of this.links.entries()) {
      if (
        link.status === "expired" ||
        link.status === "completed" ||
        link.status === "canceled"
      ) {
        this.links.delete(code);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Get statistics about payment links
   */
  getStats(): {
    total: number;
    active: number;
    expired: number;
    completed: number;
    canceled: number;
  } {
    const stats = { total: 0, active: 0, expired: 0, completed: 0, canceled: 0 };
    for (const link of this.links.values()) {
      stats.total++;
      if (this.isExpired(link) && link.status === "active") {
        link.status = "expired";
      }
      stats[link.status]++;
    }
    return stats;
  }
}

/**
 * Create a payment links manager instance
 */
export function createPaymentLinksManager(
  config: PaymentLinkConfig
): PaymentLinksManager {
  return new PaymentLinksManager(config);
}
