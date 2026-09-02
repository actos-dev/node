import { ActosAPIError, APIConnectionError, APITimeoutError, createAPIError } from "./errors.js";
import type { RateLimit } from "./types.js";
import { camelToSnake, snakeToCamel, stringCamelToSnake } from "./utils/case.js";
import { VERSION } from "./version.js";

export interface TransportOptions {
  baseUrl?: string;
  apiKey?: string | null;
  timeout?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  userAgent?: string;
}

export interface RequestOptions {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string | null;
  signal?: AbortSignal;
  timeout?: number;
  raw?: boolean;
}

export interface RawRequestInit {
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string | null;
  signal?: AbortSignal;
  timeout?: number;
}

export interface TransportResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  requestId: string | null;
  rateLimit: RateLimit | null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error("Aborted"));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new Error("Aborted"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseRateLimit(headers: Headers): RateLimit | null {
  const limitStr = headers.get("x-ratelimit-limit");
  const remainingStr = headers.get("x-ratelimit-remaining");
  const resetStr = headers.get("x-ratelimit-reset");

  if (!limitStr || !remainingStr || !resetStr) {
    return null;
  }

  const limit = parseInt(limitStr, 10);
  const remaining = parseInt(remainingStr, 10);
  const reset = parseInt(resetStr, 10);

  if (Number.isNaN(limit) || Number.isNaN(remaining) || Number.isNaN(reset)) {
    return null;
  }

  return { limit, remaining, reset };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  try {
    if (
      contentType.includes("application/json") ||
      contentType.includes("application/problem+json")
    ) {
      return await response.json();
    }
    return await response.text();
  } catch {
    return undefined;
  }
}

function computeBackoffDelay(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const parsedDate = new Date(retryAfterHeader).getTime();
    if (!Number.isNaN(parsedDate)) {
      return Math.max(0, parsedDate - Date.now());
    }
  }

  // Exponential backoff with full jitter: uniform random in [0, min(maxDelay, baseDelay * 2^attempt)]
  const baseDelay = 250;
  const maxDelay = 30_000;
  const ceiling = Math.min(maxDelay, baseDelay * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

export class Transport {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly fetchFn: typeof fetch;
  readonly userAgent: string;

  rateLimit: RateLimit | null = null;

  constructor(options: TransportOptions = {}) {
    const rawBaseUrl =
      options.baseUrl ||
      (typeof process !== "undefined" && process.env?.ACTOS_BASE_URL) ||
      "http://127.0.0.1:3100";
    this.baseUrl = rawBaseUrl.replace(/\/+$/, "");

    this.apiKey =
      options.apiKey ??
      (typeof process !== "undefined" ? process.env?.ACTOS_API_KEY || null : null);

    this.timeout = options.timeout ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchFn = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.userAgent = options.userAgent ?? `actos-node/${VERSION}`;
  }

  async request<T>(options: RequestOptions): Promise<TransportResponse<T>> {
    const cleanPath = options.path.startsWith("/") ? options.path : `/${options.path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null) {
          continue;
        }
        const paramKey = options.raw ? key : stringCamelToSnake(key);
        if (Array.isArray(value)) {
          url.searchParams.set(paramKey, value.map(String).join(","));
        } else {
          url.searchParams.set(paramKey, String(value));
        }
      }
    }

    const headers = new Headers();
    headers.set("Accept", "application/json");

    try {
      headers.set("User-Agent", this.userAgent);
    } catch {
      // Browser environment may disallow setting User-Agent header
    }

    if (this.apiKey) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }

    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }

    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        headers.set(k, v);
      }
    }

    let requestBody: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (options.raw) {
        if (typeof options.body === "string") {
          requestBody = options.body;
          if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
          }
        } else if (typeof FormData !== "undefined" && options.body instanceof FormData) {
          requestBody = options.body;
        } else if (typeof Blob !== "undefined" && options.body instanceof Blob) {
          requestBody = options.body;
          if (options.body.type && !headers.has("Content-Type")) {
            headers.set("Content-Type", options.body.type);
          }
        } else if (options.body instanceof ArrayBuffer || ArrayBuffer.isView(options.body)) {
          requestBody = options.body as unknown as BodyInit;
        } else {
          if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
          }
          requestBody = JSON.stringify(options.body);
        }
      } else {
        if (typeof FormData !== "undefined" && options.body instanceof FormData) {
          requestBody = options.body;
        } else if (typeof Blob !== "undefined" && options.body instanceof Blob) {
          requestBody = options.body;
          if (options.body.type && !headers.has("Content-Type")) {
            headers.set("Content-Type", options.body.type);
          }
        } else if (options.body instanceof ArrayBuffer || ArrayBuffer.isView(options.body)) {
          requestBody = options.body as unknown as BodyInit;
        } else {
          if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
          }
          const converted = camelToSnake(options.body);
          requestBody = JSON.stringify(converted);
        }
      }
    }

    const isPost = options.method.toUpperCase() === "POST";
    const hasIdempotencyKey = Boolean(options.idempotencyKey || headers.get("Idempotency-Key"));
    // Non-POST requests or POST with Idempotency-Key can be retried on 5xx
    const canRetry5xx = !isPost || hasIdempotencyKey;

    const timeoutMs = options.timeout ?? this.timeout;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const timeoutCtrl = new AbortController();
      const timer = setTimeout(() => {
        timeoutCtrl.abort(new APITimeoutError(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      let signal = timeoutCtrl.signal;
      if (options.signal) {
        if (typeof AbortSignal.any === "function") {
          signal = AbortSignal.any([timeoutCtrl.signal, options.signal]);
        } else {
          options.signal.addEventListener(
            "abort",
            () => timeoutCtrl.abort(options.signal?.reason),
            { once: true },
          );
        }
      }

      try {
        const response = await this.fetchFn(url.toString(), {
          method: options.method,
          headers,
          body: requestBody,
          signal,
        });

        clearTimeout(timer);

        const rateLimit = parseRateLimit(response.headers);
        if (rateLimit) {
          this.rateLimit = rateLimit;
        }

        const requestId = response.headers.get("x-request-id");

        // Success response
        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          let data: T;

          if (response.status === 204 || response.headers.get("content-length") === "0") {
            data = undefined as unknown as T;
          } else if (
            contentType.includes("application/json") ||
            contentType.includes("application/problem+json")
          ) {
            const raw = await response.json();
            data = options.raw ? (raw as T) : snakeToCamel<T>(raw);
          } else {
            data = (await response.text()) as unknown as T;
          }

          return {
            data,
            status: response.status,
            headers: response.headers,
            requestId,
            rateLimit: this.rateLimit,
          };
        }

        // 429 Too Many Requests: retry after backoff if retries remaining
        if (response.status === 429 && attempt < this.maxRetries) {
          const retryAfter = response.headers.get("retry-after");
          const delay = computeBackoffDelay(attempt, retryAfter);
          await sleep(delay, options.signal);
          continue;
        }

        // 5xx Server Error: retry if idempotent and retries remaining
        if (
          response.status >= 500 &&
          response.status <= 599 &&
          canRetry5xx &&
          attempt < this.maxRetries
        ) {
          const delay = computeBackoffDelay(attempt);
          await sleep(delay, options.signal);
          continue;
        }

        // Other status codes or retries exhausted: throw specific ActosAPIError subclass
        const errorData = await parseResponseBody(response);
        const error = createAPIError({
          status: response.status,
          data: errorData,
          headers: response.headers,
          requestId,
          rateLimit: this.rateLimit,
        });
        throw error;
      } catch (err: unknown) {
        clearTimeout(timer);

        // If caller explicitly aborted, do not retry
        if (options.signal?.aborted) {
          throw options.signal.reason ?? err;
        }

        // If request timed out, throw APITimeoutError
        if (timeoutCtrl.signal.aborted) {
          throw (
            timeoutCtrl.signal.reason ??
            new APITimeoutError(`Request timed out after ${timeoutMs}ms`)
          );
        }

        // If already an ActosAPIError (thrown above), don't wrap, throw directly
        if (err instanceof ActosAPIError) {
          throw err;
        }

        // Network error (fetch failed, DNS, drop): retry if idempotent and retries remaining
        if (canRetry5xx && attempt < this.maxRetries) {
          const delay = computeBackoffDelay(attempt);
          await sleep(delay, options.signal);
          continue;
        }

        throw new APIConnectionError(err instanceof Error ? err.message : "Connection error", {
          cause: err,
        });
      }
    }

    throw new APIConnectionError("Max retries exhausted");
  }

  /**
   * Raw escape hatch HTTP request without automatic case conversion.
   */
  async rawRequest<T>(method: string, path: string, init: RawRequestInit = {}): Promise<T> {
    const res = await this.request<T>({
      method,
      path,
      query: init.query,
      body: init.body,
      headers: init.headers,
      idempotencyKey: init.idempotencyKey,
      signal: init.signal,
      timeout: init.timeout,
      raw: true,
    });
    return res.data;
  }
}
