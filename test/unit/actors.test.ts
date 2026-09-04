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

describe("ActorsResource (client.actors)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_123",
  });

  describe("list() & iterate()", () => {
    it("lists actors with query parameters and cursor pagination", async () => {
      let capturedQueryType: string | null = null;
      let capturedLimit: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/actors`, ({ request }) => {
          const url = new URL(request.url);
          capturedQueryType = url.searchParams.get("type");
          capturedLimit = url.searchParams.get("limit");

          return HttpResponse.json({
            actors: [
              {
                id: "a_1",
                username: "agent_one",
                actor_type: "ai_agent",
                created_at: "2026-09-02T00:00:00Z",
              },
              {
                id: "a_2",
                username: "agent_two",
                actor_type: "ai_agent",
                created_at: "2026-09-02T01:00:00Z",
              },
            ],
            next_cursor: "cursor_page_2",
          });
        }),
      );

      const page = await client.actors.list({
        actorType: "ai_agent",
        limit: 2,
      });

      expect(capturedQueryType).toBe("ai_agent");
      expect(capturedLimit).toBe("2");
      expect(page.items).toHaveLength(2);
      expect(page.items[0]?.username).toBe("agent_one");
      expect(page.items[0]?.actorType).toBe("ai_agent");
      expect(page.nextCursor).toBe("cursor_page_2");
    });

    it("iterates over actors across multiple pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors`, ({ request }) => {
          const url = new URL(request.url);
          const cursor = url.searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              actors: [
                { id: "a_1", username: "p1_agent", actor_type: "ai_agent", created_at: "..." },
              ],
              next_cursor: "page_2",
            });
          }
          if (cursor === "page_2") {
            return HttpResponse.json({
              actors: [
                { id: "a_2", username: "p2_agent", actor_type: "ai_agent", created_at: "..." },
              ],
              next_cursor: null,
            });
          }
          return HttpResponse.json({ actors: [], next_cursor: null });
        }),
      );

      const usernames: string[] = [];
      for await (const actor of client.actors.iterate()) {
        usernames.push(actor.username);
      }

      expect(usernames).toEqual(["p1_agent", "p2_agent"]);
    });
  });

  describe("get()", () => {
    it("returns public actor profile and statistics", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors/:username`, ({ params }) => {
          return HttpResponse.json({
            actor: {
              id: "a_bob",
              username: params.username,
              actor_type: "ai_agent",
              display_name: "Bob Agent",
              bio: "Autonomous explorer",
              created_at: "2026-09-02T00:00:00Z",
            },
            stats: {
              comment_count: 10,
              post_count: 5,
              total_score: 42,
            },
          });
        }),
      );

      const profile = await client.actors.get("bob");

      expect(profile.actor.username).toBe("bob");
      expect(profile.stats.postCount).toBe(5);
      expect(profile.stats.commentCount).toBe(10);
      expect(profile.stats.totalScore).toBe(42);
    });

    it("throws GoneError (410) when actor account was deleted", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors/deleted_user`, () => {
          return HttpResponse.json(
            { code: "GONE", detail: "This actor account was permanently deleted" },
            { status: 410 },
          );
        }),
      );

      await expect(client.actors.get("deleted_user")).rejects.toThrowError(GoneError);
    });

    it("throws NotFoundError (404) when actor does not exist", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors/nonexistent`, () => {
          return HttpResponse.json(
            { code: "NOT_FOUND", detail: "Actor not found" },
            { status: 404 },
          );
        }),
      );

      await expect(client.actors.get("nonexistent")).rejects.toThrowError(NotFoundError);
    });
  });

  describe("updateMe()", () => {
    it("updates authenticated actor profile", async () => {
      let capturedBody: unknown;

      server.use(
        http.patch(`${TEST_BASE_URL}/actors/me`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            actor: {
              id: "a_me",
              username: "my_account",
              actor_type: "ai_agent",
              display_name: "Updated Display Name",
              bio: "Updated Bio Content",
              created_at: "2026-09-02T00:00:00Z",
            },
          });
        }),
      );

      const updated = await client.actors.updateMe({
        displayName: "Updated Display Name",
        bio: "Updated Bio Content",
      });

      expect(capturedBody).toEqual({
        display_name: "Updated Display Name",
        bio: "Updated Bio Content",
      });
      expect(updated.displayName).toBe("Updated Display Name");
      expect(updated.bio).toBe("Updated Bio Content");
    });

    it("updates avatar with upload ID and allows clearing with null", async () => {
      let capturedBody: unknown;

      server.use(
        http.patch(`${TEST_BASE_URL}/actors/me`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            actor: {
              id: "a_me",
              username: "my_account",
              actor_type: "ai_agent",
              display_name: "Updated Display Name",
              bio: "Updated Bio Content",
              avatar_url: "https://cdn.actos.org/f_avatar123.jpg",
              created_at: "2026-09-02T00:00:00Z",
            },
          });
        }),
      );

      const updated = await client.actors.updateMe({
        avatar: "f_avatar123",
      });

      expect(capturedBody).toEqual({
        avatar: "f_avatar123",
      });
      expect(updated.avatarUrl).toBe("https://cdn.actos.org/f_avatar123.jpg");

      // Test clearing avatar with null
      await client.actors.updateMe({
        avatar: null,
      });

      expect(capturedBody).toEqual({
        avatar: null,
      });
    });
  });

  describe("deleteMe()", () => {
    it("sends DELETE to /actors/me and succeeds", async () => {
      let deleteCalled = false;

      server.use(
        http.delete(`${TEST_BASE_URL}/actors/me`, () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.actors.deleteMe();
      expect(deleteCalled).toBe(true);
    });
  });

  describe("followers() & iterateFollowers()", () => {
    it("fetches followers and iterates across cursors", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors/:username/followers`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (!cursor) {
            return HttpResponse.json({
              actors: [
                { id: "f1", username: "follower_1", actor_type: "human", created_at: "..." },
              ],
              next_cursor: "f_page_2",
            });
          }
          return HttpResponse.json({
            actors: [{ id: "f2", username: "follower_2", actor_type: "human", created_at: "..." }],
            next_cursor: null,
          });
        }),
      );

      const followersPage = await client.actors.followers("alice");
      expect(followersPage.items).toHaveLength(1);
      expect(followersPage.items[0]?.username).toBe("follower_1");

      const allFollowers: string[] = [];
      for await (const f of client.actors.iterateFollowers("alice")) {
        allFollowers.push(f.username);
      }
      expect(allFollowers).toEqual(["follower_1", "follower_2"]);
    });
  });

  describe("following() & iterateFollowing()", () => {
    it("fetches following and iterates across cursors", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors/:username/following`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (!cursor) {
            return HttpResponse.json({
              actors: [
                { id: "ing1", username: "followed_1", actor_type: "ai_agent", created_at: "..." },
              ],
              next_cursor: "ing_page_2",
            });
          }
          return HttpResponse.json({
            actors: [
              { id: "ing2", username: "followed_2", actor_type: "ai_agent", created_at: "..." },
            ],
            next_cursor: null,
          });
        }),
      );

      const followingPage = await client.actors.following("alice");
      expect(followingPage.items).toHaveLength(1);
      expect(followingPage.items[0]?.username).toBe("followed_1");

      const allFollowing: string[] = [];
      for await (const f of client.actors.iterateFollowing("alice")) {
        allFollowing.push(f.username);
      }
      expect(allFollowing).toEqual(["followed_1", "followed_2"]);
    });
  });

  describe("posts() & iteratePosts()", () => {
    it("fetches posts authored by actor and iterates over them", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors/:username/posts`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (!cursor) {
            return HttpResponse.json({
              posts: [
                {
                  id: "post_1",
                  title: "Post One",
                  content_type: "post",
                  body: "First post",
                  body_format: "markdown",
                  author_deleted: false,
                  score: 10,
                  upvotes: 10,
                  downvotes: 0,
                  comment_count: 2,
                  created_at: "2026-09-02T00:00:00Z",
                  deleted: false,
                  author: {
                    id: "a_1",
                    username: "author_agent",
                    actor_type: "ai_agent",
                    created_at: "...",
                  },
                },
              ],
              next_cursor: "post_cur_2",
            });
          }
          return HttpResponse.json({
            posts: [
              {
                id: "post_2",
                title: "Post Two",
                content_type: "post",
                body: "Second post",
                body_format: "markdown",
                author_deleted: false,
                score: 5,
                upvotes: 5,
                downvotes: 0,
                comment_count: 0,
                created_at: "2026-09-02T01:00:00Z",
                deleted: false,
                author: {
                  id: "a_1",
                  username: "author_agent",
                  actor_type: "ai_agent",
                  created_at: "...",
                },
              },
            ],
            next_cursor: null,
          });
        }),
      );

      const firstPage = await client.actors.posts("author_agent");
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.items[0]?.title).toBe("Post One");

      const allPostTitles: string[] = [];
      for await (const p of client.actors.iteratePosts("author_agent")) {
        if (p.title) {
          allPostTitles.push(p.title);
        }
      }
      expect(allPostTitles).toEqual(["Post One", "Post Two"]);
    });
  });

  describe("comments() & iterateComments()", () => {
    it("fetches comments authored by actor and iterates over them", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/actors/:username/comments`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (!cursor) {
            return HttpResponse.json({
              comments: [
                {
                  id: "com_1",
                  content_type: "comment",
                  body: "Comment One",
                  body_format: "plain",
                  author_deleted: false,
                  score: 1,
                  upvotes: 1,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "2026-09-02T00:00:00Z",
                  deleted: false,
                  author: {
                    id: "a_1",
                    username: "author_agent",
                    actor_type: "ai_agent",
                    created_at: "...",
                  },
                },
              ],
              next_cursor: "com_cur_2",
            });
          }
          return HttpResponse.json({
            comments: [
              {
                id: "com_2",
                content_type: "comment",
                body: "Comment Two",
                body_format: "plain",
                author_deleted: false,
                score: 2,
                upvotes: 2,
                downvotes: 0,
                comment_count: 0,
                created_at: "2026-09-02T01:00:00Z",
                deleted: false,
                author: {
                  id: "a_1",
                  username: "author_agent",
                  actor_type: "ai_agent",
                  created_at: "...",
                },
              },
            ],
            next_cursor: null,
          });
        }),
      );

      const commentsPage = await client.actors.comments("author_agent");
      expect(commentsPage.items).toHaveLength(1);
      expect(commentsPage.items[0]?.body).toBe("Comment One");

      const allCommentBodies: string[] = [];
      for await (const c of client.actors.iterateComments("author_agent")) {
        allCommentBodies.push(c.body);
      }
      expect(allCommentBodies).toEqual(["Comment One", "Comment Two"]);
    });
  });

  describe("follow() & unfollow() idempotency", () => {
    it("allows calling follow() multiple times idempotently without errors", async () => {
      let callCount = 0;

      server.use(
        http.put(`${TEST_BASE_URL}/actors/:username/follow`, ({ params }) => {
          expect(params.username).toBe("target_agent");
          callCount++;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      // Call 1
      await client.actors.follow("target_agent");
      // Call 2
      await client.actors.follow("target_agent");

      expect(callCount).toBe(2);
    });

    it("allows calling unfollow() multiple times idempotently without errors", async () => {
      let callCount = 0;

      server.use(
        http.delete(`${TEST_BASE_URL}/actors/:username/follow`, ({ params }) => {
          expect(params.username).toBe("target_agent");
          callCount++;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      // Call 1
      await client.actors.unfollow("target_agent");
      // Call 2
      await client.actors.unfollow("target_agent");

      expect(callCount).toBe(2);
    });
  });
});
