import type { ErrorCode, RateLimit } from "./types.js";

/**
 * Base class for all errors thrown by the Actos SDK.
 */
export class ActosError extends Error {
  override name = "ActosError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Base class for transport-level errors where no HTTP response was received.
 */
export class ActosTransportError extends ActosError {
  override name = "ActosTransportError";
}

/**
 * Thrown when an HTTP request times out.
 */
export class APITimeoutError extends ActosTransportError {
  override name = "APITimeoutError";

  constructor(message = "Request timed out", options?: { cause?: unknown }) {
    super(message, options);
  }
}

/**
 * Thrown when a network connection cannot be established or drops.
 */
export class APIConnectionError extends ActosTransportError {
  override name = "APIConnectionError";

  constructor(message = "Connection error", options?: { cause?: unknown }) {
    super(message, options);
  }
}

export interface ActosAPIErrorOptions {
  status: number;
  code: ErrorCode | string;
  detail?: string;
  title?: string;
  type?: string;
  requestId?: string | null;
  rawBody?: unknown;
  cause?: unknown;
}

export interface SubclassErrorOptions {
  status?: number;
  detail?: string;
  title?: string;
  type?: string;
  requestId?: string | null;
  rawBody?: unknown;
  cause?: unknown;
}

/**
 * Base class for errors where the server returned an HTTP error response (status >= 400).
 * Implements RFC 9457 Problem Details for HTTP APIs.
 */
export class ActosAPIError extends ActosError {
  override name = "ActosAPIError";

  readonly status: number;
  readonly code: ErrorCode | string;
  readonly detail?: string;
  readonly title?: string;
  readonly type?: string;
  readonly requestId?: string | null;
  readonly rawBody?: unknown;

  constructor(options: ActosAPIErrorOptions) {
    const idInfo = options.requestId ? ` (requestId=${options.requestId})` : "";
    const detailText = options.detail || options.title || `HTTP ${options.status}`;
    const message = `[${options.status} ${options.code}] ${detailText}${idInfo}`;

    super(message, { cause: options.cause });

    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
    this.title = options.title;
    this.type = options.type;
    this.requestId = options.requestId;
    this.rawBody = options.rawBody;
  }
}

/**
 * 400 VALIDATION_FAILED
 */
export class ValidationError extends ActosAPIError {
  override name = "ValidationError";
  override readonly code: "VALIDATION_FAILED" = "VALIDATION_FAILED";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 400,
      code: "VALIDATION_FAILED",
    });
  }
}

/**
 * 400 INVALID_CURSOR
 */
export class InvalidCursorError extends ActosAPIError {
  override name = "InvalidCursorError";
  override readonly code: "INVALID_CURSOR" = "INVALID_CURSOR";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 400,
      code: "INVALID_CURSOR",
    });
  }
}

/**
 * 401 MISSING_CREDENTIALS
 */
export class AuthenticationError extends ActosAPIError {
  override name = "AuthenticationError";
  override readonly code: "MISSING_CREDENTIALS" | "INVALID_KEY" | string;

  constructor(options: SubclassErrorOptions & { code?: string } = {}) {
    const code = options.code ?? "MISSING_CREDENTIALS";
    super({
      ...options,
      status: options.status ?? 401,
      code,
    });
    this.code = code;
  }
}

/**
 * 401 INVALID_KEY (subclass of AuthenticationError)
 */
export class InvalidKeyError extends AuthenticationError {
  override name = "InvalidKeyError";
  override readonly code: "INVALID_KEY" = "INVALID_KEY";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 401,
      code: "INVALID_KEY",
    });
  }
}

/**
 * 403 FORBIDDEN
 */
export class ForbiddenError extends ActosAPIError {
  override name = "ForbiddenError";
  override readonly code: "FORBIDDEN" | "BANNED" | string;

  constructor(options: SubclassErrorOptions & { code?: string } = {}) {
    const code = options.code ?? "FORBIDDEN";
    super({
      ...options,
      status: options.status ?? 403,
      code,
    });
    this.code = code;
  }
}

/**
 * 403 BANNED (subclass of ForbiddenError)
 */
export class BannedError extends ForbiddenError {
  override name = "BannedError";
  override readonly code: "BANNED" = "BANNED";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 403,
      code: "BANNED",
    });
  }
}

/**
 * 404 NOT_FOUND
 */
export class NotFoundError extends ActosAPIError {
  override name = "NotFoundError";
  override readonly code: "NOT_FOUND" = "NOT_FOUND";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 404,
      code: "NOT_FOUND",
    });
  }
}

/**
 * 409 CONFLICT
 */
export class ConflictError extends ActosAPIError {
  override name = "ConflictError";
  override readonly code: "CONFLICT" = "CONFLICT";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 409,
      code: "CONFLICT",
    });
  }
}

/**
 * 410 GONE
 */
export class GoneError extends ActosAPIError {
  override name = "GoneError";
  override readonly code: "GONE" = "GONE";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 410,
      code: "GONE",
    });
  }
}

/**
 * 415 UNSUPPORTED_MEDIA
 */
export class UnsupportedMediaError extends ActosAPIError {
  override name = "UnsupportedMediaError";
  override readonly code: "UNSUPPORTED_MEDIA" = "UNSUPPORTED_MEDIA";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 415,
      code: "UNSUPPORTED_MEDIA",
    });
  }
}

export interface RateLimitErrorOptions extends SubclassErrorOptions {
  retryAfter?: number;
  rateLimit?: RateLimit;
}

/**
 * 429 RATE_LIMITED
 */
export class RateLimitError extends ActosAPIError {
  override name = "RateLimitError";
  override readonly code: "RATE_LIMITED" = "RATE_LIMITED";
  readonly retryAfter?: number;
  readonly rateLimit?: RateLimit;

  constructor(options: RateLimitErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 429,
      code: "RATE_LIMITED",
    });
    this.retryAfter = options.retryAfter;
    this.rateLimit = options.rateLimit;
  }
}

/**
 * 5xx INTERNAL
 */
export class InternalServerError extends ActosAPIError {
  override name = "InternalServerError";
  override readonly code: "INTERNAL" = "INTERNAL";

  constructor(options: SubclassErrorOptions = {}) {
    super({
      ...options,
      status: options.status ?? 500,
      code: "INTERNAL",
    });
  }
}

export interface CreateAPIErrorParams {
  status: number;
  data?: unknown;
  headers?: Headers;
  requestId?: string | null;
  rateLimit?: RateLimit | null;
  cause?: unknown;
}

/**
 * Factory that parses an HTTP error response and instantiates the exact specific ActosAPIError subclass.
 * Falls back to base ActosAPIError for unknown codes.
 */
export function createAPIError(params: CreateAPIErrorParams): ActosAPIError {
  let code: string | undefined;
  let detail: string | undefined;
  let title: string | undefined;
  let type: string | undefined;
  let requestId = params.requestId ?? params.headers?.get("x-request-id") ?? null;
  const rawBody = params.data;

  if (typeof params.data === "object" && params.data !== null) {
    const obj = params.data as Record<string, unknown>;
    if (typeof obj.code === "string") {
      code = obj.code;
    }
    if (typeof obj.detail === "string") {
      detail = obj.detail;
    }
    if (typeof obj.title === "string") {
      title = obj.title;
    }
    if (typeof obj.type === "string") {
      type = obj.type;
    }
    if (!requestId) {
      if (typeof obj.request_id === "string") {
        requestId = obj.request_id;
      } else if (typeof obj.requestId === "string") {
        requestId = obj.requestId;
      }
    }
  } else if (typeof params.data === "string" && params.data.length > 0) {
    detail = params.data;
  }

  if (!code) {
    switch (params.status) {
      case 400:
        code = "VALIDATION_FAILED";
        break;
      case 401:
        code = "MISSING_CREDENTIALS";
        break;
      case 403:
        code = "FORBIDDEN";
        break;
      case 404:
        code = "NOT_FOUND";
        break;
      case 409:
        code = "CONFLICT";
        break;
      case 410:
        code = "GONE";
        break;
      case 415:
        code = "UNSUPPORTED_MEDIA";
        break;
      case 429:
        code = "RATE_LIMITED";
        break;
      default:
        code = "INTERNAL";
        break;
    }
  }

  const baseOptions: SubclassErrorOptions = {
    status: params.status,
    detail,
    title,
    type,
    requestId,
    rawBody,
    cause: params.cause,
  };

  switch (code) {
    case "VALIDATION_FAILED":
      return new ValidationError(baseOptions);
    case "INVALID_CURSOR":
      return new InvalidCursorError(baseOptions);
    case "MISSING_CREDENTIALS":
      return new AuthenticationError(baseOptions);
    case "INVALID_KEY":
      return new InvalidKeyError(baseOptions);
    case "FORBIDDEN":
      return new ForbiddenError(baseOptions);
    case "BANNED":
      return new BannedError(baseOptions);
    case "NOT_FOUND":
      return new NotFoundError(baseOptions);
    case "CONFLICT":
      return new ConflictError(baseOptions);
    case "GONE":
      return new GoneError(baseOptions);
    case "UNSUPPORTED_MEDIA":
      return new UnsupportedMediaError(baseOptions);
    case "RATE_LIMITED": {
      let retryAfter: number | undefined;
      const retryAfterHeader = params.headers?.get("retry-after");
      if (retryAfterHeader) {
        const seconds = parseInt(retryAfterHeader, 10);
        if (!Number.isNaN(seconds)) {
          retryAfter = seconds;
        } else {
          const parsedDate = new Date(retryAfterHeader).getTime();
          if (!Number.isNaN(parsedDate)) {
            retryAfter = Math.max(0, Math.ceil((parsedDate - Date.now()) / 1000));
          }
        }
      }
      return new RateLimitError({
        ...baseOptions,
        retryAfter,
        rateLimit: params.rateLimit ?? undefined,
      });
    }
    case "INTERNAL":
      return new InternalServerError(baseOptions);
    default:
      // Unknown code from future backend: return base ActosAPIError
      return new ActosAPIError({
        ...baseOptions,
        status: params.status,
        code,
      });
  }
}
