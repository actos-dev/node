import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ActosAPIError,
  ActosError,
  ActosTransportError,
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  BannedError,
  ConflictError,
  createAPIError,
  ForbiddenError,
  GoneError,
  InternalServerError,
  InvalidCursorError,
  InvalidKeyError,
  NotFoundError,
  RateLimitError,
  UnsupportedMediaError,
  ValidationError,
} from "../../src/errors.js";
import { Transport } from "../../src/transport.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Error class hierarchy", () => {
  describe("Inheritance hierarchy", () => {
    it("preserves proper inheritance chains", () => {
      const invalidKey = new InvalidKeyError({
        detail: "Key revoked",
        requestId: "req_1",
      });
      expect(invalidKey).toBeInstanceOf(InvalidKeyError);
      expect(invalidKey).toBeInstanceOf(AuthenticationError);
      expect(invalidKey).toBeInstanceOf(ActosAPIError);
      expect(invalidKey).toBeInstanceOf(ActosError);
      expect(invalidKey).toBeInstanceOf(Error);
      expect(invalidKey.name).toBe("InvalidKeyError");
      expect(invalidKey.code).toBe("INVALID_KEY");
      expect(invalidKey.status).toBe(401);

      const banned = new BannedError({
        detail: "User is banned",
        requestId: "req_2",
      });
      expect(banned).toBeInstanceOf(BannedError);
      expect(banned).toBeInstanceOf(ForbiddenError);
      expect(banned).toBeInstanceOf(ActosAPIError);
      expect(banned).toBeInstanceOf(ActosError);
      expect(banned.name).toBe("BannedError");
      expect(banned.code).toBe("BANNED");
      expect(banned.status).toBe(403);

      const timeout = new APITimeoutError("Timed out after 30s");
      expect(timeout).toBeInstanceOf(APITimeoutError);
      expect(timeout).toBeInstanceOf(ActosTransportError);
      expect(timeout).toBeInstanceOf(ActosError);
      expect(timeout.name).toBe("APITimeoutError");

      const connection = new APIConnectionError("Socket closed");
      expect(connection).toBeInstanceOf(APIConnectionError);
      expect(connection).toBeInstanceOf(ActosTransportError);
      expect(connection).toBeInstanceOf(ActosError);
      expect(connection.name).toBe("APIConnectionError");
    });
  });

  describe("createAPIError factory mapping for all 12 error codes", () => {
    it("maps VALIDATION_FAILED to ValidationError", () => {
      const err = createAPIError({
        status: 400,
        data: { code: "VALIDATION_FAILED", detail: "Invalid title length" },
        requestId: "req_val",
      });
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.name).toBe("ValidationError");
      expect(err.code).toBe("VALIDATION_FAILED");
      expect(err.status).toBe(400);
      expect(err.message).toBe("[400 VALIDATION_FAILED] Invalid title length (requestId=req_val)");
    });

    it("maps INVALID_CURSOR to InvalidCursorError", () => {
      const err = createAPIError({
        status: 400,
        data: { code: "INVALID_CURSOR", detail: "Malformed pagination cursor" },
      });
      expect(err).toBeInstanceOf(InvalidCursorError);
      expect(err.name).toBe("InvalidCursorError");
      expect(err.code).toBe("INVALID_CURSOR");
      expect(err.status).toBe(400);
    });

    it("maps MISSING_CREDENTIALS to AuthenticationError", () => {
      const err = createAPIError({
        status: 401,
        data: { code: "MISSING_CREDENTIALS", detail: "Authorization required" },
      });
      expect(err).toBeInstanceOf(AuthenticationError);
      expect(err.name).toBe("AuthenticationError");
      expect(err.code).toBe("MISSING_CREDENTIALS");
      expect(err.status).toBe(401);
    });

    it("maps INVALID_KEY to InvalidKeyError", () => {
      const err = createAPIError({
        status: 401,
        data: { code: "INVALID_KEY", detail: "API key does not exist" },
      });
      expect(err).toBeInstanceOf(InvalidKeyError);
      expect(err).toBeInstanceOf(AuthenticationError);
      expect(err.name).toBe("InvalidKeyError");
      expect(err.code).toBe("INVALID_KEY");
      expect(err.status).toBe(401);
    });

    it("maps FORBIDDEN to ForbiddenError", () => {
      const err = createAPIError({
        status: 403,
        data: { code: "FORBIDDEN", detail: "Admin role required" },
      });
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.name).toBe("ForbiddenError");
      expect(err.code).toBe("FORBIDDEN");
      expect(err.status).toBe(403);
    });

    it("maps BANNED to BannedError", () => {
      const err = createAPIError({
        status: 403,
        data: { code: "BANNED", detail: "Account suspended until tomorrow" },
      });
      expect(err).toBeInstanceOf(BannedError);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.name).toBe("BannedError");
      expect(err.code).toBe("BANNED");
      expect(err.status).toBe(403);
    });

    it("maps NOT_FOUND to NotFoundError", () => {
      const err = createAPIError({
        status: 404,
        data: { code: "NOT_FOUND", detail: "Post not found" },
        requestId: "req_404",
      });
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.name).toBe("NotFoundError");
      expect(err.code).toBe("NOT_FOUND");
      expect(err.status).toBe(404);
      expect(err.message).toBe("[404 NOT_FOUND] Post not found (requestId=req_404)");
    });

    it("maps CONFLICT to ConflictError", () => {
      const err = createAPIError({
        status: 409,
        data: { code: "CONFLICT", detail: "Username already taken" },
      });
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.name).toBe("ConflictError");
      expect(err.code).toBe("CONFLICT");
      expect(err.status).toBe(409);
    });

    it("maps GONE to GoneError", () => {
      const err = createAPIError({
        status: 410,
        data: { code: "GONE", detail: "Content has been permanently deleted" },
        requestId: "req_gone",
      });
      expect(err).toBeInstanceOf(GoneError);
      expect(err.name).toBe("GoneError");
      expect(err.code).toBe("GONE");
      expect(err.status).toBe(410);
      expect(err.message).toBe(
        "[410 GONE] Content has been permanently deleted (requestId=req_gone)",
      );
    });

    it("maps UNSUPPORTED_MEDIA to UnsupportedMediaError", () => {
      const err = createAPIError({
        status: 415,
        data: { code: "UNSUPPORTED_MEDIA", detail: "Only image/webp is supported" },
      });
      expect(err).toBeInstanceOf(UnsupportedMediaError);
      expect(err.name).toBe("UnsupportedMediaError");
      expect(err.code).toBe("UNSUPPORTED_MEDIA");
      expect(err.status).toBe(415);
    });

    it("maps RATE_LIMITED to RateLimitError with retryAfter and rateLimit", () => {
      const headers = new Headers({
        "retry-after": "12",
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1725300060",
      });

      const err = createAPIError({
        status: 429,
        data: { code: "RATE_LIMITED", detail: "Quota exceeded" },
        headers,
        rateLimit: { limit: 60, remaining: 0, reset: 1725300060 },
      });

      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.name).toBe("RateLimitError");
      expect(err.code).toBe("RATE_LIMITED");
      expect(err.status).toBe(429);
      expect(err).toBeInstanceOf(RateLimitError);
      if (err instanceof RateLimitError) {
        expect(err.retryAfter).toBe(12);
        expect(err.rateLimit).toEqual({ limit: 60, remaining: 0, reset: 1725300060 });
      }
    });

    it("maps INTERNAL to InternalServerError", () => {
      const err = createAPIError({
        status: 500,
        data: { code: "INTERNAL", detail: "Internal error occurred" },
      });
      expect(err).toBeInstanceOf(InternalServerError);
      expect(err.name).toBe("InternalServerError");
      expect(err.code).toBe("INTERNAL");
      expect(err.status).toBe(500);
    });
  });

  describe("Edge cases and fallbacks", () => {
    it("handles unknown code by returning base ActosAPIError", () => {
      const err = createAPIError({
        status: 418,
        data: { code: "TEAPOT_ERROR", detail: "I am a teapot" },
        requestId: "req_tea",
      });

      expect(err).toBeInstanceOf(ActosAPIError);
      expect(err.name).toBe("ActosAPIError");
      expect(err.code).toBe("TEAPOT_ERROR");
      expect(err.status).toBe(418);
      expect(err.detail).toBe("I am a teapot");
      expect(err.message).toBe("[418 TEAPOT_ERROR] I am a teapot (requestId=req_tea)");
    });

    it("falls back to status code mapping when body is empty or non-JSON HTML", () => {
      const html502 = "<html><body>502 Bad Gateway</body></html>";
      const err = createAPIError({
        status: 502,
        data: html502,
      });

      expect(err).toBeInstanceOf(InternalServerError);
      expect(err.status).toBe(502);
      expect(err.code).toBe("INTERNAL");
      expect(err.detail).toBe(html502);

      const empty404 = createAPIError({
        status: 404,
        data: "",
      });
      expect(empty404).toBeInstanceOf(NotFoundError);
      expect(empty404.status).toBe(404);
      expect(empty404.code).toBe("NOT_FOUND");
    });
  });

  describe("Integration with Transport", () => {
    it("throws GoneError when server returns 410 GONE", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/posts/deleted`, () => {
          return HttpResponse.json(
            { code: "GONE", detail: "This post was deleted by author" },
            { status: 410, headers: { "x-request-id": "req_gone_1" } },
          );
        }),
      );

      const transport = new Transport({ baseUrl: TEST_BASE_URL, maxRetries: 0 });

      try {
        await transport.request({ method: "GET", path: "/posts/deleted" });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(GoneError);
        const gone = err as GoneError;
        expect(gone.name).toBe("GoneError");
        expect(gone.status).toBe(410);
        expect(gone.code).toBe("GONE");
        expect(gone.detail).toBe("This post was deleted by author");
        expect(gone.requestId).toBe("req_gone_1");
      }
    });

    it("throws ValidationError when server returns 400 VALIDATION_FAILED", async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/posts`, () => {
          return HttpResponse.json(
            { code: "VALIDATION_FAILED", detail: "Title cannot be empty" },
            { status: 400 },
          );
        }),
      );

      const transport = new Transport({ baseUrl: TEST_BASE_URL, maxRetries: 0 });

      await expect(
        transport.request({ method: "POST", path: "/posts", body: {} }),
      ).rejects.toThrowError(ValidationError);
    });

    it("throws InvalidKeyError when server returns 401 INVALID_KEY", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/me`, () => {
          return HttpResponse.json(
            { code: "INVALID_KEY", detail: "API key is invalid or expired" },
            { status: 401 },
          );
        }),
      );

      const transport = new Transport({ baseUrl: TEST_BASE_URL, maxRetries: 0 });

      try {
        await transport.request({ method: "GET", path: "/me" });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(InvalidKeyError);
        expect(err).toBeInstanceOf(AuthenticationError);
        const authErr = err as InvalidKeyError;
        expect(authErr.name).toBe("InvalidKeyError");
        expect(authErr.code).toBe("INVALID_KEY");
      }
    });
  });
});
