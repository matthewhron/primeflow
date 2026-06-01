/**
 * PrimeFlow - Smart Payment Routing via Layer-403
 * 
 * @packageDocumentation
 */

// Main client
export { PrimeFlow, createClient } from "./client.js";

// Types
export * from "./types/index.js";

// Routing utilities
export {
  filterQuotes,
  isRegionAllowed,
  getFilterReasonDescription,
  type FilterResult,
  type FilteredQuote,
  type FilterReason,
} from "./routing/filter.js";

export {
  scoreQuotes,
  customScore,
  explainScore,
  type ScoringResult,
  type ScoringMeta,
} from "./routing/scorer.js";

export {
  applyStrategy,
  makeRouteDecision,
  getNextFallback,
  createCustomStrategy,
  combineStrategies,
  type StrategyFn,
} from "./routing/strategy.js";

// Layer-403 client (for advanced usage)
export {
  Layer403Client,
  createLayer403Client,
  type Layer403Response,
  type QuoteRequest,
  type PayRequest,
  type RefundRequest,
} from "./layer403/client.js";

export {
  RequestSigner,
  generateIdempotencyKey,
  generateRequestId,
  type SignedRequest,
  type SignatureParams,
} from "./layer403/signer.js";

// Cache
export {
  Cache,
  createQuoteCacheKey,
  createRegionsCacheKey,
  type CacheEntry,
  type CacheOptions,
  type CacheStats,
} from "./cache/index.js";

// Utilities
export {
  Logger,
  Timer,
  withTiming,
  defaultLogger,
} from "./utils/logger.js";

export {
  CURRENCIES,
  getCurrencyInfo,
  toSmallestUnit,
  fromSmallestUnit,
  formatAmount,
  calculateFxFee,
  isValidCurrency,
  getRegionCurrency,
  type CurrencyInfo,
} from "./utils/currency.js";

// Express middleware
export {
  createPrimeFlowMiddleware,
  createWebhookVerificationMiddleware,
  createErrorMiddleware,
  type PrimeFlowMiddlewareOptions,
} from "./middleware/express.js";

// Analytics
export {
  Analytics,
  createAnalytics,
  type PaymentMetric,
  type RefundMetric,
  type RegionStats,
  type RouterStats,
  type TimeSeriesPoint,
  type AnalyticsSnapshot,
  type AnalyticsConfig,
} from "./analytics/index.js";

// Rate Limiting
export {
  RateLimiter,
  TieredRateLimiter,
  TokenBucket,
  RateLimitPresets,
  createRateLimiter,
  createTieredRateLimiter,
  type RateLimitConfig,
  type RateLimitContext,
  type RateLimitInfo,
} from "./ratelimit/index.js";

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  createCircuitBreaker,
  createCircuitBreakerRegistry,
  withCircuitBreaker,
  type CircuitState,
  type CircuitStats,
  type CircuitBreakerConfig,
} from "./circuit-breaker/index.js";

// Health Checks
export {
  HealthMonitor,
  BuiltInChecks,
  createHealthMonitor,
  healthMiddleware,
  type HealthStatus,
  type HealthCheckResult,
  type SystemHealth,
  type HealthCheckConfig,
  type HealthMonitorConfig,
} from "./health/index.js";

// Events
export {
  PaymentEventEmitter,
  EventAggregator,
  EventLogger,
  Events,
  createEventEmitter,
  createEventAggregator,
  type PaymentEventType,
  type PaymentEvent,
  type PaymentCreatedData,
  type PaymentStartedData,
  type PaymentSucceededData,
  type PaymentFailedData,
  type PaymentRetryData,
  type EventHandler,
} from "./events/index.js";

// Batch Processing
export {
  BatchProcessor,
  BatchBuilder,
  createBatchProcessor,
  createBatch,
  chunkArray,
  type BatchPaymentItem,
  type BatchRefundItem,
  type BatchItemResult,
  type BatchResult,
  type BatchConfig,
} from "./batch/index.js";

// Subscriptions
export {
  SubscriptionManager,
  createSubscriptionManager,
  type SubscriptionStatus,
  type BillingInterval,
  type SubscriptionPlan,
  type Subscription,
  type SubscriptionEvent,
  type SubscriptionConfig,
} from "./subscriptions/index.js";

// Retry Utilities
export {
  retry,
  retryable,
  calculateBackoff,
  RetryBuilder,
  RetryPresets,
  RetryConditions,
  withRetry,
  type BackoffStrategy,
  type RetryConfig,
  type RetryResult,
} from "./retry/index.js";

// Validators
export {
  SchemaValidator,
  Validators,
  CardValidators,
  AmountValidators,
  CurrencyValidators,
  EmailValidators,
  PhoneValidators,
  AddressValidators,
  IpValidators,
  createValidator,
  createPaymentIntentValidator,
  type ValidationResult,
  type ValidationError,
  type ValidatorFn,
} from "./validators/index.js";

// Fraud Detection
export {
  FraudDetector,
  createFraudDetector,
  fraudMiddleware,
  type RiskLevel,
  type RiskSignal,
  type RiskAssessment,
  type FraudRuleConfig,
  type FraudContext,
  type FraudDetectorConfig,
} from "./fraud/index.js";

// Webhooks
export {
  WebhookManager,
  WebhookVerifier,
  createWebhookManager,
  createWebhookVerifier,
  type WebhookEndpoint,
  type WebhookDelivery,
  type WebhookManagerConfig,
} from "./webhooks/index.js";

// Idempotency
export {
  IdempotencyManager,
  IdempotencyError,
  createIdempotencyManager,
  generateIdempotencyKey as generateIdempotencyKeyV2,
  idempotencyMiddleware,
  type IdempotencyRecord,
  type IdempotencyConfig,
  type IdempotencyStorage,
} from "./idempotency/index.js";

// Reporting
export {
  ReportingManager,
  createReportingManager,
  formatCurrency,
  calculateSummary,
  type PaymentRecord,
  type RefundRecord,
  type DailyReport,
  type ReconciliationResult,
  type Discrepancy,
  type ExternalPaymentRecord,
  type ReportingConfig,
} from "./reporting/index.js";

// Payment Links
export {
  PaymentLinksManager,
  createPaymentLinksManager,
  type PaymentLinkStatus,
  type PaymentLinkConfig,
  type CreatePaymentLinkOptions,
  type PaymentLink,
} from "./payment-links/index.js";

// Version
export const VERSION = "1.0.0";
