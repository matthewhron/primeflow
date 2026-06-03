# Changelog

All notable changes to **Prime Flow** ($FLOW) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-06-02

### Added
- Initial release of the `prime-flow` SDK.
- `PrimeFlow` client: `quote()`, `decideRoute()`, `pay()`, `refund()`, `listRegions()`, `verifyWebhook()`.
- Smart routing engine with `cheapest` / `highest_success` / `balanced` / `custom` strategies and weighted scoring.
- Automatic fallback across regions (up to 3 tries).
- Quote caching (TTL 60s), fraud detection, subscriptions, batch processing.
- Circuit breaker, rate limiting (token bucket), idempotency, notifications, payment links.
- Analytics, reporting (daily report + CSV), webhooks, Express middleware.
- Signed Layer-403 gateway client (HMAC-SHA256), full TypeScript types (ESM + CJS).
- Vitest test suite (141 tests).
