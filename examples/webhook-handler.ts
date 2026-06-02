/**
 * Webhook handling example
 * 
 * This example demonstrates how to properly handle
 * webhooks from Layer-403 for async payment notifications.
 */

import express, { Request, Response } from "express";
import { PrimeFlow, WebhookPayload, WebhookEventType } from "prime-flow";

const app = express();

// Initialize PrimeFlow
const primeflow = new PrimeFlow({
  layer403: {
    baseUrl: process.env.LAYER403_URL!,
    apiKey: process.env.PRIMEFLOW_API_KEY!,
    apiSecret: process.env.PRIMEFLOW_API_SECRET!,
  },
});

// ===========================================
// Webhook Handler Types
// ===========================================

interface PaymentSucceededData {
  intentId: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  region: string;
  routerId: string;
  metadata?: Record<string, unknown>;
}

interface PaymentFailedData {
  intentId: string;
  error: {
    code: string;
    message: string;
  };
  region: string;
  metadata?: Record<string, unknown>;
}

interface RefundData {
  intentId: string;
  refundId: string;
  amount: number;
  currency: string;
  status: string;
}

// ===========================================
// Database Mock (replace with your database)
// ===========================================

const orders: Map<string, { status: string; paymentId?: string }> = new Map();

async function updateOrderStatus(
  orderId: string, 
  status: string, 
  paymentId?: string
): Promise<void> {
  console.log(`Updating order ${orderId} to status: ${status}`);
  orders.set(orderId, { status, paymentId });
}

async function getOrder(orderId: string) {
  return orders.get(orderId);
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  console.log(`Sending email to ${to}: ${subject}`);
  // Implement your email sending logic
}

// ===========================================
// Webhook Route Setup
// ===========================================

// IMPORTANT: Use raw body for signature verification
// Must be before express.json() middleware
app.post(
  "/webhooks/primeflow",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["x-primeflow-signature"] as string;
    const timestamp = req.headers["x-primeflow-timestamp"] as string;
    const rawBody = req.body.toString("utf-8");

    // Step 1: Verify signature
    if (!signature || !timestamp) {
      console.error("Missing signature headers");
      res.status(401).json({ error: "Missing signature" });
      return;
    }

    const isValid = primeflow.verifyWebhook(rawBody, signature, timestamp);
    
    if (!isValid) {
      console.error("Invalid webhook signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    // Step 2: Parse webhook payload
    let webhook: WebhookPayload;
    try {
      webhook = JSON.parse(rawBody);
    } catch (error) {
      console.error("Failed to parse webhook body");
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    console.log(`Received webhook: ${webhook.type} (${webhook.id})`);

    // Step 3: Handle event based on type
    try {
      await handleWebhookEvent(webhook);
      
      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ received: true, id: webhook.id });
    } catch (error) {
      console.error("Error processing webhook:", error);
      
      // Return 500 to trigger retry from Layer-403
      res.status(500).json({ error: "Processing failed" });
    }
  }
);

// ===========================================
// Event Handlers
// ===========================================

async function handleWebhookEvent(webhook: WebhookPayload): Promise<void> {
  const { type, data, id, timestamp } = webhook;

  // Idempotency check - prevent duplicate processing
  if (await wasEventProcessed(id)) {
    console.log(`Event ${id} already processed, skipping`);
    return;
  }

  switch (type) {
    case "payment.succeeded":
      await handlePaymentSucceeded(data as unknown as PaymentSucceededData);
      break;

    case "payment.failed":
      await handlePaymentFailed(data as unknown as PaymentFailedData);
      break;

    case "payment.pending":
      await handlePaymentPending(data);
      break;

    case "payment.refunded":
      await handlePaymentRefunded(data as unknown as RefundData);
      break;

    case "refund.succeeded":
      await handleRefundSucceeded(data as unknown as RefundData);
      break;

    case "refund.failed":
      await handleRefundFailed(data as unknown as RefundData);
      break;

    default:
      console.warn(`Unknown webhook type: ${type}`);
  }

  // Mark event as processed
  await markEventProcessed(id);
}

async function handlePaymentSucceeded(data: PaymentSucceededData): Promise<void> {
  const { intentId, providerPaymentId, amount, currency, region, metadata } = data;
  
  console.log(`Payment succeeded: ${intentId}`);
  console.log(`  Provider ID: ${providerPaymentId}`);
  console.log(`  Amount: ${amount} ${currency}`);
  console.log(`  Region: ${region}`);

  // Update order status
  await updateOrderStatus(intentId, "paid", providerPaymentId);

  // Send confirmation email
  const customerEmail = metadata?.customerEmail as string;
  if (customerEmail) {
    await sendEmail(
      customerEmail,
      "Payment Confirmed",
      `Your payment of ${amount} ${currency} has been processed.`
    );
  }

  // Trigger fulfillment
  await triggerFulfillment(intentId);
}

async function handlePaymentFailed(data: PaymentFailedData): Promise<void> {
  const { intentId, error, region } = data;
  
  console.log(`Payment failed: ${intentId}`);
  console.log(`  Error: ${error.code} - ${error.message}`);
  console.log(`  Region: ${region}`);

  // Update order status
  await updateOrderStatus(intentId, "failed");

  // Notify customer
  // Be careful not to expose internal error details
  const userMessage = getUserFriendlyErrorMessage(error.code);
  
  // You might want to send an email or push notification
  console.log(`User message: ${userMessage}`);
}

async function handlePaymentPending(data: WebhookPayload["data"]): Promise<void> {
  const { intentId } = data;
  
  console.log(`Payment pending: ${intentId}`);
  
  // Update status to show payment is processing
  await updateOrderStatus(intentId, "processing");
}

async function handlePaymentRefunded(data: RefundData): Promise<void> {
  const { intentId, amount, currency } = data;
  
  console.log(`Payment refunded: ${intentId}`);
  console.log(`  Amount: ${amount} ${currency}`);

  // Update order status
  await updateOrderStatus(intentId, "refunded");
}

async function handleRefundSucceeded(data: RefundData): Promise<void> {
  const { intentId, refundId, amount, currency } = data;
  
  console.log(`Refund succeeded: ${refundId} for payment ${intentId}`);
  
  // Update refund record
  // Send confirmation to customer
}

async function handleRefundFailed(data: RefundData): Promise<void> {
  const { intentId, refundId } = data;
  
  console.log(`Refund failed: ${refundId} for payment ${intentId}`);
  
  // Alert operations team
  // May need manual intervention
}

// ===========================================
// Helper Functions
// ===========================================

// Idempotency tracking (use Redis or database in production)
const processedEvents = new Set<string>();

async function wasEventProcessed(eventId: string): Promise<boolean> {
  return processedEvents.has(eventId);
}

async function markEventProcessed(eventId: string): Promise<void> {
  processedEvents.add(eventId);
}

async function triggerFulfillment(orderId: string): Promise<void> {
  console.log(`Triggering fulfillment for order: ${orderId}`);
  // Implement your fulfillment logic
}

function getUserFriendlyErrorMessage(errorCode: string): string {
  const messages: Record<string, string> = {
    PAYMENT_DECLINED: "Your payment was declined. Please try a different card.",
    INSUFFICIENT_FUNDS: "Insufficient funds. Please use a different payment method.",
    CARD_EXPIRED: "Your card has expired. Please update your payment details.",
    FRAUD_DETECTED: "Payment could not be processed. Please contact support.",
    AUTHENTICATION_FAILED: "Card authentication failed. Please try again.",
  };

  return messages[errorCode] ?? "Payment could not be processed. Please try again.";
}

// ===========================================
// Server Setup
// ===========================================

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/primeflow`);
  console.log("");
  console.log("To test webhooks locally, use ngrok:");
  console.log("  ngrok http 3000");
  console.log("Then configure Layer-403 with your ngrok URL.");
});
