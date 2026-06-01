/**
 * Event Emitter Module
 * Type-safe event system for payment lifecycle
 */

export type PaymentEventType =
  | "payment:created"
  | "payment:started"
  | "payment:succeeded"
  | "payment:failed"
  | "payment:retry"
  | "payment:fallback"
  | "refund:created"
  | "refund:succeeded"
  | "refund:failed"
  | "quote:requested"
  | "quote:received"
  | "route:decided"
  | "webhook:received"
  | "webhook:verified"
  | "webhook:failed"
  | "circuit:opened"
  | "circuit:closed"
  | "circuit:half-open"
  | "rate-limit:exceeded"
  | "error:occurred";

export interface PaymentEvent<T = unknown> {
  type: PaymentEventType;
  timestamp: string;
  data: T;
  metadata?: Record<string, unknown>;
}

export interface PaymentCreatedData {
  intentId: string;
  amount: number;
  currency: string;
}

export interface PaymentStartedData {
  intentId: string;
  region: string;
  routerId: string;
  attempt: number;
}

export interface PaymentSucceededData {
  intentId: string;
  paymentId: string;
  region: string;
  routerId: string;
  amount: number;
  currency: string;
  latencyMs: number;
}

export interface PaymentFailedData {
  intentId: string;
  region: string;
  routerId: string;
  error: {
    code: string;
    message: string;
  };
  attempt: number;
  willRetry: boolean;
}

export interface PaymentRetryData {
  intentId: string;
  fromRegion: string;
  toRegion: string;
  attempt: number;
  reason: string;
}

export type EventHandler<T = unknown> = (event: PaymentEvent<T>) => void | Promise<void>;

interface EventSubscription {
  id: string;
  type: PaymentEventType | "*";
  handler: EventHandler;
  once: boolean;
}

/**
 * Type-safe event emitter for payment events
 */
export class PaymentEventEmitter {
  private subscriptions: EventSubscription[] = [];
  private eventHistory: PaymentEvent[] = [];
  private maxHistory: number;
  private asyncMode: boolean;

  constructor(options?: { maxHistory?: number; asyncMode?: boolean }) {
    this.maxHistory = options?.maxHistory ?? 1000;
    this.asyncMode = options?.asyncMode ?? true;
  }

  /**
   * Subscribe to an event type
   */
  on<T = unknown>(
    type: PaymentEventType | "*",
    handler: EventHandler<T>
  ): () => void {
    const id = this.generateId();
    
    this.subscriptions.push({
      id,
      type,
      handler: handler as EventHandler,
      once: false,
    });

    // Return unsubscribe function
    return () => this.off(id);
  }

  /**
   * Subscribe to an event type (one-time)
   */
  once<T = unknown>(
    type: PaymentEventType | "*",
    handler: EventHandler<T>
  ): () => void {
    const id = this.generateId();
    
    this.subscriptions.push({
      id,
      type,
      handler: handler as EventHandler,
      once: true,
    });

    return () => this.off(id);
  }

  /**
   * Unsubscribe by ID
   */
  off(id: string): boolean {
    const index = this.subscriptions.findIndex((s) => s.id === id);
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Emit an event
   */
  emit<T = unknown>(
    type: PaymentEventType,
    data: T,
    metadata?: Record<string, unknown>
  ): void {
    const event: PaymentEvent<T> = {
      type,
      timestamp: new Date().toISOString(),
      data,
      metadata,
    };

    // Store in history
    this.eventHistory.push(event as PaymentEvent);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // Find matching handlers
    const handlers = this.subscriptions.filter(
      (s) => s.type === type || s.type === "*"
    );

    // Track one-time handlers to remove
    const toRemove: string[] = [];

    for (const sub of handlers) {
      if (sub.once) {
        toRemove.push(sub.id);
      }

      if (this.asyncMode) {
        // Fire and forget
        Promise.resolve(sub.handler(event as PaymentEvent)).catch((err) => {
          console.error(`[EventEmitter] Handler error for ${type}:`, err);
        });
      } else {
        // Synchronous
        try {
          const result = sub.handler(event as PaymentEvent);
          if (result instanceof Promise) {
            result.catch((err) => {
              console.error(`[EventEmitter] Handler error for ${type}:`, err);
            });
          }
        } catch (err) {
          console.error(`[EventEmitter] Handler error for ${type}:`, err);
        }
      }
    }

    // Remove one-time handlers
    for (const id of toRemove) {
      this.off(id);
    }
  }

  /**
   * Wait for an event
   */
  waitFor<T = unknown>(
    type: PaymentEventType,
    timeoutMs?: number
  ): Promise<PaymentEvent<T>> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const unsubscribe = this.once<T>(type, (event) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(event);
      });

      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for event: ${type}`));
        }, timeoutMs);
      }
    });
  }

  /**
   * Get event history
   */
  getHistory(filter?: {
    type?: PaymentEventType;
    since?: string;
    limit?: number;
  }): PaymentEvent[] {
    let events = [...this.eventHistory];

    if (filter?.type) {
      events = events.filter((e) => e.type === filter.type);
    }

    if (filter?.since) {
      const sinceTime = new Date(filter.since).getTime();
      events = events.filter(
        (e) => new Date(e.timestamp).getTime() >= sinceTime
      );
    }

    if (filter?.limit) {
      events = events.slice(-filter.limit);
    }

    return events;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get subscription count
   */
  listenerCount(type?: PaymentEventType): number {
    if (type) {
      return this.subscriptions.filter(
        (s) => s.type === type || s.type === "*"
      ).length;
    }
    return this.subscriptions.length;
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(type?: PaymentEventType): void {
    if (type) {
      this.subscriptions = this.subscriptions.filter((s) => s.type !== type);
    } else {
      this.subscriptions = [];
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Event aggregator for multiple emitters
 */
export class EventAggregator {
  private emitters: PaymentEventEmitter[] = [];
  private mainEmitter = new PaymentEventEmitter();

  /**
   * Add an emitter to aggregate
   */
  add(emitter: PaymentEventEmitter): void {
    this.emitters.push(emitter);
    
    // Forward all events
    emitter.on("*", (event) => {
      this.mainEmitter.emit(event.type, event.data, event.metadata);
    });
  }

  /**
   * Subscribe to aggregated events
   */
  on<T = unknown>(
    type: PaymentEventType | "*",
    handler: EventHandler<T>
  ): () => void {
    return this.mainEmitter.on(type, handler);
  }

  /**
   * Get combined history
   */
  getHistory(filter?: {
    type?: PaymentEventType;
    since?: string;
    limit?: number;
  }): PaymentEvent[] {
    return this.mainEmitter.getHistory(filter);
  }
}

/**
 * Event logger for debugging
 */
export class EventLogger {
  private emitter: PaymentEventEmitter;
  private logFn: (message: string, event: PaymentEvent) => void;

  constructor(
    emitter: PaymentEventEmitter,
    logFn?: (message: string, event: PaymentEvent) => void
  ) {
    this.emitter = emitter;
    this.logFn = logFn ?? ((msg, event) => {
      console.log(`[${event.type}] ${msg}`, event.data);
    });

    this.setupLogging();
  }

  private setupLogging(): void {
    this.emitter.on("*", (event) => {
      this.logFn(this.formatMessage(event), event);
    });
  }

  private formatMessage(event: PaymentEvent): string {
    switch (event.type) {
      case "payment:succeeded":
        const success = event.data as PaymentSucceededData;
        return `Payment ${success.intentId} succeeded in ${success.latencyMs}ms`;
      case "payment:failed":
        const failed = event.data as PaymentFailedData;
        return `Payment ${failed.intentId} failed: ${failed.error.message}`;
      default:
        return `Event occurred`;
    }
  }
}

/**
 * Create event emitter
 */
export function createEventEmitter(options?: {
  maxHistory?: number;
  asyncMode?: boolean;
}): PaymentEventEmitter {
  return new PaymentEventEmitter(options);
}

/**
 * Create event aggregator
 */
export function createEventAggregator(): EventAggregator {
  return new EventAggregator();
}

/**
 * Typed event helpers
 */
export const Events = {
  paymentCreated: (data: PaymentCreatedData): [PaymentEventType, PaymentCreatedData] =>
    ["payment:created", data],
  
  paymentStarted: (data: PaymentStartedData): [PaymentEventType, PaymentStartedData] =>
    ["payment:started", data],
  
  paymentSucceeded: (data: PaymentSucceededData): [PaymentEventType, PaymentSucceededData] =>
    ["payment:succeeded", data],
  
  paymentFailed: (data: PaymentFailedData): [PaymentEventType, PaymentFailedData] =>
    ["payment:failed", data],
  
  paymentRetry: (data: PaymentRetryData): [PaymentEventType, PaymentRetryData] =>
    ["payment:retry", data],
};
