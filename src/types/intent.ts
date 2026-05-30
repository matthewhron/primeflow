/**
 * Payment intent types
 */

export type PaymentMethod = 
  | "card" 
  | "bank_transfer" 
  | "wallet" 
  | "sepa" 
  | "ach" 
  | "apple_pay" 
  | "google_pay"
  | "pix"
  | "boleto";

export type Currency = string; // ISO 4217 (USD, EUR, BRL, etc.)

export interface PaymentIntent {
  /** External payment ID from merchant */
  id: string;
  /** Payment amount in smallest currency unit or decimal */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: Currency;
  /** Payment method type */
  paymentMethod: PaymentMethod;
  /** User's country code (ISO 3166-1 alpha-2) */
  userCountry?: string;
  /** User's IP address for geo/risk detection */
  userIp?: string;
  /** Merchant's country code */
  merchantCountry?: string;
  /** Card token (PCI-safe, no raw card data) */
  cardToken?: string;
  /** Bank account token for bank transfers */
  bankToken?: string;
  /** Wallet identifier for wallet payments */
  walletId?: string;
  /** KYC verification token if required */
  kycToken?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Customer email for notifications */
  customerEmail?: string;
  /** Customer name */
  customerName?: string;
  /** Order description */
  description?: string;
  /** Statement descriptor */
  statementDescriptor?: string;
  /** Return URL after 3DS/redirect */
  returnUrl?: string;
  /** Webhook URL for async notifications */
  webhookUrl?: string;
}

export interface RefundIntent {
  /** Original payment intent ID */
  paymentIntentId: string;
  /** Provider payment ID from original transaction */
  providerPaymentId: string;
  /** Refund amount (partial refund if less than original) */
  amount?: number;
  /** Refund reason */
  reason?: RefundReason;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type RefundReason = 
  | "requested_by_customer"
  | "duplicate"
  | "fraudulent"
  | "product_not_received"
  | "product_unacceptable"
  | "other";

export interface PaymentIntentValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate payment intent structure
 */
export function validatePaymentIntent(intent: PaymentIntent): PaymentIntentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!intent.id || typeof intent.id !== "string") {
    errors.push("Missing or invalid 'id' field");
  }

  if (typeof intent.amount !== "number" || intent.amount <= 0) {
    errors.push("Amount must be a positive number");
  }

  if (!intent.currency || typeof intent.currency !== "string" || intent.currency.length !== 3) {
    errors.push("Currency must be a valid ISO 4217 code");
  }

  if (!intent.paymentMethod) {
    errors.push("Payment method is required");
  }

  // Payment method specific validations
  if (intent.paymentMethod === "card" && !intent.cardToken) {
    errors.push("Card token is required for card payments");
  }

  if (intent.paymentMethod === "bank_transfer" && !intent.bankToken) {
    warnings.push("Bank token recommended for bank transfers");
  }

  // Optional but recommended
  if (!intent.userCountry) {
    warnings.push("User country not provided - routing may be suboptimal");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
