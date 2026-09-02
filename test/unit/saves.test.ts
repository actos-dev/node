import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("SavesResource (client.saves)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_save_key",
  });

  describe("add() & remove()", () => {
    it("adds content to saves idempotently via PUT /contents/:id/save", async () => {
      let callCount = 0;

      server.use(
        http.put(`${TEST_BASE_URL}/contents/:id/save`, ({ params }) => {
          expect(params.id).toBe("c_bookmark");
          callCount++;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      // Call 1
      await client.saves.add("c_bookmark");
      // Call 2 (Idempotency)
      await client.saves.add("c_bookmark");

      expect(callCount).toBe(2);
    });

    it("removes content from saves idempotently via DELETE /contents/:id/save", async () => {
      let callCount = 0;

      server.use(
        http.delete(`${TEST_BASE_URL}/contents/:id/save`, ({ params }) => {
          expect(params.id).toBe("c_bookmark");
          callCount++;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      // Call 1
      await client.saves.remove("c_bookmark");
      // Call 2 (Idempotency)
      await client.saves.remove("c_bookmark");

      expect(callCount).toBe(2);
    });
  });

  describe("list() & iterate()", () => {
    it("lists saved posts with cursor and fields projection", async () => {
      let capturedFields: string | null = null;
      let capturedLimit: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/me/saves`, ({ request }) => {
          const url = new URL(request.url);
          capturedFields = url.searchParams.get("fields");
          capturedLimit = url.searchParams.get("limit");

          return HttpResponse.json({
            saves: [
              {
                id: "c_saved_1",
                title: "Saved Article",
                score: 50,
              },
            ],
            next_cursor: "cur_saved_2",
          });
        }),
      );

      const page = await client.saves.list({
        limit: 10,
        fields: ["title", "score"],
      });

      expect(capturedFields).toBe("title,score");
      expect(capturedLimit).toBe("10");
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.title).toBe("Saved Article");
      expect(page.items[0]?.score).toBe(50);
      expect(page.nextCursor).toBe("cur_saved_2");
    });

    it("iterates over saved posts across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/me/saves`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              saves: [
                {
                  id: "c_s1",
                  title: "Saved 1",
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
              next_cursor: "s_next",
            });
          }

          if (cursor === "s_next") {
            return HttpResponse.json({
              saves: [
                {
                  id: "c_s2",
                  title: "Saved 2",
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
                  author: { id: "a_2", username: "u2", actor_type: "human", created_at: "..." },
                },
              ],
              next_cursor: null,
            });
          }

          return HttpResponse.json({ saves: [], next_cursor: null });
        }),
      );

      const titles: string[] = [];
      for await (const save of client.saves.iterate()) {
        if (save.title) {
          titles.push(save.title);
        }
      }

      expect(titles).toEqual(["Saved 1", "Saved 2"]);
    });
  });
});
