import type { ErrorCode } from "./types.js";

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
 * Base class for transport-level errors (network failures, timeouts, etc. where no HTTP response was received).
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

/**
 * Thrown when the server responds with an error HTTP status code.
 * Carries RFC 9457 problem details (status, code, detail, requestId).
 */
export class ActosAPIError extends ActosError {
  override name = "ActosAPIError";

  readonly status: number;
  readonly code: ErrorCode | string;
  readonly detail?: string;
  readonly requestId?: string | null;
  readonly rawBody?: unknown;

  constructor(params: {
    status: number;
    code: ErrorCode | string;
    detail?: string;
    requestId?: string | null;
    rawBody?: unknown;
    cause?: unknown;
  }) {
    const idInfo = params.requestId ? ` (requestId=${params.requestId})` : "";
    const detailText = params.detail || "API Error";
    const message = `[${params.status} ${params.code}] ${detailText}${idInfo}`;

    super(message, { cause: params.cause });

    this.status = params.status;
    this.code = params.code;
    this.detail = params.detail;
    this.requestId = params.requestId;
    this.rawBody = params.rawBody;
  }
}
