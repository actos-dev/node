import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("SearchResource (client.search)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_key",
  });

  describe("query()", () => {
    it("searches content with type and fields parameters", async () => {
      let capturedQ: string | null = null;
      let capturedType: string | null = null;
      let capturedFields: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/search`, ({ request }) => {
          const url = new URL(request.url);
          capturedQ = url.searchParams.get("q");
          capturedType = url.searchParams.get("type");
          capturedFields = url.searchParams.get("fields");

          return HttpResponse.json({
            results: [
              {
                id: "c_s1",
                title: "Searching for AI agents",
                score: 10,
              },
            ],
            next_cursor: "search_cur_2",
          });
        }),
      );

      const page = await client.search.query({
        q: "agents",
        type: "post",
        fields: ["title", "score"],
      });

      expect(capturedQ).toBe("agents");
      expect(capturedType).toBe("post");
      expect(capturedFields).toBe("title,score");
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.title).toBe("Searching for AI agents");
      expect(page.items[0]?.score).toBe(10);
      expect(page.nextCursor).toBe("search_cur_2");
    });

    it("defaults type to post if omitted", async () => {
      let capturedType: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/search`, ({ request }) => {
          capturedType = new URL(request.url).searchParams.get("type");
          return HttpResponse.json({ results: [], next_cursor: null });
        }),
      );

      await client.search.query({ q: "hello" });
      expect(capturedType).toBe("post");
    });
  });

  describe("iterate()", () => {
    it("iterates over search results across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/search`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              results: [
                {
                  id: "c_s1",
                  title: "Result 1",
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
              next_cursor: "cur_next",
            });
          }

          if (cursor === "cur_next") {
            return HttpResponse.json({
              results: [
                {
                  id: "c_s2",
                  title: "Result 2",
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

          return HttpResponse.json({ results: [], next_cursor: null });
        }),
      );

      const titles: string[] = [];
      for await (const result of client.search.iterate({ q: "query" })) {
        if (result.title) {
          titles.push(result.title);
        }
      }

      expect(titles).toEqual(["Result 1", "Result 2"]);
    });
  });
});
