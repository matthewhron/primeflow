/**
 * Fraud Detection Module
 * Basic fraud detection and risk scoring
 */

import type { PaymentIntent } from "../types/intent.js";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskSignal {
  /** Signal name */
  name: string;
  /** Signal score (0-100) */
  score: number;
  /** Risk level */
  level: RiskLevel;
  /** Reason */
  reason: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

export interface RiskAssessment {
  /** Overall risk score (0-100) */
  score: number;
  /** Overall risk level */
  level: RiskLevel;
  /** Individual signals */
  signals: RiskSignal[];
  /** Recommended action */
  action: "allow" | "review" | "block";
  /** Assessment timestamp */
  timestamp: string;
  /** Assessment ID */
  id: string;
}

export interface FraudRuleConfig {
  /** Rule name */
  name: string;
  /** Rule weight (0-1) */
  weight?: number;
  /** Rule function */
  evaluate: (context: FraudContext) => Promise<RiskSignal | null>;
  /** Is this rule enabled */
  enabled?: boolean;
}

export interface FraudContext {
  /** Payment intent */
  intent: PaymentIntent;
  /** Customer IP */
  ip?: string;
  /** Customer email */
  email?: string;
  /** Customer ID */
  customerId?: string;
  /** Device fingerprint */
  deviceFingerprint?: string;
  /** User agent */
  userAgent?: string;
  /** Session ID */
  sessionId?: string;
  /** Previous payments count */
  previousPayments?: number;
  /** Previous chargebacks */
  previousChargebacks?: number;
  /** Account age in days */
  accountAgeDays?: number;
  /** Is new customer */
  isNewCustomer?: boolean;
  /** Custom data */
  customData?: Record<string, unknown>;
}

export interface FraudDetectorConfig {
  /** Risk thresholds */
  thresholds?: {
    review: number;
    block: number;
  };
  /** Default rules enabled */
  defaultRulesEnabled?: boolean;
  /** Callback on high risk */
  onHighRisk?: (assessment: RiskAssessment, context: FraudContext) => void;
  /** Custom rules */
  customRules?: FraudRuleConfig[];
}

/**
 * Velocity tracker for rate-based fraud detection
 */
class VelocityTracker {
  private events = new Map<string, number[]>();
  private windowMs: number;

  constructor(windowMs: number = 3600000) { // 1 hour default
    this.windowMs = windowMs;
  }

  /**
   * Record an event
   */
  record(key: string): void {
    const now = Date.now();
    const events = this.events.get(key) || [];
    events.push(now);
    this.events.set(key, events);
    this.cleanup(key);
  }

  /**
   * Get event count in window
   */
  count(key: string): number {
    this.cleanup(key);
    return (this.events.get(key) || []).length;
  }

  /**
   * Cleanup old events
   */
  private cleanup(key: string): void {
    const cutoff = Date.now() - this.windowMs;
    const events = this.events.get(key) || [];
    const filtered = events.filter((t) => t > cutoff);
    if (filtered.length > 0) {
      this.events.set(key, filtered);
    } else {
      this.events.delete(key);
    }
  }
}

/**
 * Fraud detector
 */
export class FraudDetector {
  private rules: FraudRuleConfig[] = [];
  private config: Required<FraudDetectorConfig>;
  private velocityByIP = new VelocityTracker(3600000);
  private velocityByEmail = new VelocityTracker(86400000);

  constructor(config?: FraudDetectorConfig) {
    this.config = {
      thresholds: {
        review: config?.thresholds?.review ?? 50,
        block: config?.thresholds?.block ?? 80,
      },
      defaultRulesEnabled: config?.defaultRulesEnabled ?? true,
      onHighRisk: config?.onHighRisk ?? (() => {}),
      customRules: config?.customRules ?? [],
    };

    // Add default rules
    if (this.config.defaultRulesEnabled) {
      this.addDefaultRules();
    }

    // Add custom rules
    for (const rule of this.config.customRules) {
      this.addRule(rule);
    }
  }

  /**
   * Add a fraud detection rule
   */
  addRule(rule: FraudRuleConfig): void {
    this.rules.push({
      ...rule,
      weight: rule.weight ?? 1,
      enabled: rule.enabled ?? true,
    });
  }

  /**
   * Remove a rule by name
   */
  removeRule(name: string): boolean {
    const index = this.rules.findIndex((r) => r.name === name);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Assess fraud risk for a payment
   */
  async assess(context: FraudContext): Promise<RiskAssessment> {
    const signals: RiskSignal[] = [];

    // Run all enabled rules
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      try {
        const signal = await rule.evaluate(context);
        if (signal) {
          signals.push({
            ...signal,
            score: signal.score * (rule.weight ?? 1),
          });
        }
      } catch (error) {
        console.error(`Fraud rule "${rule.name}" failed:`, error);
      }
    }

    // Calculate overall score
    const totalWeight = signals.length;
    const weightedScore = signals.reduce((sum, s) => sum + s.score, 0);
    const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Determine level and action
    let level: RiskLevel;
    let action: "allow" | "review" | "block";

    if (overallScore >= this.config.thresholds.block) {
      level = "critical";
      action = "block";
    } else if (overallScore >= this.config.thresholds.review) {
      level = "high";
      action = "review";
    } else if (overallScore >= 30) {
      level = "medium";
      action = "allow";
    } else {
      level = "low";
      action = "allow";
    }

    const assessment: RiskAssessment = {
      score: Math.round(overallScore),
      level,
      signals,
      action,
      timestamp: new Date().toISOString(),
      id: `fra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    // Track velocity
    if (context.ip) this.velocityByIP.record(context.ip);
    if (context.email) this.velocityByEmail.record(context.email);

    // Callback for high risk
    if (level === "high" || level === "critical") {
      this.config.onHighRisk(assessment, context);
    }

    return assessment;
  }

  /**
   * Quick check without full assessment
   */
  async quickCheck(context: FraudContext): Promise<boolean> {
    const assessment = await this.assess(context);
    return assessment.action !== "block";
  }

  /**
   * Add default fraud detection rules
   */
  private addDefaultRules(): void {
    // High amount rule
    this.addRule({
      name: "high_amount",
      weight: 0.8,
      evaluate: async (ctx) => {
        const threshold = 10000; // $10,000
        if (ctx.intent.amount > threshold) {
          return {
            name: "high_amount",
            score: Math.min(100, (ctx.intent.amount / threshold) * 50),
            level: "medium",
            reason: `Transaction amount ($${ctx.intent.amount}) exceeds threshold`,
            data: { amount: ctx.intent.amount, threshold },
          };
        }
        return null;
      },
    });

    // New customer large transaction
    this.addRule({
      name: "new_customer_large_tx",
      weight: 1,
      evaluate: async (ctx) => {
        if (ctx.isNewCustomer && ctx.intent.amount > 1000) {
          return {
            name: "new_customer_large_tx",
            score: 60,
            level: "high",
            reason: "New customer with large transaction",
            data: { amount: ctx.intent.amount },
          };
        }
        return null;
      },
    });

    // IP velocity
    this.addRule({
      name: "ip_velocity",
      weight: 0.9,
      evaluate: async (ctx) => {
        if (!ctx.ip) return null;
        const count = this.velocityByIP.count(ctx.ip);
        if (count > 10) {
          return {
            name: "ip_velocity",
            score: Math.min(100, count * 8),
            level: count > 20 ? "critical" : "high",
            reason: `High transaction velocity from IP (${count} in last hour)`,
            data: { count, ip: ctx.ip },
          };
        }
        return null;
      },
    });

    // Email velocity
    this.addRule({
      name: "email_velocity",
      weight: 0.7,
      evaluate: async (ctx) => {
        if (!ctx.email) return null;
        const count = this.velocityByEmail.count(ctx.email);
        if (count > 5) {
          return {
            name: "email_velocity",
            score: Math.min(100, count * 15),
            level: count > 10 ? "high" : "medium",
            reason: `Multiple transactions from email (${count} in last 24h)`,
            data: { count, email: ctx.email },
          };
        }
        return null;
      },
    });

    // Disposable email
    this.addRule({
      name: "disposable_email",
      weight: 0.6,
      evaluate: async (ctx) => {
        if (!ctx.email) return null;
        const disposableDomains = [
          "tempmail.com", "throwaway.email", "guerrillamail.com",
          "10minutemail.com", "mailinator.com", "temp-mail.org",
          "fakeinbox.com", "yopmail.com",
        ];
        const domain = ctx.email.split("@")[1]?.toLowerCase();
        if (domain && disposableDomains.includes(domain)) {
          return {
            name: "disposable_email",
            score: 70,
            level: "high",
            reason: "Disposable email address detected",
            data: { domain },
          };
        }
        return null;
      },
    });

    // Previous chargebacks
    this.addRule({
      name: "chargeback_history",
      weight: 1,
      evaluate: async (ctx) => {
        if (ctx.previousChargebacks && ctx.previousChargebacks > 0) {
          return {
            name: "chargeback_history",
            score: Math.min(100, ctx.previousChargebacks * 40),
            level: ctx.previousChargebacks > 2 ? "critical" : "high",
            reason: `Customer has ${ctx.previousChargebacks} previous chargeback(s)`,
            data: { chargebacks: ctx.previousChargebacks },
          };
        }
        return null;
      },
    });

    // Account age
    this.addRule({
      name: "young_account",
      weight: 0.5,
      evaluate: async (ctx) => {
        if (ctx.accountAgeDays !== undefined && ctx.accountAgeDays < 7) {
          return {
            name: "young_account",
            score: 40 - ctx.accountAgeDays * 5,
            level: "medium",
            reason: `Account is only ${ctx.accountAgeDays} day(s) old`,
            data: { ageDays: ctx.accountAgeDays },
          };
        }
        return null;
      },
    });

    // High-risk currencies/regions (placeholder - customize for your needs)
    this.addRule({
      name: "high_risk_currency",
      weight: 0.4,
      evaluate: async (ctx) => {
        const highRiskCurrencies = ["RUB", "BYN", "IRR", "KPW"];
        if (highRiskCurrencies.includes(ctx.intent.currency)) {
          return {
            name: "high_risk_currency",
            score: 50,
            level: "medium",
            reason: `High-risk currency: ${ctx.intent.currency}`,
            data: { currency: ctx.intent.currency },
          };
        }
        return null;
      },
    });

    // Mismatch patterns (if we have more context)
    this.addRule({
      name: "round_amount",
      weight: 0.3,
      evaluate: async (ctx) => {
        // Very round amounts can be suspicious
        if (ctx.intent.amount >= 1000 && ctx.intent.amount % 1000 === 0) {
          return {
            name: "round_amount",
            score: 20,
            level: "low",
            reason: "Suspiciously round amount",
            data: { amount: ctx.intent.amount },
          };
        }
        return null;
      },
    });
  }

  /**
   * Get all rules
   */
  getRules(): FraudRuleConfig[] {
    return [...this.rules];
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(name: string, enabled: boolean): boolean {
    const rule = this.rules.find((r) => r.name === name);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }
}

/**
 * Create fraud detector
 */
export function createFraudDetector(config?: FraudDetectorConfig): FraudDetector {
  return new FraudDetector(config);
}

/**
 * Fraud detector middleware for Express
 */
export function fraudMiddleware(detector: FraudDetector) {
  return async (
    req: { body: { intent: PaymentIntent }; ip?: string; headers?: Record<string, string> },
    res: { status: (code: number) => { json: (data: unknown) => void } },
    next: () => void
  ) => {
    const context: FraudContext = {
      intent: req.body.intent,
      ip: req.ip,
      userAgent: req.headers?.["user-agent"],
    };

    const assessment = await detector.assess(context);

    if (assessment.action === "block") {
      res.status(403).json({
        error: "FRAUD_DETECTED",
        message: "Transaction blocked due to fraud risk",
        assessmentId: assessment.id,
      });
      return;
    }

    // Attach assessment to request for downstream use
    (req as { fraudAssessment?: RiskAssessment }).fraudAssessment = assessment;
    next();
  };
}
