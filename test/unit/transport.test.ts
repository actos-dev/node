import { delay, HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ActosAPIError, APIConnectionError, APITimeoutError } from "../../src/errors.js";
import { Transport } from "../../src/transport.js";

const TEST_BASE_URL = "http://api.actos.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Transport Layer", () => {
  it("sends Authorization and User-Agent headers", async () => {
    let capturedAuth: string | null = null;
    let capturedUserAgent: string | null = null;

    server.use(
      http.get(`${TEST_BASE_URL}/test-headers`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        capturedUserAgent = request.headers.get("user-agent");
        return HttpResponse.json({ success: true });
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      apiKey: "secret_token_123",
      userAgent: "actos-node/0.1.0",
    });

    const res = await transport.request<{ success: boolean }>({
      method: "GET",
      path: "/test-headers",
    });

    expect(res.data).toEqual({ success: true });
    expect(capturedAuth).toBe("Bearer secret_token_123");
    expect(capturedUserAgent).toBe("actos-node/0.1.0");
  });

  it("extracts and updates rate-limit headers", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/rate-limited`, () => {
        return HttpResponse.json(
          { ok: true },
          {
            headers: {
              "x-ratelimit-limit": "120",
              "x-ratelimit-remaining": "115",
              "x-ratelimit-reset": "1725300000",
              "x-request-id": "req_abc123",
            },
          },
        );
      }),
    );

    const transport = new Transport({ baseUrl: TEST_BASE_URL });
    expect(transport.rateLimit).toBeNull();

    const res = await transport.request<{ ok: boolean }>({
      method: "GET",
      path: "/rate-limited",
    });

    expect(res.requestId).toBe("req_abc123");
    expect(res.rateLimit).toEqual({
      limit: 120,
      remaining: 115,
      reset: 1725300000,
    });
    expect(transport.rateLimit).toEqual({
      limit: 120,
      remaining: 115,
      reset: 1725300000,
    });
  });

  it("retries on 5xx and succeeds on second attempt", async () => {
    let attempts = 0;

    server.use(
      http.get(`${TEST_BASE_URL}/flaky-endpoint`, () => {
        attempts++;
        if (attempts === 1) {
          return new HttpResponse("Internal Server Error", { status: 500 });
        }
        return HttpResponse.json({ recovered: true });
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      maxRetries: 2,
    });

    const res = await transport.request<{ recovered: boolean }>({
      method: "GET",
      path: "/flaky-endpoint",
    });

    expect(attempts).toBe(2);
    expect(res.data).toEqual({ recovered: true });
    expect(res.status).toBe(200);
  });

  it("does NOT retry on 4xx client errors (404, 400, 401)", async () => {
    let attempts = 0;

    server.use(
      http.get(`${TEST_BASE_URL}/not-found`, () => {
        attempts++;
        return HttpResponse.json({ code: "NOT_FOUND", detail: "Post not found" }, { status: 404 });
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      maxRetries: 2,
    });

    await expect(
      transport.request({
        method: "GET",
        path: "/not-found",
      }),
    ).rejects.toThrowError(ActosAPIError);

    // Exactly 1 attempt, no retry
    expect(attempts).toBe(1);
  });

  it("does NOT retry POST on 5xx without Idempotency-Key", async () => {
    let attempts = 0;

    server.use(
      http.post(`${TEST_BASE_URL}/posts`, () => {
        attempts++;
        return HttpResponse.json(
          { code: "INTERNAL", detail: "Database connection failed" },
          { status: 500 },
        );
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      maxRetries: 2,
    });

    await expect(
      transport.request({
        method: "POST",
        path: "/posts",
        body: { title: "Danger" },
      }),
    ).rejects.toThrowError(ActosAPIError);

    // POST without Idempotency-Key must not be retried to prevent duplicate mutation
    expect(attempts).toBe(1);
  });

  it("DOES retry POST on 5xx when Idempotency-Key is present", async () => {
    let attempts = 0;

    server.use(
      http.post(`${TEST_BASE_URL}/posts`, () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.json({ code: "INTERNAL", detail: "Temporary 500" }, { status: 500 });
        }
        return HttpResponse.json({ id: "p_123", title: "Success" });
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      maxRetries: 2,
    });

    const res = await transport.request<{ id: string; title: string }>({
      method: "POST",
      path: "/posts",
      body: { title: "Safe Post" },
      idempotencyKey: "uuid-idempotent-key",
    });

    expect(attempts).toBe(2);
    expect(res.data.id).toBe("p_123");
  });

  it("retries 429 respecting Retry-After header", async () => {
    let attempts = 0;

    server.use(
      http.get(`${TEST_BASE_URL}/rate-limited-feed`, () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.json(
            { code: "RATE_LIMITED", detail: "Too many requests" },
            {
              status: 429,
              headers: { "retry-after": "0" },
            },
          );
        }
        return HttpResponse.json({ feed: ["post1", "post2"] });
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      maxRetries: 2,
    });

    const res = await transport.request<{ feed: string[] }>({
      method: "GET",
      path: "/rate-limited-feed",
    });

    expect(attempts).toBe(2);
    expect(res.data.feed).toEqual(["post1", "post2"]);
  });

  it("throws immediately on 429 if maxRetries: 0", async () => {
    let attempts = 0;

    server.use(
      http.get(`${TEST_BASE_URL}/no-retry-429`, () => {
        attempts++;
        return HttpResponse.json(
          { code: "RATE_LIMITED", detail: "Rate limit exceeded" },
          { status: 429, headers: { "retry-after": "5" } },
        );
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      maxRetries: 0,
    });

    const errorPromise = transport.request({
      method: "GET",
      path: "/no-retry-429",
    });

    await expect(errorPromise).rejects.toThrowError(ActosAPIError);
    expect(attempts).toBe(1);
  });

  it("aborts and throws APITimeoutError when timeout is reached", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/slow`, async () => {
        await delay(300);
        return HttpResponse.json({ ok: true });
      }),
    );

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      timeout: 50,
      maxRetries: 0,
    });

    await expect(
      transport.request({
        method: "GET",
        path: "/slow",
      }),
    ).rejects.toThrowError(APITimeoutError);
  });

  it("respects caller AbortSignal immediately", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/hang`, async () => {
        await delay(500);
        return HttpResponse.json({ ok: true });
      }),
    );

    const transport = new Transport({ baseUrl: TEST_BASE_URL });
    const controller = new AbortController();

    setTimeout(() => controller.abort(), 20);

    await expect(
      transport.request({
        method: "GET",
        path: "/hang",
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("converts outgoing camelCase to snake_case and incoming snake_case to camelCase with metadata exempted", async () => {
    let receivedPayload: unknown;

    server.use(
      http.post(`${TEST_BASE_URL}/complex-case`, async ({ request }) => {
        receivedPayload = await request.json();
        return HttpResponse.json({
          author_username: "agent_smith",
          post_count: 5,
          created_at: "2026-09-02T00:00:00Z",
          metadata: {
            preserved_key: 1,
            anotherCamelKey: "untouched",
          },
        });
      }),
    );

    const transport = new Transport({ baseUrl: TEST_BASE_URL });

    const res = await transport.request<{
      authorUsername: string;
      postCount: number;
      createdAt: string;
      metadata: {
        preserved_key: number;
        anotherCamelKey: string;
      };
    }>({
      method: "POST",
      path: "/complex-case",
      body: {
        authorUsername: "agent_smith",
        displayName: "Smith",
        metadata: {
          clientCustomKey: "preserved",
          snake_case_key: 999,
        },
      },
    });

    // Request payload had keys converted to snake_case except metadata
    expect(receivedPayload).toEqual({
      author_username: "agent_smith",
      display_name: "Smith",
      metadata: {
        clientCustomKey: "preserved",
        snake_case_key: 999,
      },
    });

    // Response payload had keys converted to camelCase except metadata
    expect(res.data).toEqual({
      authorUsername: "agent_smith",
      postCount: 5,
      createdAt: "2026-09-02T00:00:00Z",
      metadata: {
        preserved_key: 1,
        anotherCamelKey: "untouched",
      },
    });
  });

  it("retries on network connection failure and throws APIConnectionError when exhausted", async () => {
    let attempts = 0;

    const transport = new Transport({
      baseUrl: TEST_BASE_URL,
      maxRetries: 2,
      fetch: async () => {
        attempts++;
        throw new TypeError("fetch failed: connection refused");
      },
    });

    await expect(
      transport.request({
        method: "GET",
        path: "/network-fail",
      }),
    ).rejects.toThrowError(APIConnectionError);

    // Initial attempt + 2 retries = 3 attempts
    expect(attempts).toBe(3);
  });
});
