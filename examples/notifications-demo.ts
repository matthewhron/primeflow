/**
 * Notifications Demo
 * Shows how to set up multi-channel notifications for payment events
 */

import {
  createNotificationManager,
  createEmailAdapter,
  createTelegramAdapter,
  createSlackAdapter,
  createDiscordAdapter,
  createWebhookAdapter,
  type NotificationChannel,
  type NotificationEventType,
  type NotificationRecipient,
  type PaymentResult,
} from "../src/index.js";

// =============================================================================
// Setup Notification Manager
// =============================================================================

async function main() {
  console.log("🔔 Notifications Demo\n");

  // Create notification manager with configuration
  const notifications = createNotificationManager({
    // Enable queue for async sending with retries
    useQueue: true,
    queueConfig: {
      maxRetries: 3,
      retryDelayMs: 1000,
    },
    // Default merchant info for all notifications
    merchant: {
      name: "PrimeFlow Demo Store",
      supportEmail: "support@primeflow-demo.com",
      supportUrl: "https://primeflow-demo.com/support",
    },
    // Callbacks
    onSent: (result) => {
      console.log(`✅ Notification sent: ${result.notificationId} via ${result.channel}`);
    },
    onFailed: (result, notification) => {
      console.log(`❌ Notification failed: ${result.error}`);
    },
  });

  // =============================================================================
  // Register Channel Adapters
  // =============================================================================

  // Email adapter (would use nodemailer in production)
  const emailAdapter = createEmailAdapter({
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: {
      user: "notifications@example.com",
      pass: "password",
    },
    from: "PrimeFlow <notifications@primeflow-demo.com>",
    replyTo: "support@primeflow-demo.com",
  });
  notifications.registerAdapter(emailAdapter);

  // Telegram adapter
  const telegramAdapter = createTelegramAdapter({
    botToken: process.env.TELEGRAM_BOT_TOKEN || "your-bot-token",
    parseMode: "HTML",
  });
  notifications.registerAdapter(telegramAdapter);

  // Slack adapter
  const slackAdapter = createSlackAdapter({
    webhookUrl: process.env.SLACK_WEBHOOK_URL || "https://hooks.slack.com/services/xxx",
    defaultChannel: "#payments",
  });
  notifications.registerAdapter(slackAdapter);

  // Discord adapter
  const discordAdapter = createDiscordAdapter({
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/xxx",
  });
  notifications.registerAdapter(discordAdapter);

  // Generic webhook adapter
  const webhookAdapter = createWebhookAdapter({
    url: "https://your-server.com/webhooks/payments",
    signingSecret: "your-signing-secret",
    timeoutMs: 10000,
  });
  notifications.registerAdapter(webhookAdapter);

  // =============================================================================
  // Configure Event → Channel Mapping
  // =============================================================================

  // Customer-facing notifications
  notifications.setEventChannels("payment.succeeded", ["email", "telegram"]);
  notifications.setEventChannels("payment.failed", ["email", "telegram"]);
  notifications.setEventChannels("refund.succeeded", ["email"]);

  // Internal/Team notifications
  notifications.setEventChannels("fraud.high_risk", ["slack", "discord"]);
  notifications.setEventChannels("fraud.blocked", ["slack", "discord"]);

  // System notifications via webhook
  notifications.setEventChannels("payment.pending", ["webhook"]);

  // =============================================================================
  // Add System Recipients (for team notifications)
  // =============================================================================

  // Slack channel for fraud alerts
  notifications.addSystemRecipient("slack", {
    address: "#fraud-alerts",
    name: "Fraud Team",
  });

  // Discord channel for the same
  notifications.addSystemRecipient("discord", {
    address: "1234567890123456789", // Discord channel ID
    name: "Fraud Alerts",
  });

  // =============================================================================
  // Register Custom Templates
  // =============================================================================

  // Custom template for Russian locale
  notifications.registerTemplate({
    id: "payment_succeeded_email_ru",
    event: "payment.succeeded",
    channel: "email",
    locale: "ru",
    subject: "Платёж подтверждён - {{payment_formatted}}",
    body: `Здравствуйте!

Ваш платёж на сумму {{payment_formatted}} успешно обработан.

ID платежа: {{payment_id}}
Дата: {{date}} в {{time}}

Спасибо за покупку!

{{merchant_name}}`,
  });

  // Custom Telegram template with emoji
  notifications.registerTemplate({
    id: "payment_succeeded_telegram_custom",
    event: "payment.succeeded",
    channel: "telegram",
    body: `🎉 <b>Оплата прошла успешно!</b>

💰 Сумма: <b>{{payment_formatted}}</b>
🆔 ID: <code>{{payment_id}}</code>
📅 Дата: {{date}}
🌍 Регион: {{payment_region}}

Спасибо, что выбрали нас! 🙏`,
  });

  // =============================================================================
  // Demo: Send Notifications
  // =============================================================================

  console.log("📤 Sending demo notifications...\n");

  // Simulate a successful payment
  const paymentResult: PaymentResult = {
    intentId: "pi_demo_123456",
    status: "succeeded",
    regionUsed: "EU",
    routerId: "stripe_eu",
    providerPaymentId: "ch_xxx123",
    costApplied: 0.029,
    amountCharged: 99.99,
    currencyCharged: "EUR",
    processedAt: new Date().toISOString(),
    receiptUrl: "https://receipt.stripe.com/xxx",
    authCode: "AUTH123",
    attempts: [
      {
        attemptNumber: 1,
        region: "EU",
        routerId: "stripe_eu",
        status: "succeeded",
        timestamp: new Date().toISOString(),
        durationMs: 245,
      },
    ],
    idempotencyKey: "idem_demo_123",
  };

  // Customer recipient
  const customer: NotificationRecipient = {
    address: "customer@example.com",
    name: "John Doe",
    locale: "en",
  };

  // Send notifications for the payment event
  console.log("1️⃣ Sending payment.succeeded notifications to customer...");
  const results = await notifications.sendForEvent(
    "payment.succeeded",
    { payment: paymentResult },
    customer
  );

  console.log(`   Sent ${results.length} notification(s)\n`);

  // =============================================================================
  // Demo: Send Direct Notification
  // =============================================================================

  console.log("2️⃣ Sending direct Telegram notification...");

  const telegramResult = await notifications.send(
    "telegram",
    { address: "123456789", name: "Admin" },
    {
      event: "payment.succeeded",
      timestamp: new Date().toISOString(),
      payment: paymentResult,
      merchant: { name: "PrimeFlow Demo" },
    },
    { priority: "high" }
  );

  console.log(`   Status: ${telegramResult.status}\n`);

  // =============================================================================
  // Demo: Fraud Alert
  // =============================================================================

  console.log("3️⃣ Sending fraud alert to team channels...");

  const fraudResults = await notifications.sendForEvent("fraud.high_risk", {
    payment: {
      ...paymentResult,
      intentId: "pi_suspicious_789",
      amountCharged: 9999.99,
    },
    data: {
      risk_score: 85,
      signals: ["high_amount", "new_customer", "velocity_ip"],
    },
  });

  console.log(`   Sent ${fraudResults.length} alert(s) to team channels\n`);

  // =============================================================================
  // Demo: Batch Notifications
  // =============================================================================

  console.log("4️⃣ Sending batch notifications...");

  const batchResults = await notifications.sendBatch([
    {
      channel: "email",
      recipient: { address: "user1@example.com", name: "User 1" },
      payload: {
        event: "payment.succeeded",
        timestamp: new Date().toISOString(),
        payment: paymentResult,
      },
    },
    {
      channel: "email",
      recipient: { address: "user2@example.com", name: "User 2" },
      payload: {
        event: "payment.succeeded",
        timestamp: new Date().toISOString(),
        payment: paymentResult,
      },
    },
    {
      channel: "telegram",
      recipient: { address: "987654321" },
      payload: {
        event: "payment.succeeded",
        timestamp: new Date().toISOString(),
        payment: paymentResult,
      },
    },
  ]);

  console.log(`   Sent ${batchResults.length} notification(s)\n`);

  // =============================================================================
  // Queue Stats
  // =============================================================================

  console.log("📊 Queue Stats:");
  const stats = notifications.getQueueStats();
  console.log(`   Pending: ${stats.pending}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   Processing: ${stats.processing}\n`);

  // Cleanup
  notifications.stop();
  console.log("✨ Demo complete!");
}

// =============================================================================
// Integration with PrimeFlow Example
// =============================================================================

async function integrationExample() {
  console.log("\n🔗 Integration Example\n");

  // In a real application, you'd integrate notifications with the payment flow:

  /*
  import { PrimeFlow, createNotificationManager } from "prime-flow";

  const client = new PrimeFlow({ apiKey: "..." });
  const notifications = createNotificationManager({ ... });

  // After processing payment
  const payment = await client.pay(intent, quotes);

  if (payment.status === "succeeded") {
    await notifications.sendForEvent("payment.succeeded", 
      { payment },
      { address: customer.email, name: customer.name }
    );
  } else if (payment.status === "failed") {
    await notifications.sendForEvent("payment.failed",
      { payment },
      { address: customer.email, name: customer.name }
    );
  }

  // For fraud detection integration
  client.events.on("fraud:high_risk", async (assessment, context) => {
    await notifications.sendForEvent("fraud.high_risk", {
      data: { 
        risk_score: assessment.score,
        signals: assessment.signals.map(s => s.name),
      },
    });
  });
  */

  console.log("See code comments for integration patterns.");
}

// Run demo
main().catch(console.error);
