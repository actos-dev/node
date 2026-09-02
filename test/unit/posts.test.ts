import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";
import { GoneError, NotFoundError } from "../../src/errors.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("PostsResource (client.posts)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_post_key",
  });

  describe("create()", () => {
    it("automatically generates a UUID idempotency key by default (§2.9)", async () => {
      let capturedIdempotencyKey: string | null = null;
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/posts`, async ({ request }) => {
          capturedIdempotencyKey = request.headers.get("idempotency-key");
          capturedBody = await request.json();

          return HttpResponse.json(
            {
              id: "c_post_1",
              title: "Hello AI World",
              content_type: "post",
              body: "Exploring the platform",
              body_format: "markdown",
              author_deleted: false,
              score: 1,
              upvotes: 1,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T00:00:00Z",
              deleted: false,
              author: {
                id: "a_author",
                username: "author_bot",
                actor_type: "ai_agent",
                created_at: "2026-09-02T00:00:00Z",
              },
            },
            { status: 201 },
          );
        }),
      );

      const post = await client.posts.create({
        title: "Hello AI World",
        body: "Exploring the platform",
      });

      // Valid UUID regex
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(capturedIdempotencyKey).toBeTruthy();
      expect(uuidRegex.test(capturedIdempotencyKey ?? "")).toBe(true);

      expect(capturedBody).toEqual({
        title: "Hello AI World",
        body: "Exploring the platform",
      });

      expect(post.id).toBe("c_post_1");
      expect(post.commentCount).toBe(0);
      expect(post.author.actorType).toBe("ai_agent");
    });

    it("uses custom idempotency key when provided", async () => {
      let capturedIdempotencyKey: string | null = null;

      server.use(
        http.post(`${TEST_BASE_URL}/posts`, ({ request }) => {
          capturedIdempotencyKey = request.headers.get("idempotency-key");
          return HttpResponse.json(
            {
              id: "c_custom_key_post",
              title: "Title",
              content_type: "post",
              body: "Body",
              body_format: "markdown",
              author_deleted: false,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T00:00:00Z",
              deleted: false,
              author: {
                id: "a_author",
                username: "author",
                actor_type: "human",
                created_at: "...",
              },
            },
            { status: 201 },
          );
        }),
      );

      await client.posts.create({
        title: "Title",
        body: "Body",
        idempotencyKey: "client-order-uuid-999",
      });

      expect(capturedIdempotencyKey).toBe("client-order-uuid-999");
    });

    it("sends no idempotency key when explicitly set to null", async () => {
      let capturedIdempotencyKey: string | null = null;

      server.use(
        http.post(`${TEST_BASE_URL}/posts`, ({ request }) => {
          capturedIdempotencyKey = request.headers.get("idempotency-key");
          return HttpResponse.json(
            {
              id: "c_no_key_post",
              title: "Title",
              content_type: "post",
              body: "Body",
              body_format: "markdown",
              author_deleted: false,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T00:00:00Z",
              deleted: false,
              author: {
                id: "a_author",
                username: "author",
                actor_type: "human",
                created_at: "...",
              },
            },
            { status: 201 },
          );
        }),
      );

      await client.posts.create({
        title: "Title",
        body: "Body",
        idempotencyKey: null,
      });

      expect(capturedIdempotencyKey).toBeNull();
    });

    it("strictly preserves arbitrary metadata keys without case conversion (§2.10)", async () => {
      let capturedMetadata: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/posts`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          capturedMetadata = body.metadata;
          return HttpResponse.json(
            {
              id: "c_meta_post",
              title: "Title",
              content_type: "post",
              body: "Body",
              body_format: "markdown",
              author_deleted: false,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T00:00:00Z",
              deleted: false,
              metadata: body.metadata,
              author: {
                id: "a_author",
                username: "author",
                actor_type: "human",
                created_at: "...",
              },
            },
            { status: 201 },
          );
        }),
      );

      const customMetadata = {
        model_name: "claude-3-5-sonnet",
        camelCaseOption: true,
        nested_params: {
          subKey_one: 42,
        },
      };

      const res = await client.posts.create({
        title: "Post with metadata",
        body: "Contents",
        metadata: customMetadata,
      });

      expect(capturedMetadata).toEqual(customMetadata);
      expect(res.metadata).toEqual(customMetadata);
    });

    it("retries on 5xx by default because an Idempotency-Key is automatically generated (§2.6, §2.9)", async () => {
      let attempts = 0;

      server.use(
        http.post(`${TEST_BASE_URL}/posts`, () => {
          attempts++;
          if (attempts === 1) {
            return HttpResponse.json(
              { code: "INTERNAL", detail: "Temporary database failure" },
              { status: 500 },
            );
          }
          return HttpResponse.json(
            {
              id: "c_post_retry_ok",
              title: "Retry Success",
              content_type: "post",
              body: "Body",
              body_format: "markdown",
              author_deleted: false,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T00:00:00Z",
              deleted: false,
              author: { id: "a_1", username: "author", actor_type: "ai_agent", created_at: "..." },
            },
            { status: 201 },
          );
        }),
      );

      const post = await client.posts.create({
        title: "Retry Success",
        body: "Body",
      });

      expect(attempts).toBe(2);
      expect(post.id).toBe("c_post_retry_ok");
    });

    it("does NOT retry on 5xx when idempotencyKey is explicitly null (§2.6)", async () => {
      let attempts = 0;

      server.use(
        http.post(`${TEST_BASE_URL}/posts`, () => {
          attempts++;
          return HttpResponse.json({ code: "INTERNAL", detail: "Fatal error" }, { status: 500 });
        }),
      );

      await expect(
        client.posts.create({
          title: "Non-idempotent post",
          body: "Body",
          idempotencyKey: null,
        }),
      ).rejects.toThrow();

      // Non-idempotent POST must NEVER be retried on 5xx
      expect(attempts).toBe(1);
    });
  });

  describe("get()", () => {
    it("retrieves a post and converts fields to snake_case query string (§2.11)", async () => {
      let capturedQueryFields: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/posts/:id`, ({ request, params }) => {
          capturedQueryFields = new URL(request.url).searchParams.get("fields");

          return HttpResponse.json({
            id: params.id,
            title: "Filtered Title",
            comment_count: 7,
          });
        }),
      );

      const narrowed = await client.posts.get("c_test_fields", {
        fields: ["title", "commentCount"],
      });

      expect(capturedQueryFields).toBe("title,comment_count");
      expect(narrowed.title).toBe("Filtered Title");
      expect(narrowed.commentCount).toBe(7);
    });

    it("throws NotFoundError (404) when post does not exist", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/posts/missing`, () => {
          return HttpResponse.json(
            { code: "NOT_FOUND", detail: "Post does not exist" },
            { status: 404 },
          );
        }),
      );

      await expect(client.posts.get("missing")).rejects.toThrowError(NotFoundError);
    });
  });

  describe("update()", () => {
    it("updates title and body via PATCH /posts/:id", async () => {
      let capturedBody: unknown;

      server.use(
        http.patch(`${TEST_BASE_URL}/posts/:id`, async ({ request, params }) => {
          capturedBody = await request.json();

          return HttpResponse.json({
            id: params.id,
            title: "New Title",
            content_type: "post",
            body: "New Content",
            body_format: "markdown",
            author_deleted: false,
            score: 2,
            upvotes: 2,
            downvotes: 0,
            comment_count: 1,
            created_at: "2026-09-02T00:00:00Z",
            deleted: false,
            author: {
              id: "a_author",
              username: "author",
              actor_type: "human",
              created_at: "...",
            },
          });
        }),
      );

      const updated = await client.posts.update("c_target_post", {
        title: "New Title",
        body: "New Content",
      });

      expect(capturedBody).toEqual({
        title: "New Title",
        body: "New Content",
      });
      expect(updated.title).toBe("New Title");
      expect(updated.body).toBe("New Content");
    });
  });

  describe("delete() and delete-then-get flow", () => {
    it("deletes a post and subsequent get throws GoneError (410)", async () => {
      let isDeleted = false;

      server.use(
        http.delete(`${TEST_BASE_URL}/posts/:id`, () => {
          isDeleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
        http.get(`${TEST_BASE_URL}/posts/:id`, ({ params }) => {
          if (isDeleted) {
            return HttpResponse.json(
              { code: "GONE", detail: "Post was deleted by author" },
              { status: 410 },
            );
          }
          return HttpResponse.json({
            id: params.id,
            title: "Active Post",
            content_type: "post",
            body: "Active Content",
            body_format: "markdown",
            author_deleted: false,
            score: 0,
            upvotes: 0,
            downvotes: 0,
            comment_count: 0,
            created_at: "2026-09-02T00:00:00Z",
            deleted: false,
            author: {
              id: "a_author",
              username: "author",
              actor_type: "human",
              created_at: "...",
            },
          });
        }),
      );

      // Verify post exists before deletion
      const before = await client.posts.get("c_lifecycle_post");
      expect(before.id).toBe("c_lifecycle_post");

      // Delete post
      await client.posts.delete("c_lifecycle_post");
      expect(isDeleted).toBe(true);

      // Subsequent get must throw GoneError (HTTP 410)
      await expect(client.posts.get("c_lifecycle_post")).rejects.toThrowError(GoneError);
    });
  });
});
