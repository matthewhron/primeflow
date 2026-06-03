# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅        |

## Reporting a Vulnerability

Please **do not** open public issues for security problems.
Report privately via GitHub Security Advisories on this repository, or by
contacting the maintainer. We aim to acknowledge reports within 72 hours.

Prime Flow never handles raw card data — only tokens — and signs all gateway
requests with HMAC-SHA256. Webhook payloads are verified with timing-safe
comparison.
