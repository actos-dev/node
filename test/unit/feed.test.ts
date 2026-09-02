import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("FeedResource (client.feed)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_key",
  });

  describe("list() & iterate()", () => {
    it("fetches discovery feed with sort, window, and fields projection (no actorType)", async () => {
      let capturedSort: string | null = null;
      let capturedWindow: string | null = null;
      let capturedFields: string | null = null;
      let capturedActorType: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/feed`, ({ request }) => {
          const url = new URL(request.url);
          capturedSort = url.searchParams.get("sort");
          capturedWindow = url.searchParams.get("window");
          capturedFields = url.searchParams.get("fields");
          capturedActorType =
            url.searchParams.get("actor_type") ?? url.searchParams.get("actorType");

          return HttpResponse.json({
            posts: [
              {
                id: "c_feed_1",
                title: "Top Post of the Day",
                score: 150,
              },
            ],
            next_cursor: "feed_cur_2",
          });
        }),
      );

      const page = await client.feed.list({
        sort: "top",
        window: "day",
        fields: ["title", "score"],
      });

      expect(capturedSort).toBe("top");
      expect(capturedWindow).toBe("day");
      expect(capturedFields).toBe("title,score");
      expect(capturedActorType).toBeNull();
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.title).toBe("Top Post of the Day");
      expect(page.items[0]?.score).toBe(150);
      expect(page.nextCursor).toBe("feed_cur_2");
    });

    it("iterates over global feed across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/feed`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              posts: [
                {
                  id: "c_f1",
                  title: "Post 1",
                  content_type: "post",
                  body: "B1",
                  body_format: "plain",
                  author_deleted: false,
                  score: 1,
                  upvotes: 1,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "...",
                  deleted: false,
                  author: { id: "a_1", username: "u1", actor_type: "human", created_at: "..." },
                },
              ],
              next_cursor: "f_cur_2",
            });
          }

          if (cursor === "f_cur_2") {
            return HttpResponse.json({
              posts: [
                {
                  id: "c_f2",
                  title: "Post 2",
                  content_type: "post",
                  body: "B2",
                  body_format: "plain",
                  author_deleted: false,
                  score: 2,
                  upvotes: 2,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "...",
                  deleted: false,
                  author: { id: "a_2", username: "u2", actor_type: "human", created_at: "..." },
                },
              ],
              next_cursor: null,
            });
          }

          return HttpResponse.json({ posts: [], next_cursor: null });
        }),
      );

      const titles: string[] = [];
      for await (const post of client.feed.iterate()) {
        if (post.title) {
          titles.push(post.title);
        }
      }

      expect(titles).toEqual(["Post 1", "Post 2"]);
    });
  });

  describe("following() & iterateFollowing()", () => {
    it("fetches personalized following feed with sort and window", async () => {
      let capturedSort: string | null = null;
      let capturedWindow: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/feed/following`, ({ request }) => {
          const url = new URL(request.url);
          capturedSort = url.searchParams.get("sort");
          capturedWindow = url.searchParams.get("window");

          return HttpResponse.json({
            posts: [
              {
                id: "c_fol_1",
                title: "Friend's update",
                content_type: "post",
                body: "Body",
                body_format: "plain",
                author_deleted: false,
                score: 5,
                upvotes: 5,
                downvotes: 0,
                comment_count: 0,
                created_at: "...",
                deleted: false,
                author: {
                  id: "a_f",
                  username: "friend",
                  actor_type: "ai_agent",
                  created_at: "...",
                },
              },
            ],
            next_cursor: null,
          });
        }),
      );

      const page = await client.feed.following({
        sort: "new",
      });

      expect(capturedSort).toBe("new");
      expect(capturedWindow).toBeNull();
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.title).toBe("Friend's update");
    });

    it("iterates over following feed across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/feed/following`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              posts: [
                {
                  id: "c_fol_p1",
                  title: "Following Post 1",
                  content_type: "post",
                  body: "B1",
                  body_format: "plain",
                  author_deleted: false,
                  score: 1,
                  upvotes: 1,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "...",
                  deleted: false,
                  author: { id: "a_1", username: "u1", actor_type: "human", created_at: "..." },
                },
              ],
              next_cursor: "fol_cur_2",
            });
          }

          if (cursor === "fol_cur_2") {
            return HttpResponse.json({
              posts: [
                {
                  id: "c_fol_p2",
                  title: "Following Post 2",
                  content_type: "post",
                  body: "B2",
                  body_format: "plain",
                  author_deleted: false,
                  score: 2,
                  upvotes: 2,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "...",
                  deleted: false,
                  author: { id: "a_2", username: "u2", actor_type: "human", created_at: "..." },
                },
              ],
              next_cursor: null,
            });
          }

          return HttpResponse.json({ posts: [], next_cursor: null });
        }),
      );

      const titles: string[] = [];
      for await (const post of client.feed.iterateFollowing()) {
        if (post.title) {
          titles.push(post.title);
        }
      }

      expect(titles).toEqual(["Following Post 1", "Following Post 2"]);
    });
  });
});
