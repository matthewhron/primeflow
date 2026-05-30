/**
 * Configuration types for PrimeFlow client
 */

export type RoutingMode = "auto" | "pinned" | "dry-run";

export type RoutingStrategy = "cheapest" | "highest_success" | "balanced" | "custom";

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface Layer403Config {
  /** Base URL of Layer-403 gateway */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** API secret for request signing */
  apiSecret: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Custom headers to include in requests */
  customHeaders?: Record<string, string>;
}

export interface RoutingWeights {
  /** Weight for price optimization (0-1) */
  price: number;
  /** Weight for success rate optimization (0-1) */
  success: number;
  /** Weight for latency optimization (0-1) */
  latency: number;
}

export interface FallbackConfig {
  /** Enable automatic fallback to next best region */
  enabled: boolean;
  /** Maximum retry attempts */
  maxTries: number;
  /** Backoff multiplier between retries */
  backoffMs?: number;
}

export interface RoutingConfig {
  /** Routing mode */
  mode: RoutingMode;
  /** Fixed region when mode is 'pinned' */
  pinnedRegion?: string | null;
  /** List of allowed regions (whitelist) */
  allowedRegions?: string[];
  /** List of blocked regions (blacklist) */
  blockedRegions?: string[];
  /** Scoring weights for region selection */
  weights?: RoutingWeights;
  /** Fallback configuration */
  fallback?: FallbackConfig;
  /** Custom scoring function */
  customScorer?: CustomScorerFn;
  /** Routing strategy */
  strategy?: RoutingStrategy;
}

export interface CacheConfig {
  /** Cache TTL in milliseconds */
  ttlMs: number;
  /** Maximum cache entries */
  maxEntries?: number;
}

export interface ComplianceConfig {
  /** Enforce allowed regions strictly */
  enforceAllowedRegions?: boolean;
  /** Enable sanctions checking */
  sanctionsCheck?: boolean;
  /** Require KYC token for payments */
  kycRequired?: boolean;
  /** Custom compliance validator */
  customValidator?: (intent: unknown) => Promise<boolean>;
}

export interface ObservabilityEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  intentId?: string;
  region?: string;
  durationMs?: number;
  error?: unknown;
}

export interface ObservabilityConfig {
  /** Log level */
  logLevel?: LogLevel;
  /** Event callback for metrics/monitoring */
  onEvent?: (event: ObservabilityEvent) => void;
  /** Include raw responses in logs */
  includeRawResponses?: boolean;
}

export interface PrimeFlowConfig {
  /** Layer-403 gateway configuration */
  layer403: Layer403Config;
  /** Routing configuration */
  routing?: RoutingConfig;
  /** Cache configuration */
  cache?: CacheConfig;
  /** Compliance configuration */
  compliance?: ComplianceConfig;
  /** Observability configuration */
  observability?: ObservabilityConfig;
}

export type CustomScorerFn = (
  quotes: import("./quote").RegionQuote[],
  weights: RoutingWeights
) => import("./quote").RegionQuote[];

export const DEFAULT_CONFIG: Partial<PrimeFlowConfig> = {
  routing: {
    mode: "auto",
    pinnedRegion: null,
    allowedRegions: [],
    blockedRegions: [],
    weights: { price: 0.7, success: 0.25, latency: 0.05 },
    fallback: { enabled: true, maxTries: 3, backoffMs: 1000 },
    strategy: "balanced",
  },
  cache: {
    ttlMs: 60000,
    maxEntries: 1000,
  },
  compliance: {
    enforceAllowedRegions: true,
    sanctionsCheck: false,
    kycRequired: false,
  },
  observability: {
    logLevel: "info",
    includeRawResponses: false,
  },
};
