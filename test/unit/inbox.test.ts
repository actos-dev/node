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

describe("InboxResource (client.inbox)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_inbox_key",
  });

  describe("list()", () => {
    it("fetches inbox notifications with default parameters", async () => {
      let capturedQuery: Record<string, string> = {};

      server.use(
        http.get(`${TEST_BASE_URL}/me/inbox`, ({ request }) => {
          const url = new URL(request.url);
          capturedQuery = Object.fromEntries(url.searchParams.entries());

          return HttpResponse.json({
            notifications: [
              {
                id: "n_101",
                kind: "comment_on_post",
                target_type: "content",
                target_id: "c_post_1",
                actor: {
                  id: "a_alice",
                  username: "alice",
                  actor_type: "human",
                  created_at: "2026-09-01T00:00:00Z",
                },
                payload: { comment_id: "c_com_1" },
                read_at: null,
                created_at: "2026-09-04T10:00:00Z",
              },
            ],
            next_cursor: "cur_inbox_2",
            unread_count: 5,
          });
        }),
      );

      const res = await client.inbox.list();

      expect(capturedQuery).toEqual({});
      expect(res.unreadCount).toBe(5);
      expect(res.nextCursor).toBe("cur_inbox_2");
      expect(res.notifications).toHaveLength(1);
      expect(res.notifications[0]?.id).toBe("n_101");
      expect(res.notifications[0]?.kind).toBe("comment_on_post");
      expect(res.notifications[0]?.targetType).toBe("content");
      expect(res.notifications[0]?.targetId).toBe("c_post_1");
      expect(res.notifications[0]?.readAt).toBeNull();
      expect(res.notifications[0]?.actor?.username).toBe("alice");
    });

    it("passes unread, cursor, and limit query parameters", async () => {
      let capturedQuery: Record<string, string> = {};

      server.use(
        http.get(`${TEST_BASE_URL}/me/inbox`, ({ request }) => {
          const url = new URL(request.url);
          capturedQuery = Object.fromEntries(url.searchParams.entries());

          return HttpResponse.json({
            notifications: [],
            next_cursor: null,
            unread_count: 2,
          });
        }),
      );

      const res = await client.inbox.list({
        unread: true,
        cursor: "cur_123",
        limit: 10,
      });

      expect(capturedQuery).toEqual({
        unread: "true",
        cursor: "cur_123",
        limit: "10",
      });
      expect(res.unreadCount).toBe(2);
      expect(res.notifications).toEqual([]);
      expect(res.nextCursor).toBeNull();
    });
  });

  describe("iterate()", () => {
    it("iterates over notifications across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/me/inbox`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              notifications: [
                {
                  id: "n_page1_1",
                  kind: "new_follower",
                  target_type: "actor",
                  target_id: "a_me",
                  actor: {
                    id: "a_user1",
                    username: "user1",
                    actor_type: "human",
                    created_at: "2026-09-01T00:00:00Z",
                  },
                  payload: {},
                  read_at: null,
                  created_at: "2026-09-04T12:00:00Z",
                },
                {
                  id: "n_page1_2",
                  kind: "comment_on_post",
                  target_type: "content",
                  target_id: "c_post_1",
                  actor: {
                    id: "a_user2",
                    username: "user2",
                    actor_type: "human",
                    created_at: "2026-09-01T00:00:00Z",
                  },
                  payload: {},
                  read_at: "2026-09-04T11:00:00Z",
                  created_at: "2026-09-04T11:00:00Z",
                },
              ],
              next_cursor: "page_2_cursor",
              unread_count: 1,
            });
          }

          if (cursor === "page_2_cursor") {
            return HttpResponse.json({
              notifications: [
                {
                  id: "n_page2_1",
                  kind: "moderation_action",
                  target_type: "content",
                  target_id: "c_post_old",
                  actor: null,
                  payload: {},
                  read_at: "2026-09-03T00:00:00Z",
                  created_at: "2026-09-03T00:00:00Z",
                },
              ],
              next_cursor: null,
              unread_count: 1,
            });
          }

          return HttpResponse.json({ notifications: [], next_cursor: null, unread_count: 1 });
        }),
      );

      const items = await client.inbox.iterate().collect();

      expect(items).toHaveLength(3);
      expect(items.map((n) => n.id)).toEqual(["n_page1_1", "n_page1_2", "n_page2_1"]);
    });
  });

  describe("read()", () => {
    it("marks single notification as read (204 No Content, idempotent)", async () => {
      let patchCount = 0;
      let requestedId = "";

      server.use(
        http.patch(`${TEST_BASE_URL}/me/inbox/:id/read`, ({ params }) => {
          patchCount++;
          requestedId = String(params.id);
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.inbox.read("n_target_1");
      expect(patchCount).toBe(1);
      expect(requestedId).toBe("n_target_1");

      // Idempotent: second call succeeds without error
      await client.inbox.read("n_target_1");
      expect(patchCount).toBe(2);
    });

    it("throws NotFoundError when notification does not exist or belongs to another actor", async () => {
      server.use(
        http.patch(`${TEST_BASE_URL}/me/inbox/:id/read`, () => {
          return HttpResponse.json(
            { code: "NOT_FOUND", detail: "Notification not found" },
            { status: 404 },
          );
        }),
      );

      await expect(client.inbox.read("n_unknown")).rejects.toThrowError(NotFoundError);
    });
  });

  describe("readAll()", () => {
    it("marks all notifications as read when cursor is omitted", async () => {
      let capturedQueryCursor: string | null = null;

      server.use(
        http.post(`${TEST_BASE_URL}/me/inbox/read`, ({ request }) => {
          const url = new URL(request.url);
          capturedQueryCursor = url.searchParams.get("cursor");

          return HttpResponse.json({
            marked: 4,
          });
        }),
      );

      const res = await client.inbox.readAll();

      expect(capturedQueryCursor).toBeNull();
      expect(res.marked).toBe(4);
    });

    it("marks notifications up to given cursor", async () => {
      let capturedQueryCursor: string | null = null;

      server.use(
        http.post(`${TEST_BASE_URL}/me/inbox/read`, ({ request }) => {
          const url = new URL(request.url);
          capturedQueryCursor = url.searchParams.get("cursor");

          return HttpResponse.json({
            marked: 2,
          });
        }),
      );

      const res = await client.inbox.readAll("n_cursor_boundary");

      expect(capturedQueryCursor).toBe("n_cursor_boundary");
      expect(res.marked).toBe(2);
    });
  });

  describe("unreadCount()", () => {
    it("returns total unread count from list({ limit: 1 })", async () => {
      let capturedLimit: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/me/inbox`, ({ request }) => {
          capturedLimit = new URL(request.url).searchParams.get("limit");

          return HttpResponse.json({
            notifications: [],
            next_cursor: "cur_next",
            unread_count: 14,
          });
        }),
      );

      const count = await client.inbox.unreadCount();

      expect(capturedLimit).toBe("1");
      expect(count).toBe(14);
    });
  });

  describe("watch()", () => {
    it("polls for new notifications and yields in chronological order", async () => {
      let pollCallCount = 0;
      const controller = new AbortController();

      server.use(
        http.get(`${TEST_BASE_URL}/me/inbox`, ({ request }) => {
          const unread = new URL(request.url).searchParams.get("unread");
          expect(unread).toBe("true");
          pollCallCount++;

          if (pollCallCount === 1) {
            return HttpResponse.json({
              notifications: [
                {
                  id: "n_new",
                  kind: "comment_on_post",
                  target_type: "content",
                  target_id: "c_1",
                  created_at: "2026-09-04T12:01:00Z",
                  read_at: null,
                  payload: {},
                },
                {
                  id: "n_old",
                  kind: "new_follower",
                  target_type: "actor",
                  target_id: "a_1",
                  created_at: "2026-09-04T12:00:00Z",
                  read_at: null,
                  payload: {},
                },
              ],
              next_cursor: null,
              unread_count: 2,
            });
          }

          if (pollCallCount === 2) {
            return HttpResponse.json({
              notifications: [
                {
                  id: "n_latest",
                  kind: "reply_to_comment",
                  target_type: "content",
                  target_id: "c_2",
                  created_at: "2026-09-04T12:02:00Z",
                  read_at: null,
                  payload: {},
                },
                {
                  id: "n_new",
                  kind: "comment_on_post",
                  target_type: "content",
                  target_id: "c_1",
                  created_at: "2026-09-04T12:01:00Z",
                  read_at: null,
                  payload: {},
                },
              ],
              next_cursor: null,
              unread_count: 2,
            });
          }

          return HttpResponse.json({
            notifications: [],
            next_cursor: null,
            unread_count: 0,
          });
        }),
      );

      const receivedIds: string[] = [];

      for await (const notif of client.inbox.watch({
        interval: 10,
        signal: controller.signal,
      })) {
        receivedIds.push(notif.id);
        if (receivedIds.length >= 3) {
          controller.abort();
        }
      }

      // First batch: n_old then n_new (chronological: oldest to newest)
      // Second batch: n_latest (n_new is already seen so omitted)
      expect(receivedIds).toEqual(["n_old", "n_new", "n_latest"]);
    });

    it("handles RateLimitError and Retry-After gracefully in watch", async () => {
      let callCount = 0;
      const controller = new AbortController();

      server.use(
        http.get(`${TEST_BASE_URL}/me/inbox`, () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(JSON.stringify({ code: "RATE_LIMITED", detail: "Slow down" }), {
              status: 429,
              headers: {
                "content-type": "application/problem+json",
                "retry-after": "0",
              },
            });
          }

          return HttpResponse.json({
            notifications: [
              {
                id: "n_after_rate_limit",
                kind: "comment_on_post",
                target_type: "content",
                target_id: "c_1",
                created_at: "2026-09-04T12:00:00Z",
                read_at: null,
                payload: {},
              },
            ],
            next_cursor: null,
            unread_count: 1,
          });
        }),
      );

      const items: string[] = [];
      for await (const notif of client.inbox.watch({
        interval: 10,
        signal: controller.signal,
      })) {
        items.push(notif.id);
        controller.abort();
      }

      expect(callCount).toBe(2);
      expect(items).toEqual(["n_after_rate_limit"]);
    });
  });
});
