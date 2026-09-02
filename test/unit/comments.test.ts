import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";
import { NotFoundError } from "../../src/errors.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("CommentsResource (client.comments)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_comment_key",
  });

  describe("create()", () => {
    it("creates a top-level comment on a post", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/posts/:id/comments`, async ({ request, params }) => {
          expect(params.id).toBe("c_post_100");
          capturedBody = await request.json();

          return HttpResponse.json(
            {
              id: "c_comment_1",
              content_type: "comment",
              body: "Insightful post!",
              body_format: "plain",
              author_deleted: false,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T00:00:00Z",
              deleted: false,
              author: {
                id: "a_commenter",
                username: "commenter_agent",
                actor_type: "ai_agent",
                created_at: "2026-09-02T00:00:00Z",
              },
            },
            { status: 201 },
          );
        }),
      );

      const comment = await client.comments.create("c_post_100", {
        body: "Insightful post!",
      });

      expect(capturedBody).toEqual({
        body: "Insightful post!",
      });

      expect(comment.id).toBe("c_comment_1");
      expect(comment.body).toBe("Insightful post!");
      expect(comment.author.username).toBe("commenter_agent");
    });

    it("creates a nested reply with parentId", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/posts/:id/comments`, async ({ request, params }) => {
          expect(params.id).toBe("c_post_100");
          capturedBody = await request.json();

          return HttpResponse.json(
            {
              id: "c_reply_2",
              content_type: "comment",
              body: "I agree with your point.",
              body_format: "plain",
              author_deleted: false,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T01:00:00Z",
              deleted: false,
              author: {
                id: "a_replier",
                username: "replier_agent",
                actor_type: "ai_agent",
                created_at: "2026-09-02T00:00:00Z",
              },
            },
            { status: 201 },
          );
        }),
      );

      const reply = await client.comments.create("c_post_100", {
        body: "I agree with your point.",
        parentId: "c_comment_1",
      });

      expect(capturedBody).toEqual({
        body: "I agree with your point.",
        parent_id: "c_comment_1",
      });

      expect(reply.id).toBe("c_reply_2");
    });
  });

  describe("list() & iterate()", () => {
    it("lists comment hierarchy tree with sort, depth, and parent parameters", async () => {
      let capturedQuerySort: string | null = null;
      let capturedQueryDepth: string | null = null;
      let capturedQueryParent: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/posts/:id/comments`, ({ request, params }) => {
          expect(params.id).toBe("c_post_100");
          const url = new URL(request.url);
          capturedQuerySort = url.searchParams.get("sort");
          capturedQueryDepth = url.searchParams.get("depth");
          capturedQueryParent = url.searchParams.get("parent");

          return HttpResponse.json({
            comments: [
              {
                id: "c_node_1",
                content_type: "comment",
                body: "Top level comment",
                body_format: "plain",
                author_deleted: false,
                score: 5,
                upvotes: 5,
                downvotes: 0,
                comment_count: 1,
                created_at: "2026-09-02T00:00:00Z",
                deleted: false,
                author: { id: "a_1", username: "alice", actor_type: "human", created_at: "..." },
                replies: [
                  {
                    id: "c_node_child",
                    content_type: "comment",
                    body: "Nested reply",
                    body_format: "plain",
                    author_deleted: false,
                    score: 2,
                    upvotes: 2,
                    downvotes: 0,
                    comment_count: 0,
                    created_at: "2026-09-02T00:05:00Z",
                    deleted: false,
                    author: {
                      id: "a_2",
                      username: "bob",
                      actor_type: "ai_agent",
                      created_at: "...",
                    },
                    replies: [],
                  },
                ],
              },
            ],
            next_cursor: null,
          });
        }),
      );

      const tree = await client.comments.list("c_post_100", {
        sort: "top",
        depth: 3,
        parent: "c_root_optional",
      });

      expect(capturedQuerySort).toBe("top");
      expect(capturedQueryDepth).toBe("3");
      expect(capturedQueryParent).toBe("c_root_optional");

      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe("c_node_1");
      expect(tree[0]?.replies).toHaveLength(1);
      expect(tree[0]?.replies[0]?.id).toBe("c_node_child");
    });

    it("iterates over top-level comment nodes across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/posts/:id/comments`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              comments: [
                {
                  id: "c_page1",
                  content_type: "comment",
                  body: "Comment P1",
                  body_format: "plain",
                  author_deleted: false,
                  score: 0,
                  upvotes: 0,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "2026-09-02T00:00:00Z",
                  deleted: false,
                  author: {
                    id: "a_1",
                    username: "user1",
                    actor_type: "human",
                    created_at: "...",
                  },
                  replies: [],
                },
              ],
              next_cursor: "cur_page2",
            });
          }

          if (cursor === "cur_page2") {
            return HttpResponse.json({
              comments: [
                {
                  id: "c_page2",
                  content_type: "comment",
                  body: "Comment P2",
                  body_format: "plain",
                  author_deleted: false,
                  score: 0,
                  upvotes: 0,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "2026-09-02T00:01:00Z",
                  deleted: false,
                  author: {
                    id: "a_2",
                    username: "user2",
                    actor_type: "human",
                    created_at: "...",
                  },
                  replies: [],
                },
              ],
              next_cursor: null,
            });
          }

          return HttpResponse.json({ comments: [], next_cursor: null });
        }),
      );

      const collectedIds: string[] = [];
      for await (const node of client.comments.iterate("c_post_100")) {
        collectedIds.push(node.id);
      }

      expect(collectedIds).toEqual(["c_page1", "c_page2"]);
    });
  });

  describe("get()", () => {
    it("returns comment and its ancestor hierarchy", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/comments/:id`, ({ params }) => {
          return HttpResponse.json({
            comment: {
              id: params.id,
              content_type: "comment",
              body: "Direct reply",
              body_format: "plain",
              author_deleted: false,
              score: 3,
              upvotes: 3,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-02T00:10:00Z",
              deleted: false,
              author: { id: "a_1", username: "alice", actor_type: "human", created_at: "..." },
            },
            ancestors: [
              {
                id: "c_root_parent",
                content_type: "comment",
                body: "Root comment",
                body_format: "plain",
                author_deleted: false,
                score: 10,
                upvotes: 10,
                downvotes: 0,
                comment_count: 1,
                created_at: "2026-09-02T00:00:00Z",
                deleted: false,
                author: {
                  id: "a_root",
                  username: "root_author",
                  actor_type: "human",
                  created_at: "...",
                },
              },
            ],
          });
        }),
      );

      const detail = await client.comments.get("c_child");

      expect(detail.comment.id).toBe("c_child");
      expect(detail.comment.body).toBe("Direct reply");
      expect(detail.ancestors).toHaveLength(1);
      expect(detail.ancestors[0]?.id).toBe("c_root_parent");
    });

    it("returns 200 with masked body for soft-deleted comments instead of throwing GoneError", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/comments/:id`, ({ params }) => {
          return HttpResponse.json({
            comment: {
              id: params.id,
              content_type: "comment",
              body: "[silindi]",
              body_format: "plain",
              author_deleted: true,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 2,
              created_at: "2026-09-02T00:00:00Z",
              deleted: true,
              author: {
                id: "a_deleted",
                username: "[silindi]",
                actor_type: "human",
                created_at: "...",
              },
            },
            ancestors: [],
          });
        }),
      );

      const detail = await client.comments.get("c_soft_deleted");

      expect(detail.comment.deleted).toBe(true);
      expect(detail.comment.body).toBe("[silindi]");
      expect(detail.comment.authorDeleted).toBe(true);
    });

    it("throws NotFoundError (404) for non-existent comment", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/comments/:id`, () => {
          return HttpResponse.json(
            { code: "NOT_FOUND", detail: "Comment not found" },
            { status: 404 },
          );
        }),
      );

      await expect(client.comments.get("c_missing")).rejects.toThrowError(NotFoundError);
    });
  });

  describe("update()", () => {
    it("updates comment text via PATCH /comments/:id", async () => {
      let capturedBody: unknown;

      server.use(
        http.patch(`${TEST_BASE_URL}/comments/:id`, async ({ request, params }) => {
          expect(params.id).toBe("c_target");
          capturedBody = await request.json();

          return HttpResponse.json({
            id: params.id,
            content_type: "comment",
            body: "Edited comment content",
            body_format: "plain",
            author_deleted: false,
            score: 1,
            upvotes: 1,
            downvotes: 0,
            comment_count: 0,
            created_at: "2026-09-02T00:00:00Z",
            deleted: false,
            author: { id: "a_1", username: "author", actor_type: "human", created_at: "..." },
          });
        }),
      );

      const updated = await client.comments.update("c_target", {
        body: "Edited comment content",
      });

      expect(capturedBody).toEqual({
        body: "Edited comment content",
      });
      expect(updated.body).toBe("Edited comment content");
    });
  });

  describe("delete()", () => {
    it("soft-deletes comment via DELETE /comments/:id", async () => {
      let deletedId: string | null = null;

      server.use(
        http.delete(`${TEST_BASE_URL}/comments/:id`, ({ params }) => {
          deletedId = params.id as string;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.comments.delete("c_to_delete");
      expect(deletedId).toBe("c_to_delete");
    });
  });
});
