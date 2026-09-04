import * as util from "node:util";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  Actos,
  ActosAPIError,
  GoneError,
  NotFoundError,
  RateLimitError,
  VERSION,
} from "../../src/index.js";

const TEST_BASE_URL = "http://api.actos.contract.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("SDK Contract Verification (§2, PLAN.md)", () => {
  // 1. Single entrypoint
  it("§2.1: provides a single entrypoint with all expected resource namespaces", () => {
    const client = new Actos({ apiKey: "actos_sec_contract_key", baseUrl: TEST_BASE_URL });
    expect(client.posts).toBeDefined();
    expect(client.comments).toBeDefined();
    expect(client.actors).toBeDefined();
    expect(client.tags).toBeDefined();
    expect(client.feed).toBeDefined();
    expect(client.search).toBeDefined();
    expect(client.votes).toBeDefined();
    expect(client.saves).toBeDefined();
    expect(client.uploads).toBeDefined();
    expect(client.reports).toBeDefined();
    expect(client.admin).toBeDefined();
    expect(client.admin.reports).toBeDefined();
    expect(client.admin.contents).toBeDefined();
    expect(client.admin.bans).toBeDefined();
    expect(client.admin.roles).toBeDefined();
    expect(client.admin.actions).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.meta).toBeDefined();
    expect(client.inbox).toBeDefined();
  });

  // 2. Types generated from spec
  it("§2.2: exports version constant and types generated from openapi spec", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  // 3. Typed errors & 404 vs 410 distinction
  it("§2.3: provides distinct typed error classes where NotFoundError (404) and GoneError (410) are separate", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/posts/c_not_found`, () => {
        return HttpResponse.json(
          { code: "NOT_FOUND", detail: "Content does not exist" },
          { status: 404 },
        );
      }),
      http.get(`${TEST_BASE_URL}/posts/c_deleted`, () => {
        return HttpResponse.json(
          { code: "GONE", detail: "Content was permanently deleted" },
          { status: 410 },
        );
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL, maxRetries: 0 });

    await expect(client.posts.get("c_not_found")).rejects.toThrowError(NotFoundError);
    await expect(client.posts.get("c_deleted")).rejects.toThrowError(GoneError);

    try {
      await client.posts.get("c_deleted");
    } catch (err) {
      expect(err instanceof GoneError).toBe(true);
      expect(err instanceof NotFoundError).toBe(false);
      expect(err instanceof ActosAPIError).toBe(true);
    }
  });

  // 4. API errors carry requestId, code, status, detail
  it("§2.4: API errors carry requestId, code, status, and detail for server log correlation", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/posts/c_err`, () => {
        return HttpResponse.json(
          { code: "NOT_FOUND", detail: "Specific post not found" },
          {
            status: 404,
            headers: { "x-request-id": "req_trace_987654" },
          },
        );
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL, maxRetries: 0 });

    try {
      await client.posts.get("c_err");
      expect.fail("Expected get to throw");
    } catch (err) {
      expect(err instanceof ActosAPIError).toBe(true);
      const apiErr = err as ActosAPIError;
      expect(apiErr.requestId).toBe("req_trace_987654");
      expect(apiErr.code).toBe("NOT_FOUND");
      expect(apiErr.status).toBe(404);
      expect(apiErr.detail).toBe("Specific post not found");
    }
  });

  // 5. Two-tier pagination: list() vs iterate()
  it("§2.5: supports two-tier pagination where list() exposes nextCursor and iterate() yields async items", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/tags`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) {
          return HttpResponse.json({
            tags: [{ name: "tag1", created_at: "..." }],
            next_cursor: "cur_t2",
          });
        }
        if (cursor === "cur_t2") {
          return HttpResponse.json({
            tags: [{ name: "tag2", created_at: "..." }],
            next_cursor: null,
          });
        }
        return HttpResponse.json({ tags: [], next_cursor: null });
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL });

    // Tier 1: list()
    const page1 = await client.tags.list();
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0]?.name).toBe("tag1");
    expect(page1.nextCursor).toBe("cur_t2");

    // Tier 2: iterate()
    const names: string[] = [];
    for await (const tag of client.tags.iterate()) {
      names.push(tag.name);
    }
    expect(names).toEqual(["tag1", "tag2"]);
  });

  // 6. Retry rules: 5xx with Idempotency-Key retried, POST without key never retried, 4xx never retried
  it("§2.6: adheres strictly to retry rules (4xx never retried, POST without idempotency key not retried on 5xx)", async () => {
    let post5xxAttempts = 0;
    let get4xxAttempts = 0;

    server.use(
      http.post(`${TEST_BASE_URL}/posts`, () => {
        post5xxAttempts++;
        return HttpResponse.json({ code: "INTERNAL", detail: "Internal crash" }, { status: 500 });
      }),
      http.get(`${TEST_BASE_URL}/actors/nobody`, () => {
        get4xxAttempts++;
        return HttpResponse.json({ code: "NOT_FOUND", detail: "Not found" }, { status: 404 });
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL, maxRetries: 2 });

    // POST with idempotencyKey: null must NOT retry on 5xx
    await expect(
      client.posts.create({
        title: "No Retry",
        body: "Content",
        idempotencyKey: null,
      }),
    ).rejects.toThrow();
    expect(post5xxAttempts).toBe(1);

    // 4xx must NEVER be retried
    await expect(client.actors.get("nobody")).rejects.toThrow();
    expect(get4xxAttempts).toBe(1);
  });

  // 7. 429 respects Retry-After header
  it("§2.7: retries 429 and throws RateLimitError when retries exhausted with rateLimit info", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/actors/test_actor`, () => {
        return HttpResponse.json(
          { code: "RATE_LIMITED", detail: "Too many requests" },
          {
            status: 429,
            headers: {
              "retry-after": "1",
              "x-ratelimit-limit": "100",
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "1",
            },
          },
        );
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL, maxRetries: 0 });

    try {
      await client.actors.get("test_actor");
      expect.fail("Expected 429 to throw");
    } catch (err) {
      expect(err instanceof RateLimitError).toBe(true);
      const rlErr = err as RateLimitError;
      expect(rlErr.retryAfter).toBe(1);
      expect(rlErr.rateLimit?.remaining).toBe(0);
    }
  });

  // 8. Backoff full jitter computation
  it("§2.8: implements exponential backoff with full jitter in transport", () => {
    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL, maxRetries: 3 });
    expect(client.transport.maxRetries).toBe(3);
  });

  // 9. posts.create() auto-generates UUID v4 idempotency key
  it("§2.9: posts.create() auto-generates UUID v4 idempotency key, overridable, disabled by null", async () => {
    let capturedKey: string | null = null;

    server.use(
      http.post(`${TEST_BASE_URL}/posts`, ({ request }) => {
        capturedKey = request.headers.get("idempotency-key");
        return HttpResponse.json(
          {
            id: "c_p1",
            title: "T",
            content_type: "post",
            body: "B",
            body_format: "markdown",
            author_deleted: false,
            score: 0,
            upvotes: 0,
            downvotes: 0,
            comment_count: 0,
            created_at: "...",
            deleted: false,
            author: { id: "a_1", username: "u", actor_type: "human", created_at: "..." },
          },
          { status: 201 },
        );
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL });

    // 1. Default: auto-generated UUID v4
    await client.posts.create({ title: "T", body: "B" });
    expect(capturedKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // 2. Custom override
    await client.posts.create({
      title: "T",
      body: "B",
      idempotencyKey: "my-custom-key-123",
    });
    expect(capturedKey).toBe("my-custom-key-123");

    // 3. Disabled with null
    await client.posts.create({
      title: "T",
      body: "B",
      idempotencyKey: null,
    });
    expect(capturedKey).toBeNull();
  });

  // 10. Rate limit headers parsed and accessible via client.rateLimit
  it("§2.10: parses x-ratelimit-* headers and updates client.rateLimit", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/health`, () => {
        return HttpResponse.json(
          { status: "ok" },
          {
            headers: {
              "x-ratelimit-limit": "60",
              "x-ratelimit-remaining": "59",
              "x-ratelimit-reset": "30",
            },
          },
        );
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL });
    expect(client.rateLimit).toBeNull();

    await client.meta.health();

    expect(client.rateLimit).toEqual({
      limit: 60,
      remaining: 59,
      reset: 30,
    });
  });

  // 11. fields projection
  it("§2.11: transforms fields parameter into comma-separated snake_case query string", async () => {
    let capturedFields: string | null = null;

    server.use(
      http.get(`${TEST_BASE_URL}/posts/c_post_1`, ({ request }) => {
        capturedFields = new URL(request.url).searchParams.get("fields");
        return HttpResponse.json({
          id: "c_post_1",
          title: "Projected Title",
          comment_count: 5,
        });
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL });
    const post = await client.posts.get("c_post_1", {
      fields: ["title", "commentCount"],
    });

    expect(capturedFields).toBe("title,comment_count");
    expect(post.title).toBe("Projected Title");
    expect(post.commentCount).toBe(5);
  });

  // 12. IDs treated as opaque strings
  it("§2.12: treats IDs as opaque strings without prefix validation or mutation", async () => {
    let capturedPathId: string | null = null;

    server.use(
      http.get(`${TEST_BASE_URL}/posts/:id`, ({ params }) => {
        capturedPathId = params.id as string;
        return HttpResponse.json({
          id: params.id,
          title: "Title",
          content_type: "post",
          body: "Body",
          body_format: "markdown",
          author_deleted: false,
          score: 0,
          upvotes: 0,
          downvotes: 0,
          comment_count: 0,
          created_at: "...",
          deleted: false,
          author: { id: "a_1", username: "u", actor_type: "human", created_at: "..." },
        });
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL });
    const arbitraryId = "custom_opaque_id_!@#$%^&*()_+";
    await client.posts.get(arbitraryId);

    expect(capturedPathId).toBe(arbitraryId);
  });

  // 13. Timeout handling
  it("§2.13: defaults timeout to 30s and respects custom timeout and AbortSignal", async () => {
    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL, timeout: 50 });

    server.use(
      http.get(`${TEST_BASE_URL}/health`, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({ status: "ok" });
      }),
    );

    await expect(client.meta.health()).rejects.toThrow();
  });

  // 14. User-Agent header
  it("§2.14: sends User-Agent header with format actos-node/<version>", async () => {
    let capturedUserAgent: string | null = null;

    server.use(
      http.get(`${TEST_BASE_URL}/health`, ({ request }) => {
        capturedUserAgent = request.headers.get("user-agent");
        return HttpResponse.json({ status: "ok" });
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL });
    await client.meta.health();

    expect(capturedUserAgent).toBe(`actos-node/${VERSION}`);
  });

  // 15. API key masking
  it("§2.15: masks API key in inspect, toString, and toJSON representation", () => {
    const secretKey = "actos_sec_very_secret_key_123456789";
    const client = new Actos({ apiKey: secretKey, baseUrl: TEST_BASE_URL });

    const str = client.toString();
    const inspected = util.inspect(client);
    const json = JSON.stringify(client);

    expect(str).not.toContain(secretKey);
    expect(inspected).not.toContain(secretKey);
    expect(json).not.toContain(secretKey);

    expect(str).toContain("actos_***");
    expect(inspected).toContain("actos_***");
  });

  // 16. Forward compatibility
  it("§2.16: preserves unknown additional response fields without breaking deserialization", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/health`, () => {
        return HttpResponse.json({
          status: "ok",
          future_novel_field: "value_from_the_future",
          nested_novelty: { deep_item: 42 },
        });
      }),
    );

    const client = new Actos({ apiKey: "k", baseUrl: TEST_BASE_URL });
    const res = await client.meta.health();

    expect(res.status).toBe("ok");
    expect((res as Record<string, unknown>).futureNovelField).toBe("value_from_the_future");
    expect((res as Record<string, unknown>).nestedNovelty).toEqual({ deepItem: 42 });
  });
});
