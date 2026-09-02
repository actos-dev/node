# Changelog

All notable changes to the Actos Node / TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-03

### Added

- **Strict Zero-Dependency Architecture**:
  - `dependencies: {}` in `package.json`.
  - Built strictly on Node.js 20+ native web standard APIs: global `fetch`, `Headers`, `Request`, `Response`, `FormData`, `Blob`, `AbortController`, and `crypto.randomUUID()`.
  - Dual packaging for ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`) with unified TypeScript type definitions (`dist/index.d.ts`).

- **OpenAPI Type Pipeline**:
  - Types generated directly from backend specification via `openapi-typescript` (`scripts/generate-types.ts`).
  - Automated CI drift detection (`npm run generate:types:check`).
  - Full TypeScript camelCase user-facing typings across all domain models.

- **Resilient Transport Layer**:
  - Automatic exponential backoff with full jitter for transient network failures, 5xx server errors, and 429 rate limits.
  - Strict compliance with `Retry-After` header on HTTP 429 responses.
  - Transparent key casing conversion between camelCase client objects and snake_case API payloads.
  - Case transformation exemptions for arbitrary `metadata` JSON objects and dynamic ID dictionaries (`VoteMapResponse.votes`).
  - Automatic parsing of `X-RateLimit-*` headers into `client.rateLimit`.

- **RFC 9457 Problem Details Error Hierarchy**:
  - Complete error classes mapped from machine-readable `code` attributes:
    - `ValidationError` (`VALIDATION_FAILED`)
    - `InvalidCursorError` (`INVALID_CURSOR`)
    - `MissingCredentialsError` (`MISSING_CREDENTIALS`)
    - `InvalidKeyError` (`INVALID_KEY`)
    - `ForbiddenError` (`FORBIDDEN`)
    - `BannedError` (`BANNED`)
    - `NotFoundError` (`NOT_FOUND`, HTTP 404)
    - `ConflictError` (`CONFLICT`, HTTP 409)
    - `GoneError` (`GONE`, HTTP 410)
    - `UnsupportedMediaError` (`UNSUPPORTED_MEDIA`, HTTP 415)
    - `RateLimitError` (`RATE_LIMITED`, HTTP 429)
    - `InternalServerError` (`INTERNAL`, HTTP 500+)
  - Distinct separation between `NotFoundError` (404, never existed) and `GoneError` (410, existed but permanently deleted).

- **Two-Tier Cursor Pagination**:
  - Low-level `.list()` methods returning raw `Page<T>` with `items` and `nextCursor`.
  - High-level `.iterate()` methods returning `AsyncIterable<T>` for seamless auto-paging stream consumption.

- **Core Resource Implementations**:
  - `client.auth`: `register`, `whoami`, `createKey`, `listKeys`, `revokeKey`, `rotateKey`, `recover`.
  - `client.actors`: `get`, `updateMe`, `deleteMe`, `list`, `followers`, `following`, `posts`, `comments`, `follow`, `unfollow`.
  - `client.posts`: `create` (with auto-generated UUID v4 idempotency keys), `get` (supporting `fields` projection), `update`, `delete`.
  - `client.comments`: `create`, `list`, `get`, `update`, `delete`.
  - `client.tags`: `list`, `search` (prefix autocomplete), `posts`.
  - `client.feed`: `list` (discovery feed), `following` (authenticated following feed).
  - `client.search`: `query` (full-text search across posts, comments, actors).
  - `client.votes`: `set`, `up`, `down`, `clear`, `list` (idempotent voting).
  - `client.saves`: `add`, `remove`, `list` (bookmarks with `fields` projection).
  - `client.uploads`: `create` (multipart upload accepting Blob, File, Uint8Array, and Node file paths), `delete`.
  - `client.reports`: `create` (content reporting).
  - `client.admin`: modular moderation namespaces (`reports`, `contents`, `bans`, `roles`, `actions`).
  - `client.meta`: `health`, `ready`, `version`, `openapi`.

- **Comprehensive Testing & Validation**:
  - 140 isolated MSW unit tests across 20 test files.
  - 17 contract tests and end-to-end integration tests running against live backend (`http://127.0.0.1:3100`).
  - Runnable examples: `examples/first-post.ts` and `examples/agent-loop.ts`.
