/**
 * Subscriptions Module
 * Recurring payments and subscription management
 */

import type { PaymentIntent } from "../types/intent.js";
import type { PaymentResult } from "../types/payment.js";
import type { PrimeFlow } from "../client.js";

export type SubscriptionStatus = 
  | "active"
  | "paused"
  | "canceled"
  | "past_due"
  | "trialing";

export type BillingInterval = "daily" | "weekly" | "monthly" | "yearly" | "custom";

export interface SubscriptionPlan {
  /** Plan ID */
  id: string;
  /** Plan name */
  name: string;
  /** Amount per billing cycle */
  amount: number;
  /** Currency */
  currency: string;
  /** Billing interval */
  interval: BillingInterval;
  /** Custom interval in days (for 'custom' interval) */
  intervalDays?: number;
  /** Trial days */
  trialDays?: number;
  /** Max billing cycles (null = infinite) */
  maxCycles?: number | null;
  /** Plan metadata */
  metadata?: Record<string, unknown>;
}

export interface Subscription {
  /** Subscription ID */
  id: string;
  /** Customer ID */
  customerId: string;
  /** Plan ID */
  planId: string;
  /** Current status */
  status: SubscriptionStatus;
  /** Created at */
  createdAt: string;
  /** Started at (after trial) */
  startedAt?: string;
  /** Current period start */
  currentPeriodStart: string;
  /** Current period end */
  currentPeriodEnd: string;
  /** Next billing date */
  nextBillingDate?: string;
  /** Canceled at */
  canceledAt?: string;
  /** Canceled reason */
  cancelReason?: string;
  /** Paused at */
  pausedAt?: string;
  /** Resume at (for auto-resume) */
  resumeAt?: string;
  /** Current billing cycle */
  currentCycle: number;
  /** Total payments made */
  totalPayments: number;
  /** Total amount paid */
  totalPaid: number;
  /** Failed payment attempts */
  failedAttempts: number;
  /** Last payment result */
  lastPaymentResult?: PaymentResult;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface SubscriptionEvent {
  type: 
    | "subscription.created"
    | "subscription.started"
    | "subscription.renewed"
    | "subscription.paused"
    | "subscription.resumed"
    | "subscription.canceled"
    | "subscription.payment_failed"
    | "subscription.payment_succeeded"
    | "subscription.trial_ending";
  subscriptionId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface SubscriptionConfig {
  /** Max retry attempts for failed payments */
  maxRetryAttempts?: number;
  /** Days between retry attempts */
  retryIntervalDays?: number;
  /** Grace period days before marking past_due as canceled */
  gracePeriodDays?: number;
  /** Prorate on plan changes */
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
  /** Event handler */
  onEvent?: (event: SubscriptionEvent) => void | Promise<void>;
  /** Payment intent builder */
  buildPaymentIntent?: (subscription: Subscription, plan: SubscriptionPlan) => PaymentIntent;
}

/**
 * In-memory subscription store (replace with real DB in production)
 */
class SubscriptionStore {
  private subscriptions = new Map<string, Subscription>();
  private plans = new Map<string, SubscriptionPlan>();
  private byCustomer = new Map<string, Set<string>>();

  savePlan(plan: SubscriptionPlan): void {
    this.plans.set(plan.id, plan);
  }

  getPlan(id: string): SubscriptionPlan | undefined {
    return this.plans.get(id);
  }

  getAllPlans(): SubscriptionPlan[] {
    return Array.from(this.plans.values());
  }

  save(subscription: Subscription): void {
    this.subscriptions.set(subscription.id, subscription);
    
    // Index by customer
    if (!this.byCustomer.has(subscription.customerId)) {
      this.byCustomer.set(subscription.customerId, new Set());
    }
    this.byCustomer.get(subscription.customerId)!.add(subscription.id);
  }

  get(id: string): Subscription | undefined {
    return this.subscriptions.get(id);
  }

  getByCustomer(customerId: string): Subscription[] {
    const ids = this.byCustomer.get(customerId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.subscriptions.get(id))
      .filter((s): s is Subscription => s !== undefined);
  }

  getActive(): Subscription[] {
    return Array.from(this.subscriptions.values())
      .filter((s) => s.status === "active" || s.status === "past_due");
  }

  getDueForBilling(beforeDate: Date): Subscription[] {
    return this.getActive().filter((s) => {
      if (!s.nextBillingDate) return false;
      return new Date(s.nextBillingDate) <= beforeDate;
    });
  }

  delete(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (sub) {
      this.byCustomer.get(sub.customerId)?.delete(id);
      this.subscriptions.delete(id);
      return true;
    }
    return false;
  }
}

/**
 * Subscription manager
 */
export class SubscriptionManager {
  private client: PrimeFlow;
  private store = new SubscriptionStore();
  private config: Required<SubscriptionConfig>;
  private processingTimer?: ReturnType<typeof setInterval>;

  constructor(client: PrimeFlow, config?: SubscriptionConfig) {
    this.client = client;
    this.config = {
      maxRetryAttempts: config?.maxRetryAttempts ?? 4,
      retryIntervalDays: config?.retryIntervalDays ?? 3,
      gracePeriodDays: config?.gracePeriodDays ?? 14,
      prorationBehavior: config?.prorationBehavior ?? "none",
      onEvent: config?.onEvent ?? (() => {}),
      buildPaymentIntent: config?.buildPaymentIntent ?? this.defaultBuildIntent.bind(this),
    };
  }

  /**
   * Register a subscription plan
   */
  registerPlan(plan: SubscriptionPlan): void {
    this.store.savePlan(plan);
  }

  /**
   * Get all plans
   */
  getPlans(): SubscriptionPlan[] {
    return this.store.getAllPlans();
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    return this.store.getPlan(planId);
  }

  /**
   * Create a new subscription
   */
  async create(
    customerId: string,
    planId: string,
    options?: {
      startImmediately?: boolean;
      skipTrial?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Subscription> {
    const plan = this.store.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const now = new Date();
    const trialDays = options?.skipTrial ? 0 : (plan.trialDays ?? 0);
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const periodEnd = this.calculatePeriodEnd(trialEnd, plan);

    const subscription: Subscription = {
      id: this.generateId("sub"),
      customerId,
      planId,
      status: trialDays > 0 ? "trialing" : "active",
      createdAt: now.toISOString(),
      startedAt: trialDays > 0 ? undefined : now.toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      nextBillingDate: trialDays > 0 ? trialEnd.toISOString() : periodEnd.toISOString(),
      currentCycle: 0,
      totalPayments: 0,
      totalPaid: 0,
      failedAttempts: 0,
      metadata: options?.metadata,
    };

    this.store.save(subscription);

    await this.emitEvent({
      type: "subscription.created",
      subscriptionId: subscription.id,
      timestamp: now.toISOString(),
      data: { plan, customerId },
    });

    // Process first payment immediately if requested and no trial
    if (options?.startImmediately && trialDays === 0) {
      await this.processSubscriptionPayment(subscription);
    }

    return subscription;
  }

  /**
   * Get subscription by ID
   */
  get(subscriptionId: string): Subscription | undefined {
    return this.store.get(subscriptionId);
  }

  /**
   * Get subscriptions for a customer
   */
  getByCustomer(customerId: string): Subscription[] {
    return this.store.getByCustomer(customerId);
  }

  /**
   * Pause a subscription
   */
  async pause(
    subscriptionId: string,
    options?: { resumeAt?: Date }
  ): Promise<Subscription> {
    const sub = this.store.get(subscriptionId);
    if (!sub) throw new Error("Subscription not found");
    if (sub.status !== "active") throw new Error("Can only pause active subscriptions");

    sub.status = "paused";
    sub.pausedAt = new Date().toISOString();
    sub.resumeAt = options?.resumeAt?.toISOString();
    sub.nextBillingDate = undefined;

    this.store.save(sub);

    await this.emitEvent({
      type: "subscription.paused",
      subscriptionId,
      timestamp: new Date().toISOString(),
      data: { resumeAt: sub.resumeAt },
    });

    return sub;
  }

  /**
   * Resume a paused subscription
   */
  async resume(subscriptionId: string): Promise<Subscription> {
    const sub = this.store.get(subscriptionId);
    if (!sub) throw new Error("Subscription not found");
    if (sub.status !== "paused") throw new Error("Subscription is not paused");

    const plan = this.store.getPlan(sub.planId);
    if (!plan) throw new Error("Plan not found");

    const now = new Date();
    const periodEnd = this.calculatePeriodEnd(now, plan);

    sub.status = "active";
    sub.pausedAt = undefined;
    sub.resumeAt = undefined;
    sub.currentPeriodStart = now.toISOString();
    sub.currentPeriodEnd = periodEnd.toISOString();
    sub.nextBillingDate = periodEnd.toISOString();

    this.store.save(sub);

    await this.emitEvent({
      type: "subscription.resumed",
      subscriptionId,
      timestamp: now.toISOString(),
    });

    return sub;
  }

  /**
   * Cancel a subscription
   */
  async cancel(
    subscriptionId: string,
    options?: { reason?: string; immediately?: boolean }
  ): Promise<Subscription> {
    const sub = this.store.get(subscriptionId);
    if (!sub) throw new Error("Subscription not found");

    const now = new Date();

    if (options?.immediately) {
      sub.status = "canceled";
      sub.canceledAt = now.toISOString();
      sub.cancelReason = options.reason;
      sub.nextBillingDate = undefined;
    } else {
      // Cancel at period end
      sub.canceledAt = sub.currentPeriodEnd;
      sub.cancelReason = options?.reason;
    }

    this.store.save(sub);

    await this.emitEvent({
      type: "subscription.canceled",
      subscriptionId,
      timestamp: now.toISOString(),
      data: { reason: options?.reason, immediately: options?.immediately },
    });

    return sub;
  }

  /**
   * Change subscription plan
   */
  async changePlan(
    subscriptionId: string,
    newPlanId: string
  ): Promise<Subscription> {
    const sub = this.store.get(subscriptionId);
    if (!sub) throw new Error("Subscription not found");

    const newPlan = this.store.getPlan(newPlanId);
    if (!newPlan) throw new Error("Plan not found");

    const now = new Date();

    // Handle proration if needed
    if (this.config.prorationBehavior === "create_prorations") {
      // Calculate proration (simplified)
      const daysRemaining = Math.floor(
        (new Date(sub.currentPeriodEnd).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      // In real implementation, create proration invoice
      console.log(`Proration: ${daysRemaining} days remaining`);
    }

    sub.planId = newPlanId;
    
    // Reset period with new plan
    const periodEnd = this.calculatePeriodEnd(now, newPlan);
    sub.currentPeriodStart = now.toISOString();
    sub.currentPeriodEnd = periodEnd.toISOString();
    sub.nextBillingDate = periodEnd.toISOString();

    this.store.save(sub);

    return sub;
  }

  /**
   * Process due subscriptions
   */
  async processDueSubscriptions(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const now = new Date();
    const due = this.store.getDueForBilling(now);

    let succeeded = 0;
    let failed = 0;

    for (const sub of due) {
      try {
        await this.processSubscriptionPayment(sub);
        succeeded++;
      } catch (error) {
        failed++;
      }
    }

    return { processed: due.length, succeeded, failed };
  }

  /**
   * Process single subscription payment
   */
  async processSubscriptionPayment(subscription: Subscription): Promise<PaymentResult> {
    const plan = this.store.getPlan(subscription.planId);
    if (!plan) throw new Error("Plan not found");

    const intent = this.config.buildPaymentIntent(subscription, plan);

    try {
      const result = await this.client.pay(intent);

      // Update subscription
      subscription.currentCycle++;
      subscription.totalPayments++;
      subscription.totalPaid += plan.amount;
      subscription.failedAttempts = 0;
      subscription.lastPaymentResult = result;
      const wasTrialing = subscription.status === "trialing";
      subscription.status = "active";

      // Calculate next period
      const now = new Date();
      const periodEnd = this.calculatePeriodEnd(now, plan);
      subscription.currentPeriodStart = now.toISOString();
      subscription.currentPeriodEnd = periodEnd.toISOString();
      subscription.nextBillingDate = periodEnd.toISOString();

      // Check max cycles
      if (plan.maxCycles && subscription.currentCycle >= plan.maxCycles) {
        subscription.status = "canceled";
        subscription.canceledAt = now.toISOString();
        subscription.cancelReason = "max_cycles_reached";
        subscription.nextBillingDate = undefined;
      }

      // First successful charge after a trial promotes the subscription to active
      if (wasTrialing && subscription.status !== "canceled") {
        subscription.status = "active";
        subscription.startedAt = now.toISOString();
      }

      this.store.save(subscription);

      await this.emitEvent({
        type: subscription.currentCycle === 1 ? "subscription.started" : "subscription.renewed",
        subscriptionId: subscription.id,
        timestamp: now.toISOString(),
        data: { cycle: subscription.currentCycle, amount: plan.amount },
      });

      await this.emitEvent({
        type: "subscription.payment_succeeded",
        subscriptionId: subscription.id,
        timestamp: now.toISOString(),
        data: { paymentResult: result },
      });

      return result;
    } catch (error) {
      subscription.failedAttempts++;
      
      // Schedule retry or mark past_due
      if (subscription.failedAttempts < this.config.maxRetryAttempts) {
        const retryDate = new Date();
        retryDate.setDate(retryDate.getDate() + this.config.retryIntervalDays);
        subscription.nextBillingDate = retryDate.toISOString();
        subscription.status = "past_due";
      } else {
        // Grace period expired
        const gracePeriodEnd = new Date(subscription.currentPeriodEnd);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.config.gracePeriodDays);
        
        if (new Date() > gracePeriodEnd) {
          subscription.status = "canceled";
          subscription.canceledAt = new Date().toISOString();
          subscription.cancelReason = "payment_failed";
          subscription.nextBillingDate = undefined;
        }
      }

      this.store.save(subscription);

      await this.emitEvent({
        type: "subscription.payment_failed",
        subscriptionId: subscription.id,
        timestamp: new Date().toISOString(),
        data: { 
          attempt: subscription.failedAttempts,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      throw error;
    }
  }

  /**
   * Start automatic processing
   */
  startProcessing(intervalMs: number = 3600000): void {
    if (this.processingTimer) return;

    this.processingTimer = setInterval(() => {
      this.processDueSubscriptions().catch((err) => {
        console.error("Subscription processing error:", err);
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
   * Calculate period end based on plan interval
   */
  private calculatePeriodEnd(start: Date, plan: SubscriptionPlan): Date {
    const end = new Date(start);
    
    switch (plan.interval) {
      case "daily":
        end.setDate(end.getDate() + 1);
        break;
      case "weekly":
        end.setDate(end.getDate() + 7);
        break;
      case "monthly":
        end.setMonth(end.getMonth() + 1);
        break;
      case "yearly":
        end.setFullYear(end.getFullYear() + 1);
        break;
      case "custom":
        end.setDate(end.getDate() + (plan.intervalDays ?? 30));
        break;
    }
    
    return end;
  }

  /**
   * Default payment intent builder
   */
  private defaultBuildIntent(subscription: Subscription, plan: SubscriptionPlan): PaymentIntent {
    return {
      id: this.generateId("pi"),
      amount: plan.amount,
      currency: plan.currency,
      paymentMethod: "card",
      description: `${plan.name} subscription - Cycle ${subscription.currentCycle + 1}`,
      metadata: {
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        planId: plan.id,
        cycle: subscription.currentCycle + 1,
      },
    };
  }

  /**
   * Emit subscription event
   */
  private async emitEvent(event: SubscriptionEvent): Promise<void> {
    try {
      await this.config.onEvent(event);
    } catch (error) {
      console.error("Subscription event handler error:", error);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create subscription manager
 */
export function createSubscriptionManager(
  client: PrimeFlow,
  config?: SubscriptionConfig
): SubscriptionManager {
  return new SubscriptionManager(client, config);
}
