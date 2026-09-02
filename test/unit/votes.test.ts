import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("VotesResource (client.votes)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_vote_key",
  });

  describe("set(), up(), down(), clear()", () => {
    it("sets a vote value via PUT /contents/:id/vote", async () => {
      let capturedBody: unknown;

      server.use(
        http.put(`${TEST_BASE_URL}/contents/:id/vote`, async ({ request, params }) => {
          expect(params.id).toBe("c_post_vote");
          capturedBody = await request.json();

          return HttpResponse.json({
            value: 1,
            score: 42,
            upvotes: 45,
            downvotes: 3,
          });
        }),
      );

      const res = await client.votes.set("c_post_vote", 1);

      expect(capturedBody).toEqual({ value: 1 });
      expect(res.value).toBe(1);
      expect(res.score).toBe(42);
      expect(res.upvotes).toBe(45);
      expect(res.downvotes).toBe(3);
    });

    it("convenience helpers up(), down(), and clear() delegate with correct values", async () => {
      const receivedValues: number[] = [];

      server.use(
        http.put(`${TEST_BASE_URL}/contents/:id/vote`, async ({ request }) => {
          const body = (await request.json()) as { value: number };
          receivedValues.push(body.value);

          return HttpResponse.json({
            value: body.value,
            score: 10,
            upvotes: 10,
            downvotes: 0,
          });
        }),
      );

      await client.votes.up("c_item");
      await client.votes.down("c_item");
      await client.votes.clear("c_item");

      expect(receivedValues).toEqual([1, -1, 0]);
    });

    it("is idempotent: repeated votes succeed without error", async () => {
      let callCount = 0;

      server.use(
        http.put(`${TEST_BASE_URL}/contents/:id/vote`, () => {
          callCount++;
          return HttpResponse.json({
            value: 1,
            score: 1,
            upvotes: 1,
            downvotes: 0,
          });
        }),
      );

      await client.votes.set("c_idem", 1);
      await client.votes.set("c_idem", 1);
      await client.votes.up("c_idem");

      expect(callCount).toBe(3);
    });
  });

  describe("list()", () => {
    it("fetches active votes mapping", async () => {
      let capturedContentIds: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/me/votes`, ({ request }) => {
          capturedContentIds = new URL(request.url).searchParams.get("content_ids");

          return HttpResponse.json({
            votes: {
              c_1: 1,
              c_2: -1,
            },
          });
        }),
      );

      const votes = await client.votes.list(["c_1", "c_2"]);

      expect(capturedContentIds).toBe("c_1,c_2");
      expect(votes).toEqual({
        c_1: 1,
        c_2: -1,
      });
    });

    it("works without contentIds parameter", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/me/votes`, () => {
          return HttpResponse.json({
            votes: { c_all: 1 },
          });
        }),
      );

      const votes = await client.votes.list();
      expect(votes).toEqual({ c_all: 1 });
    });
  });
});
