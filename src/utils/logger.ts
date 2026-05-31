/**
 * Logging utilities
 */

import type { LogLevel, ObservabilityConfig, ObservabilityEvent } from "../types/config.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Logger instance
 */
export class Logger {
  private readonly level: number;
  private readonly onEvent?: (event: ObservabilityEvent) => void;
  private readonly prefix: string;

  constructor(config?: ObservabilityConfig, prefix = "PrimeFlow") {
    this.level = LOG_LEVELS[config?.logLevel ?? "info"];
    this.onEvent = config?.onEvent;
    this.prefix = prefix;
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  /**
   * Emit observability event
   */
  event(
    type: string,
    data: Record<string, unknown>,
    options?: {
      intentId?: string;
      region?: string;
      durationMs?: number;
      error?: unknown;
    }
  ): void {
    const event: ObservabilityEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
      intentId: options?.intentId,
      region: options?.region,
      durationMs: options?.durationMs,
      error: options?.error,
    };

    this.onEvent?.(event);
    this.debug(`Event: ${type}`, data);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] > this.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case "error":
        console.error(formatted, data ?? "");
        break;
      case "warn":
        console.warn(formatted, data ?? "");
        break;
      case "info":
        console.info(formatted, data ?? "");
        break;
      case "debug":
        console.debug(formatted, data ?? "");
        break;
    }
  }

  /**
   * Create child logger with prefix
   */
  child(childPrefix: string): Logger {
    return new Logger(
      { logLevel: this.getLevelName(), onEvent: this.onEvent },
      `${this.prefix}:${childPrefix}`
    );
  }

  private getLevelName(): LogLevel {
    const entries = Object.entries(LOG_LEVELS) as Array<[LogLevel, number]>;
    const found = entries.find(([, value]) => value === this.level);
    return found?.[0] ?? "info";
  }
}

/**
 * Performance timer
 */
export class Timer {
  private readonly start: number;

  constructor() {
    this.start = performance.now();
  }

  elapsed(): number {
    return Math.round(performance.now() - this.start);
  }
}

/**
 * Create timed execution wrapper
 */
export function withTiming<T>(
  fn: () => Promise<T>,
  logger: Logger,
  eventType: string,
  options?: { intentId?: string; region?: string }
): Promise<{ result: T; durationMs: number }> {
  const timer = new Timer();

  return fn()
    .then((result) => {
      const durationMs = timer.elapsed();
      logger.event(eventType, { success: true }, { ...options, durationMs });
      return { result, durationMs };
    })
    .catch((error) => {
      const durationMs = timer.elapsed();
      logger.event(eventType, { success: false }, { ...options, durationMs, error });
      throw error;
    });
}

/**
 * Default logger instance
 */
export const defaultLogger = new Logger();
