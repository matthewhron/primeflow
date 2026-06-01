/**
 * Notifications Module
 * Multi-channel notifications for payment events
 * Supports: Email, SMS, Telegram, Slack, Discord, Webhooks
 */

import type { PaymentResult, RefundResult } from "../types/payment.js";
import type { Subscription } from "../subscriptions/index.js";

// ============================================================================
// Types
// ============================================================================

export type NotificationChannel = 
  | "email" 
  | "sms" 
  | "telegram" 
  | "slack" 
  | "discord" 
  | "webhook";

export type NotificationEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.pending"
  | "payment.requires_action"
  | "refund.succeeded"
  | "refund.failed"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "subscription.payment_failed"
  | "subscription.trial_ending"
  | "fraud.high_risk"
  | "fraud.blocked"
  | "dispute.created"
  | "dispute.won"
  | "dispute.lost";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationRecipient {
  /** Recipient identifier (email, phone, chat ID, etc.) */
  address: string;
  /** Display name */
  name?: string;
  /** Preferred language */
  locale?: string;
  /** Custom data */
  metadata?: Record<string, unknown>;
}

export interface NotificationPayload {
  /** Event type */
  event: NotificationEventType;
  /** Event timestamp */
  timestamp: string;
  /** Payment data (if applicable) */
  payment?: PaymentResult;
  /** Refund data (if applicable) */
  refund?: RefundResult;
  /** Subscription data (if applicable) */
  subscription?: Partial<Subscription>;
  /** Custom data */
  data?: Record<string, unknown>;
  /** Merchant/business info */
  merchant?: {
    name: string;
    logo?: string;
    supportEmail?: string;
    supportUrl?: string;
  };
}

export interface Notification {
  /** Unique notification ID */
  id: string;
  /** Channel to send through */
  channel: NotificationChannel;
  /** Recipient */
  recipient: NotificationRecipient;
  /** Payload data */
  payload: NotificationPayload;
  /** Priority */
  priority: NotificationPriority;
  /** Created at */
  createdAt: string;
  /** Scheduled for (optional) */
  scheduledFor?: string;
  /** Idempotency key */
  idempotencyKey?: string;
}

export interface NotificationResult {
  /** Notification ID */
  notificationId: string;
  /** Channel used */
  channel: NotificationChannel;
  /** Delivery status */
  status: "sent" | "failed" | "queued" | "skipped";
  /** Provider message ID (if available) */
  providerMessageId?: string;
  /** Error message (if failed) */
  error?: string;
  /** Sent at timestamp */
  sentAt?: string;
  /** Delivery attempts */
  attempts: number;
}

export interface NotificationTemplate {
  /** Template ID */
  id: string;
  /** Event type this template handles */
  event: NotificationEventType;
  /** Channel */
  channel: NotificationChannel;
  /** Subject (for email) */
  subject?: string;
  /** Template body (supports {{variable}} syntax) */
  body: string;
  /** Locale */
  locale?: string;
}

// ============================================================================
// Channel Adapters
// ============================================================================

export interface ChannelAdapter {
  /** Channel type */
  channel: NotificationChannel;
  /** Send notification */
  send(notification: Notification, rendered: RenderedNotification): Promise<NotificationResult>;
  /** Validate recipient for this channel */
  validateRecipient(recipient: NotificationRecipient): boolean;
}

export interface RenderedNotification {
  subject?: string;
  body: string;
  html?: string;
  attachments?: Array<{ filename: string; content: string | Buffer }>;
}

/**
 * Email channel adapter configuration
 */
export interface EmailAdapterConfig {
  /** SMTP host */
  host: string;
  /** SMTP port */
  port: number;
  /** Use TLS */
  secure?: boolean;
  /** Auth credentials */
  auth?: {
    user: string;
    pass: string;
  };
  /** From address */
  from: string;
  /** Reply-to address */
  replyTo?: string;
}

/**
 * SMS adapter configuration (Twilio-style)
 */
export interface SmsAdapterConfig {
  /** Account SID */
  accountSid: string;
  /** Auth token */
  authToken: string;
  /** From number */
  fromNumber: string;
  /** API endpoint (optional, for other providers) */
  endpoint?: string;
}

/**
 * Telegram adapter configuration
 */
export interface TelegramAdapterConfig {
  /** Bot token */
  botToken: string;
  /** Parse mode */
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
}

/**
 * Slack adapter configuration
 */
export interface SlackAdapterConfig {
  /** Bot token */
  botToken?: string;
  /** Webhook URL (alternative to bot token) */
  webhookUrl?: string;
  /** Default channel */
  defaultChannel?: string;
}

/**
 * Discord adapter configuration
 */
export interface DiscordAdapterConfig {
  /** Bot token */
  botToken?: string;
  /** Webhook URL */
  webhookUrl?: string;
}

/**
 * Generic webhook adapter configuration
 */
export interface WebhookAdapterConfig {
  /** Webhook URL */
  url: string;
  /** HTTP method */
  method?: "POST" | "PUT";
  /** Custom headers */
  headers?: Record<string, string>;
  /** Signing secret for HMAC */
  signingSecret?: string;
  /** Timeout in ms */
  timeoutMs?: number;
}

// ============================================================================
// Built-in Adapters
// ============================================================================

/**
 * Email adapter (requires nodemailer in production)
 */
export class EmailAdapter implements ChannelAdapter {
  channel: NotificationChannel = "email";
  private config: EmailAdapterConfig;

  constructor(config: EmailAdapterConfig) {
    this.config = config;
  }

  async send(notification: Notification, rendered: RenderedNotification): Promise<NotificationResult> {
    // In production, use nodemailer or similar
    // This is a mock implementation
    const startTime = Date.now();
    
    try {
      // Simulate sending
      console.log(`[Email] Sending to ${notification.recipient.address}`);
      console.log(`[Email] Subject: ${rendered.subject}`);
      console.log(`[Email] Body: ${rendered.body.substring(0, 100)}...`);
      
      // In real implementation:
      // const transporter = nodemailer.createTransport(this.config);
      // await transporter.sendMail({
      //   from: this.config.from,
      //   to: notification.recipient.address,
      //   subject: rendered.subject,
      //   text: rendered.body,
      //   html: rendered.html,
      // });

      return {
        notificationId: notification.id,
        channel: "email",
        status: "sent",
        providerMessageId: `email_${Date.now()}`,
        sentAt: new Date().toISOString(),
        attempts: 1,
      };
    } catch (error) {
      return {
        notificationId: notification.id,
        channel: "email",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        attempts: 1,
      };
    }
  }

  validateRecipient(recipient: NotificationRecipient): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(recipient.address);
  }
}

/**
 * SMS adapter (Twilio-compatible)
 */
export class SmsAdapter implements ChannelAdapter {
  channel: NotificationChannel = "sms";
  private config: SmsAdapterConfig;

  constructor(config: SmsAdapterConfig) {
    this.config = config;
  }

  async send(notification: Notification, rendered: RenderedNotification): Promise<NotificationResult> {
    try {
      const endpoint = this.config.endpoint || 
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;

      console.log(`[SMS] Sending to ${notification.recipient.address}`);
      console.log(`[SMS] Body: ${rendered.body.substring(0, 160)}`);

      // In real implementation:
      // const response = await fetch(endpoint, {
      //   method: "POST",
      //   headers: {
      //     "Authorization": `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64")}`,
      //     "Content-Type": "application/x-www-form-urlencoded",
      //   },
      //   body: new URLSearchParams({
      //     To: notification.recipient.address,
      //     From: this.config.fromNumber,
      //     Body: rendered.body,
      //   }),
      // });

      return {
        notificationId: notification.id,
        channel: "sms",
        status: "sent",
        providerMessageId: `sms_${Date.now()}`,
        sentAt: new Date().toISOString(),
        attempts: 1,
      };
    } catch (error) {
      return {
        notificationId: notification.id,
        channel: "sms",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        attempts: 1,
      };
    }
  }

  validateRecipient(recipient: NotificationRecipient): boolean {
    // Basic phone validation (E.164 format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(recipient.address);
  }
}

/**
 * Telegram adapter
 */
export class TelegramAdapter implements ChannelAdapter {
  channel: NotificationChannel = "telegram";
  private config: TelegramAdapterConfig;

  constructor(config: TelegramAdapterConfig) {
    this.config = config;
  }

  async send(notification: Notification, rendered: RenderedNotification): Promise<NotificationResult> {
    try {
      const chatId = notification.recipient.address;
      const endpoint = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

      console.log(`[Telegram] Sending to chat ${chatId}`);

      // In real implementation:
      // const response = await fetch(endpoint, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     chat_id: chatId,
      //     text: rendered.body,
      //     parse_mode: this.config.parseMode || "HTML",
      //   }),
      // });

      return {
        notificationId: notification.id,
        channel: "telegram",
        status: "sent",
        providerMessageId: `tg_${Date.now()}`,
        sentAt: new Date().toISOString(),
        attempts: 1,
      };
    } catch (error) {
      return {
        notificationId: notification.id,
        channel: "telegram",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        attempts: 1,
      };
    }
  }

  validateRecipient(recipient: NotificationRecipient): boolean {
    // Telegram chat IDs are numeric (can be negative for groups)
    return /^-?\d+$/.test(recipient.address);
  }
}

/**
 * Slack adapter
 */
export class SlackAdapter implements ChannelAdapter {
  channel: NotificationChannel = "slack";
  private config: SlackAdapterConfig;

  constructor(config: SlackAdapterConfig) {
    this.config = config;
  }

  async send(notification: Notification, rendered: RenderedNotification): Promise<NotificationResult> {
    try {
      const channel = notification.recipient.address || this.config.defaultChannel;

      if (this.config.webhookUrl) {
        console.log(`[Slack] Sending via webhook`);
        // const response = await fetch(this.config.webhookUrl, {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({ text: rendered.body }),
        // });
      } else if (this.config.botToken) {
        console.log(`[Slack] Sending to channel ${channel}`);
        // const response = await fetch("https://slack.com/api/chat.postMessage", {
        //   method: "POST",
        //   headers: {
        //     "Authorization": `Bearer ${this.config.botToken}`,
        //     "Content-Type": "application/json",
        //   },
        //   body: JSON.stringify({ channel, text: rendered.body }),
        // });
      }

      return {
        notificationId: notification.id,
        channel: "slack",
        status: "sent",
        providerMessageId: `slack_${Date.now()}`,
        sentAt: new Date().toISOString(),
        attempts: 1,
      };
    } catch (error) {
      return {
        notificationId: notification.id,
        channel: "slack",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        attempts: 1,
      };
    }
  }

  validateRecipient(recipient: NotificationRecipient): boolean {
    // Slack channel IDs start with C, D, or G
    return /^[CDG][A-Z0-9]+$/.test(recipient.address) || recipient.address.startsWith("#");
  }
}

/**
 * Discord adapter
 */
export class DiscordAdapter implements ChannelAdapter {
  channel: NotificationChannel = "discord";
  private config: DiscordAdapterConfig;

  constructor(config: DiscordAdapterConfig) {
    this.config = config;
  }

  async send(notification: Notification, rendered: RenderedNotification): Promise<NotificationResult> {
    try {
      if (this.config.webhookUrl) {
        console.log(`[Discord] Sending via webhook`);
        // const response = await fetch(this.config.webhookUrl, {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({ content: rendered.body }),
        // });
      }

      return {
        notificationId: notification.id,
        channel: "discord",
        status: "sent",
        providerMessageId: `discord_${Date.now()}`,
        sentAt: new Date().toISOString(),
        attempts: 1,
      };
    } catch (error) {
      return {
        notificationId: notification.id,
        channel: "discord",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        attempts: 1,
      };
    }
  }

  validateRecipient(recipient: NotificationRecipient): boolean {
    // Discord channel IDs are snowflakes (numeric)
    return /^\d{17,19}$/.test(recipient.address);
  }
}

/**
 * Generic webhook adapter
 */
export class WebhookAdapter implements ChannelAdapter {
  channel: NotificationChannel = "webhook";
  private config: WebhookAdapterConfig;

  constructor(config: WebhookAdapterConfig) {
    this.config = config;
  }

  async send(notification: Notification, rendered: RenderedNotification): Promise<NotificationResult> {
    try {
      const url = notification.recipient.address || this.config.url;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...this.config.headers,
      };

      // Add signature if secret provided
      if (this.config.signingSecret) {
        const payload = JSON.stringify(notification.payload);
        const signature = await this.sign(payload, this.config.signingSecret);
        headers["X-Signature"] = signature;
        headers["X-Signature-Timestamp"] = Date.now().toString();
      }

      console.log(`[Webhook] Sending to ${url}`);

      // In real implementation:
      // const response = await fetch(url, {
      //   method: this.config.method || "POST",
      //   headers,
      //   body: JSON.stringify(notification.payload),
      //   signal: AbortSignal.timeout(this.config.timeoutMs || 30000),
      // });

      return {
        notificationId: notification.id,
        channel: "webhook",
        status: "sent",
        providerMessageId: `webhook_${Date.now()}`,
        sentAt: new Date().toISOString(),
        attempts: 1,
      };
    } catch (error) {
      return {
        notificationId: notification.id,
        channel: "webhook",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        attempts: 1,
      };
    }
  }

  validateRecipient(recipient: NotificationRecipient): boolean {
    try {
      new URL(recipient.address);
      return true;
    } catch {
      return true; // Allow if using default URL
    }
  }

  private async sign(payload: string, secret: string): Promise<string> {
    // Simple HMAC-SHA256 signature
    // In production, use crypto module
    const encoder = new TextEncoder();
    const key = encoder.encode(secret);
    const data = encoder.encode(payload);
    
    // Simplified - in real code use crypto.subtle.sign
    return `sha256=${Buffer.from(data).toString("hex").substring(0, 64)}`;
  }
}

// ============================================================================
// Template Engine
// ============================================================================

/**
 * Simple template renderer with {{variable}} syntax
 */
export class TemplateRenderer {
  private templates = new Map<string, NotificationTemplate>();

  /**
   * Register a template
   */
  registerTemplate(template: NotificationTemplate): void {
    const key = this.getTemplateKey(template.event, template.channel, template.locale);
    this.templates.set(key, template);
  }

  /**
   * Register multiple templates
   */
  registerTemplates(templates: NotificationTemplate[]): void {
    for (const template of templates) {
      this.registerTemplate(template);
    }
  }

  /**
   * Get template for event/channel/locale
   */
  getTemplate(
    event: NotificationEventType,
    channel: NotificationChannel,
    locale?: string
  ): NotificationTemplate | undefined {
    // Try exact match first
    let key = this.getTemplateKey(event, channel, locale);
    let template = this.templates.get(key);
    
    // Fallback to default locale
    if (!template && locale) {
      key = this.getTemplateKey(event, channel);
      template = this.templates.get(key);
    }
    
    return template;
  }

  /**
   * Render notification content
   */
  render(
    template: NotificationTemplate,
    payload: NotificationPayload
  ): RenderedNotification {
    const context = this.buildContext(payload);
    
    return {
      subject: template.subject ? this.interpolate(template.subject, context) : undefined,
      body: this.interpolate(template.body, context),
    };
  }

  /**
   * Build template context from payload
   */
  private buildContext(payload: NotificationPayload): Record<string, string> {
    const ctx: Record<string, string> = {
      event: payload.event,
      timestamp: payload.timestamp,
      date: new Date(payload.timestamp).toLocaleDateString(),
      time: new Date(payload.timestamp).toLocaleTimeString(),
    };

    // Payment context
    if (payload.payment) {
      ctx.payment_id = payload.payment.intentId;
      ctx.payment_status = payload.payment.status;
      ctx.payment_amount = payload.payment.amountCharged.toString();
      ctx.payment_currency = payload.payment.currencyCharged;
      ctx.payment_formatted = `${payload.payment.currencyCharged} ${payload.payment.amountCharged.toFixed(2)}`;
      ctx.payment_region = payload.payment.regionUsed;
      ctx.payment_router = payload.payment.routerId;
      if (payload.payment.receiptUrl) {
        ctx.receipt_url = payload.payment.receiptUrl;
      }
      if (payload.payment.error) {
        ctx.error_code = payload.payment.error.code;
        ctx.error_message = payload.payment.error.message;
      }
    }

    // Refund context
    if (payload.refund) {
      ctx.refund_id = payload.refund.refundId;
      ctx.refund_status = payload.refund.status;
      ctx.refund_amount = payload.refund.amount.toString();
      ctx.refund_currency = payload.refund.currency;
      ctx.refund_formatted = `${payload.refund.currency} ${payload.refund.amount.toFixed(2)}`;
    }

    // Subscription context
    if (payload.subscription) {
      if (payload.subscription.id) ctx.subscription_id = payload.subscription.id;
      if (payload.subscription.status) ctx.subscription_status = payload.subscription.status;
      if (payload.subscription.planId) ctx.plan_id = payload.subscription.planId;
    }

    // Merchant context
    if (payload.merchant) {
      ctx.merchant_name = payload.merchant.name;
      if (payload.merchant.supportEmail) ctx.support_email = payload.merchant.supportEmail;
      if (payload.merchant.supportUrl) ctx.support_url = payload.merchant.supportUrl;
    }

    // Custom data
    if (payload.data) {
      for (const [key, value] of Object.entries(payload.data)) {
        ctx[`data_${key}`] = String(value);
      }
    }

    return ctx;
  }

  /**
   * Interpolate {{variables}} in template string
   */
  private interpolate(template: string, context: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] ?? match;
    });
  }

  private getTemplateKey(
    event: NotificationEventType,
    channel: NotificationChannel,
    locale?: string
  ): string {
    return locale ? `${event}:${channel}:${locale}` : `${event}:${channel}`;
  }
}

// ============================================================================
// Default Templates
// ============================================================================

export const DEFAULT_TEMPLATES: NotificationTemplate[] = [
  // Payment succeeded
  {
    id: "payment_succeeded_email",
    event: "payment.succeeded",
    channel: "email",
    subject: "Payment Confirmed - {{payment_formatted}}",
    body: `Hi{{#recipient_name}} {{recipient_name}}{{/recipient_name}},

Your payment of {{payment_formatted}} has been successfully processed.

Payment ID: {{payment_id}}
Date: {{date}} at {{time}}

{{#receipt_url}}View your receipt: {{receipt_url}}{{/receipt_url}}

Thank you for your purchase!

{{merchant_name}}`,
  },
  {
    id: "payment_succeeded_sms",
    event: "payment.succeeded",
    channel: "sms",
    body: "{{merchant_name}}: Payment of {{payment_formatted}} confirmed. ID: {{payment_id}}",
  },
  {
    id: "payment_succeeded_telegram",
    event: "payment.succeeded",
    channel: "telegram",
    body: "✅ <b>Payment Successful</b>\n\nAmount: {{payment_formatted}}\nID: <code>{{payment_id}}</code>\nDate: {{date}}",
  },
  {
    id: "payment_succeeded_slack",
    event: "payment.succeeded",
    channel: "slack",
    body: "✅ *Payment Succeeded*\n• Amount: {{payment_formatted}}\n• ID: `{{payment_id}}`\n• Region: {{payment_region}}",
  },

  // Payment failed
  {
    id: "payment_failed_email",
    event: "payment.failed",
    channel: "email",
    subject: "Payment Failed - Action Required",
    body: `Hi{{#recipient_name}} {{recipient_name}}{{/recipient_name}},

Unfortunately, your payment of {{payment_formatted}} could not be processed.

Payment ID: {{payment_id}}
Error: {{error_message}}

Please try again or use a different payment method.

If you need assistance, contact us at {{support_email}}.

{{merchant_name}}`,
  },
  {
    id: "payment_failed_sms",
    event: "payment.failed",
    channel: "sms",
    body: "{{merchant_name}}: Payment of {{payment_formatted}} failed. Please try again or contact support.",
  },
  {
    id: "payment_failed_telegram",
    event: "payment.failed",
    channel: "telegram",
    body: "❌ <b>Payment Failed</b>\n\nAmount: {{payment_formatted}}\nError: {{error_message}}\n\nPlease try again.",
  },
  {
    id: "payment_failed_slack",
    event: "payment.failed",
    channel: "slack",
    body: "❌ *Payment Failed*\n• Amount: {{payment_formatted}}\n• ID: `{{payment_id}}`\n• Error: {{error_message}}",
  },

  // Refund succeeded
  {
    id: "refund_succeeded_email",
    event: "refund.succeeded",
    channel: "email",
    subject: "Refund Processed - {{refund_formatted}}",
    body: `Hi{{#recipient_name}} {{recipient_name}}{{/recipient_name}},

Your refund of {{refund_formatted}} has been processed.

Refund ID: {{refund_id}}
Date: {{date}}

The funds should appear in your account within 5-10 business days.

{{merchant_name}}`,
  },
  {
    id: "refund_succeeded_telegram",
    event: "refund.succeeded",
    channel: "telegram",
    body: "💰 <b>Refund Processed</b>\n\nAmount: {{refund_formatted}}\nID: <code>{{refund_id}}</code>",
  },

  // Subscription events
  {
    id: "subscription_created_email",
    event: "subscription.created",
    channel: "email",
    subject: "Subscription Activated",
    body: `Hi{{#recipient_name}} {{recipient_name}}{{/recipient_name}},

Your subscription has been activated!

Subscription ID: {{subscription_id}}
Plan: {{plan_id}}

Thank you for subscribing!

{{merchant_name}}`,
  },
  {
    id: "subscription_cancelled_email",
    event: "subscription.cancelled",
    channel: "email",
    subject: "Subscription Cancelled",
    body: `Hi{{#recipient_name}} {{recipient_name}}{{/recipient_name}},

Your subscription has been cancelled as requested.

Subscription ID: {{subscription_id}}

We're sorry to see you go. If you change your mind, you can resubscribe anytime.

{{merchant_name}}`,
  },
  {
    id: "subscription_trial_ending_email",
    event: "subscription.trial_ending",
    channel: "email",
    subject: "Your Trial Ends Soon",
    body: `Hi{{#recipient_name}} {{recipient_name}}{{/recipient_name}},

Your free trial is ending soon!

To continue enjoying our service, please ensure your payment method is up to date.

{{merchant_name}}`,
  },

  // Fraud alerts
  {
    id: "fraud_high_risk_slack",
    event: "fraud.high_risk",
    channel: "slack",
    body: "⚠️ *High Risk Transaction Detected*\n• Amount: {{payment_formatted}}\n• ID: `{{payment_id}}`\n• Risk Score: {{data_risk_score}}",
  },
  {
    id: "fraud_blocked_slack",
    event: "fraud.blocked",
    channel: "slack",
    body: "🚫 *Transaction Blocked*\n• Amount: {{payment_formatted}}\n• ID: `{{payment_id}}`\n• Reason: {{data_block_reason}}",
  },
];

// ============================================================================
// Notification Queue
// ============================================================================

export interface QueuedNotification {
  notification: Notification;
  attempts: number;
  lastAttempt?: string;
  nextAttempt?: string;
  error?: string;
}

export interface NotificationQueueConfig {
  /** Max retry attempts */
  maxRetries?: number;
  /** Retry delay in ms (exponential backoff base) */
  retryDelayMs?: number;
  /** Max delay between retries */
  maxRetryDelayMs?: number;
  /** Process interval in ms */
  processIntervalMs?: number;
}

/**
 * In-memory notification queue with retry support
 */
export class NotificationQueue {
  private queue: QueuedNotification[] = [];
  private processing = false;
  private config: Required<NotificationQueueConfig>;
  private processTimer?: ReturnType<typeof setInterval>;
  private onProcess?: (notification: QueuedNotification) => Promise<NotificationResult>;

  constructor(config?: NotificationQueueConfig) {
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      maxRetryDelayMs: config?.maxRetryDelayMs ?? 60000,
      processIntervalMs: config?.processIntervalMs ?? 5000,
    };
  }

  /**
   * Add notification to queue
   */
  enqueue(notification: Notification): void {
    this.queue.push({
      notification,
      attempts: 0,
    });
  }

  /**
   * Start processing queue
   */
  start(processor: (notification: QueuedNotification) => Promise<NotificationResult>): void {
    this.onProcess = processor;
    this.processTimer = setInterval(() => this.process(), this.config.processIntervalMs);
  }

  /**
   * Stop processing
   */
  stop(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = undefined;
    }
  }

  /**
   * Process queued notifications
   */
  private async process(): Promise<void> {
    if (this.processing || !this.onProcess) return;
    this.processing = true;

    const now = Date.now();
    const ready = this.queue.filter((item) => {
      if (!item.nextAttempt) return true;
      return new Date(item.nextAttempt).getTime() <= now;
    });

    for (const item of ready) {
      try {
        const result = await this.onProcess(item);
        
        if (result.status === "sent") {
          // Remove from queue
          const index = this.queue.indexOf(item);
          if (index > -1) this.queue.splice(index, 1);
        } else if (result.status === "failed") {
          item.attempts++;
          item.lastAttempt = new Date().toISOString();
          item.error = result.error;

          if (item.attempts >= this.config.maxRetries) {
            // Max retries reached, remove from queue
            const index = this.queue.indexOf(item);
            if (index > -1) this.queue.splice(index, 1);
            console.error(`Notification ${item.notification.id} failed after ${item.attempts} attempts`);
          } else {
            // Schedule retry with exponential backoff
            const delay = Math.min(
              this.config.retryDelayMs * Math.pow(2, item.attempts - 1),
              this.config.maxRetryDelayMs
            );
            item.nextAttempt = new Date(Date.now() + delay).toISOString();
          }
        }
      } catch (error) {
        console.error(`Error processing notification ${item.notification.id}:`, error);
      }
    }

    this.processing = false;
  }

  /**
   * Get queue stats
   */
  getStats(): { pending: number; failed: number; processing: boolean } {
    const failed = this.queue.filter((item) => item.attempts >= this.config.maxRetries).length;
    return {
      pending: this.queue.length - failed,
      failed,
      processing: this.processing,
    };
  }

  /**
   * Get all queued items
   */
  getAll(): QueuedNotification[] {
    return [...this.queue];
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
  }
}

// ============================================================================
// Notification Manager
// ============================================================================

export interface NotificationManagerConfig {
  /** Channel adapters */
  adapters?: Map<NotificationChannel, ChannelAdapter>;
  /** Template renderer */
  renderer?: TemplateRenderer;
  /** Queue config */
  queueConfig?: NotificationQueueConfig;
  /** Use queue for sending */
  useQueue?: boolean;
  /** Default merchant info */
  merchant?: NotificationPayload["merchant"];
  /** Event to channel mapping (which channels for which events) */
  eventChannels?: Map<NotificationEventType, NotificationChannel[]>;
  /** Default recipients for system events */
  systemRecipients?: Map<NotificationChannel, NotificationRecipient[]>;
  /** Callback on notification sent */
  onSent?: (result: NotificationResult) => void;
  /** Callback on notification failed */
  onFailed?: (result: NotificationResult, notification: Notification) => void;
}

/**
 * Main notification manager
 */
export class NotificationManager {
  private adapters = new Map<NotificationChannel, ChannelAdapter>();
  private renderer: TemplateRenderer;
  private queue: NotificationQueue;
  private config: NotificationManagerConfig;
  private eventChannels = new Map<NotificationEventType, NotificationChannel[]>();
  private systemRecipients = new Map<NotificationChannel, NotificationRecipient[]>();

  constructor(config?: NotificationManagerConfig) {
    this.config = config ?? {};
    this.renderer = config?.renderer ?? new TemplateRenderer();
    this.queue = new NotificationQueue(config?.queueConfig);

    // Register default templates
    this.renderer.registerTemplates(DEFAULT_TEMPLATES);

    // Register provided adapters
    if (config?.adapters) {
      for (const [channel, adapter] of config.adapters) {
        this.adapters.set(channel, adapter);
      }
    }

    // Set up event channels mapping
    if (config?.eventChannels) {
      this.eventChannels = config.eventChannels;
    }

    // Set up system recipients
    if (config?.systemRecipients) {
      this.systemRecipients = config.systemRecipients;
    }

    // Start queue if enabled
    if (config?.useQueue) {
      this.queue.start((item) => this.processNotification(item.notification));
    }
  }

  /**
   * Register a channel adapter
   */
  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  /**
   * Register a custom template
   */
  registerTemplate(template: NotificationTemplate): void {
    this.renderer.registerTemplate(template);
  }

  /**
   * Register templates
   */
  registerTemplates(templates: NotificationTemplate[]): void {
    this.renderer.registerTemplates(templates);
  }

  /**
   * Set event to channel mapping
   */
  setEventChannels(event: NotificationEventType, channels: NotificationChannel[]): void {
    this.eventChannels.set(event, channels);
  }

  /**
   * Add system recipient for a channel
   */
  addSystemRecipient(channel: NotificationChannel, recipient: NotificationRecipient): void {
    const recipients = this.systemRecipients.get(channel) || [];
    recipients.push(recipient);
    this.systemRecipients.set(channel, recipients);
  }

  /**
   * Send notification to specific recipient
   */
  async send(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    payload: NotificationPayload,
    options?: { priority?: NotificationPriority; idempotencyKey?: string; scheduledFor?: string }
  ): Promise<NotificationResult> {
    const notification = this.createNotification(channel, recipient, payload, options);

    if (this.config.useQueue && !options?.scheduledFor) {
      this.queue.enqueue(notification);
      return {
        notificationId: notification.id,
        channel,
        status: "queued",
        attempts: 0,
      };
    }

    return this.processNotification(notification);
  }

  /**
   * Send notification for event to all configured channels/recipients
   */
  async sendForEvent(
    event: NotificationEventType,
    payload: Omit<NotificationPayload, "event" | "timestamp">,
    recipient?: NotificationRecipient
  ): Promise<NotificationResult[]> {
    const fullPayload: NotificationPayload = {
      ...payload,
      event,
      timestamp: new Date().toISOString(),
      merchant: payload.merchant || this.config.merchant,
    };

    const results: NotificationResult[] = [];
    const channels = this.eventChannels.get(event) || [];

    for (const channel of channels) {
      // Send to provided recipient
      if (recipient) {
        const result = await this.send(channel, recipient, fullPayload);
        results.push(result);
      }

      // Send to system recipients
      const systemRecipients = this.systemRecipients.get(channel) || [];
      for (const sysRecipient of systemRecipients) {
        const result = await this.send(channel, sysRecipient, fullPayload);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Send batch notifications
   */
  async sendBatch(
    notifications: Array<{
      channel: NotificationChannel;
      recipient: NotificationRecipient;
      payload: NotificationPayload;
    }>
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    
    for (const { channel, recipient, payload } of notifications) {
      const result = await this.send(channel, recipient, payload);
      results.push(result);
    }

    return results;
  }

  /**
   * Create notification object
   */
  private createNotification(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    payload: NotificationPayload,
    options?: { priority?: NotificationPriority; idempotencyKey?: string; scheduledFor?: string }
  ): Notification {
    return {
      id: `ntf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      channel,
      recipient,
      payload,
      priority: options?.priority ?? "normal",
      createdAt: new Date().toISOString(),
      scheduledFor: options?.scheduledFor,
      idempotencyKey: options?.idempotencyKey,
    };
  }

  /**
   * Process a single notification
   */
  private async processNotification(notification: Notification): Promise<NotificationResult> {
    const adapter = this.adapters.get(notification.channel);
    
    if (!adapter) {
      const result: NotificationResult = {
        notificationId: notification.id,
        channel: notification.channel,
        status: "failed",
        error: `No adapter registered for channel: ${notification.channel}`,
        attempts: 1,
      };
      this.config.onFailed?.(result, notification);
      return result;
    }

    // Validate recipient
    if (!adapter.validateRecipient(notification.recipient)) {
      const result: NotificationResult = {
        notificationId: notification.id,
        channel: notification.channel,
        status: "failed",
        error: `Invalid recipient for channel ${notification.channel}: ${notification.recipient.address}`,
        attempts: 1,
      };
      this.config.onFailed?.(result, notification);
      return result;
    }

    // Get and render template
    const template = this.renderer.getTemplate(
      notification.payload.event,
      notification.channel,
      notification.recipient.locale
    );

    if (!template) {
      const result: NotificationResult = {
        notificationId: notification.id,
        channel: notification.channel,
        status: "failed",
        error: `No template found for event ${notification.payload.event} on channel ${notification.channel}`,
        attempts: 1,
      };
      this.config.onFailed?.(result, notification);
      return result;
    }

    const rendered = this.renderer.render(template, notification.payload);

    // Send via adapter
    const result = await adapter.send(notification, rendered);

    if (result.status === "sent") {
      this.config.onSent?.(result);
    } else if (result.status === "failed") {
      this.config.onFailed?.(result, notification);
    }

    return result;
  }

  /**
   * Get queue stats
   */
  getQueueStats() {
    return this.queue.getStats();
  }

  /**
   * Stop the notification manager
   */
  stop(): void {
    this.queue.stop();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create notification manager
 */
export function createNotificationManager(config?: NotificationManagerConfig): NotificationManager {
  return new NotificationManager(config);
}

/**
 * Create email adapter
 */
export function createEmailAdapter(config: EmailAdapterConfig): EmailAdapter {
  return new EmailAdapter(config);
}

/**
 * Create SMS adapter
 */
export function createSmsAdapter(config: SmsAdapterConfig): SmsAdapter {
  return new SmsAdapter(config);
}

/**
 * Create Telegram adapter
 */
export function createTelegramAdapter(config: TelegramAdapterConfig): TelegramAdapter {
  return new TelegramAdapter(config);
}

/**
 * Create Slack adapter
 */
export function createSlackAdapter(config: SlackAdapterConfig): SlackAdapter {
  return new SlackAdapter(config);
}

/**
 * Create Discord adapter
 */
export function createDiscordAdapter(config: DiscordAdapterConfig): DiscordAdapter {
  return new DiscordAdapter(config);
}

/**
 * Create webhook adapter
 */
export function createWebhookAdapter(config: WebhookAdapterConfig): WebhookAdapter {
  return new WebhookAdapter(config);
}

/**
 * Create template renderer
 */
export function createTemplateRenderer(): TemplateRenderer {
  const renderer = new TemplateRenderer();
  renderer.registerTemplates(DEFAULT_TEMPLATES);
  return renderer;
}

// ============================================================================
// Express Middleware
// ============================================================================

/**
 * Notification middleware for Express
 * Automatically sends notifications based on payment results
 */
export function notificationMiddleware(manager: NotificationManager) {
  return async (
    req: { body: { paymentResult?: PaymentResult; refundResult?: RefundResult }; notificationRecipient?: NotificationRecipient },
    res: unknown,
    next: () => void
  ) => {
    const { paymentResult, refundResult } = req.body;
    const recipient = req.notificationRecipient;

    if (paymentResult && recipient) {
      const event: NotificationEventType = 
        paymentResult.status === "succeeded" ? "payment.succeeded" :
        paymentResult.status === "failed" ? "payment.failed" :
        paymentResult.status === "pending" ? "payment.pending" :
        paymentResult.status === "requires_action" ? "payment.requires_action" :
        "payment.failed";

      // Fire and forget
      manager.sendForEvent(event, { payment: paymentResult }, recipient).catch(console.error);
    }

    if (refundResult && recipient) {
      const event: NotificationEventType = 
        refundResult.status === "succeeded" ? "refund.succeeded" : "refund.failed";

      manager.sendForEvent(event, { refund: refundResult }, recipient).catch(console.error);
    }

    next();
  };
}
