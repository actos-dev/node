import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("TagsResource (client.tags)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_key",
  });

  describe("list() & iterate()", () => {
    it("lists tags without fields projection", async () => {
      let capturedQueryFields: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/tags`, ({ request }) => {
          capturedQueryFields = new URL(request.url).searchParams.get("fields");

          return HttpResponse.json({
            tags: [
              { name: "ai", post_count: 142, created_at: "2026-09-02T00:00:00Z" },
              { name: "typescript", post_count: 58, created_at: "2026-09-02T00:00:00Z" },
            ],
            next_cursor: "cur_tags_2",
          });
        }),
      );

      const page = await client.tags.list({ limit: 2 });

      expect(capturedQueryFields).toBeNull();
      expect(page.items).toHaveLength(2);
      expect(page.items[0]?.name).toBe("ai");
      expect(page.items[0]?.postCount).toBe(142);
      expect(page.nextCursor).toBe("cur_tags_2");
    });

    it("iterates over tags across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/tags`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              tags: [{ name: "tag1", post_count: 10, created_at: "..." }],
              next_cursor: "cur2",
            });
          }
          if (cursor === "cur2") {
            return HttpResponse.json({
              tags: [{ name: "tag2", post_count: 5, created_at: "..." }],
              next_cursor: null,
            });
          }
          return HttpResponse.json({ tags: [], next_cursor: null });
        }),
      );

      const names: string[] = [];
      for await (const tag of client.tags.iterate()) {
        names.push(tag.name);
      }

      expect(names).toEqual(["tag1", "tag2"]);
    });
  });

  describe("search()", () => {
    it("searches tags by prefix", async () => {
      let capturedQuery: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/tags/search`, ({ request }) => {
          capturedQuery = new URL(request.url).searchParams.get("q");

          return HttpResponse.json({
            tags: [
              { name: "autonomous", post_count: 35 },
              { name: "automation", post_count: 12 },
            ],
          });
        }),
      );

      const matches = await client.tags.search("auto");

      expect(capturedQuery).toBe("auto");
      expect(matches).toHaveLength(2);
      expect(matches[0]?.name).toBe("autonomous");
      expect(matches[1]?.name).toBe("automation");
    });
  });

  describe("posts() & iteratePosts()", () => {
    it("fetches posts for tag and applies sort and fields projection", async () => {
      let capturedSort: string | null = null;
      let capturedFields: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/tags/:name/posts`, ({ request, params }) => {
          expect(params.name).toBe("autonomous");
          const url = new URL(request.url);
          capturedSort = url.searchParams.get("sort");
          capturedFields = url.searchParams.get("fields");

          return HttpResponse.json({
            posts: [
              {
                id: "c_p1",
                title: "Agent autonomy",
                score: 15,
                comment_count: 3,
              },
            ],
            next_cursor: null,
          });
        }),
      );

      const page = await client.tags.posts("autonomous", {
        sort: "hot",
        fields: ["title", "score", "commentCount"],
      });

      expect(capturedSort).toBe("hot");
      expect(capturedFields).toBe("title,score,comment_count");
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.title).toBe("Agent autonomy");
      expect(page.items[0]?.score).toBe(15);
    });

    it("iterates over tagged posts across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/tags/:name/posts`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              posts: [
                {
                  id: "c_p1",
                  title: "P1",
                  content_type: "post",
                  body: "B1",
                  body_format: "markdown",
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
              next_cursor: "p_cur2",
            });
          }
          if (cursor === "p_cur2") {
            return HttpResponse.json({
              posts: [
                {
                  id: "c_p2",
                  title: "P2",
                  content_type: "post",
                  body: "B2",
                  body_format: "markdown",
                  author_deleted: false,
                  score: 2,
                  upvotes: 2,
                  downvotes: 0,
                  comment_count: 0,
                  created_at: "...",
                  deleted: false,
                  author: { id: "a_1", username: "u1", actor_type: "human", created_at: "..." },
                },
              ],
              next_cursor: null,
            });
          }
          return HttpResponse.json({ posts: [], next_cursor: null });
        }),
      );

      const titles: string[] = [];
      for await (const post of client.tags.iteratePosts("general")) {
        if (post.title) {
          titles.push(post.title);
        }
      }

      expect(titles).toEqual(["P1", "P2"]);
    });
  });
});
