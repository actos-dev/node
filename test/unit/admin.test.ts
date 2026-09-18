import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";
import { ForbiddenError } from "../../src/errors.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AdminResource (client.admin)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_admin_key",
  });

  describe("reports (client.admin.reports)", () => {
    it("lists reports filtered by status", async () => {
      let capturedStatus: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/admin/reports`, ({ request }) => {
          capturedStatus = new URL(request.url).searchParams.get("status");

          return HttpResponse.json({
            reports: [
              {
                id: "rep_1",
                target_type: "post",
                target_id: "c_p1",
                reason: "Spam",
                status: "pending",
                created_at: "2026-09-03T00:00:00Z",
              },
            ],
            next_cursor: "cur_rep_2",
          });
        }),
      );

      const page = await client.admin.reports.list({ status: "pending" });

      expect(capturedStatus).toBe("pending");
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.id).toBe("rep_1");
      expect(page.nextCursor).toBe("cur_rep_2");
    });

    it("iterates over reports across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/admin/reports`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              reports: [
                {
                  id: "rep_1",
                  target_type: "post",
                  target_id: "c_p1",
                  reason: "R1",
                  status: "pending",
                  created_at: "...",
                },
              ],
              next_cursor: "c2",
            });
          }
          if (cursor === "c2") {
            return HttpResponse.json({
              reports: [
                {
                  id: "rep_2",
                  target_type: "comment",
                  target_id: "c_c2",
                  reason: "R2",
                  status: "pending",
                  created_at: "...",
                },
              ],
              next_cursor: null,
            });
          }
          return HttpResponse.json({ reports: [], next_cursor: null });
        }),
      );

      const ids: string[] = [];
      for await (const report of client.admin.reports.iterate()) {
        ids.push(report.id);
      }

      expect(ids).toEqual(["rep_1", "rep_2"]);
    });

    it("updates report status and notes", async () => {
      let capturedBody: unknown;

      server.use(
        http.patch(`${TEST_BASE_URL}/admin/reports/:id`, async ({ request, params }) => {
          expect(params.id).toBe("rep_123");
          capturedBody = await request.json();

          return HttpResponse.json({
            id: "rep_123",
            target_type: "post",
            target_id: "c_target",
            reason: "Violation",
            status: "resolved",
            created_at: "2026-09-03T00:00:00Z",
            notes: "Content was removed",
          });
        }),
      );

      const updated = await client.admin.reports.update("rep_123", {
        status: "resolved",
        notes: "Content was removed",
      });

      expect(capturedBody).toEqual({
        status: "resolved",
        notes: "Content was removed",
      });
      expect(updated.status).toBe("resolved");
    });
  });

  describe("contents (client.admin.contents)", () => {
    it("deletes content with moderation reason", async () => {
      let capturedBody: unknown;

      server.use(
        http.delete(`${TEST_BASE_URL}/admin/contents/:id`, async ({ request, params }) => {
          expect(params.id).toBe("c_bad_post");
          capturedBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.admin.contents.delete("c_bad_post", {
        reason: "Hate speech violation",
      });

      expect(capturedBody).toEqual({
        reason: "Hate speech violation",
      });
    });
  });

  describe("bans (client.admin.bans)", () => {
    it("creates a community-scoped ban for an actor", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/admin/bans`, async ({ request }) => {
          capturedBody = await request.json();

          return HttpResponse.json(
            {
              username: "spammer_bot",
              reason: "Repeated spamming",
              banned_at: "2026-09-03T00:00:00Z",
              expires_at: "2026-10-03T00:00:00Z",
              community: "rust",
            },
            { status: 201 },
          );
        }),
      );

      const ban = await client.admin.bans.create({
        username: "spammer_bot",
        reason: "Repeated spamming",
        expiresAt: "2026-10-03T00:00:00Z",
        community: "rust",
        deletePosts: true,
      });

      expect(capturedBody).toEqual({
        username: "spammer_bot",
        reason: "Repeated spamming",
        expires_at: "2026-10-03T00:00:00Z",
        community: "rust",
        delete_posts: true,
      });
      expect(ban.username).toBe("spammer_bot");
      expect(ban.reason).toBe("Repeated spamming");
      expect(ban.community).toBe("rust");
    });

    it("removes a community-scoped ban idempotently", async () => {
      let unbannedUser: string | null = null;
      let capturedCommunity: string | null = null;

      server.use(
        http.delete(`${TEST_BASE_URL}/admin/bans/:username`, ({ request, params }) => {
          unbannedUser = params.username as string;
          capturedCommunity = new URL(request.url).searchParams.get("community");
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.admin.bans.remove("rehabilitated_bot", "rust");
      expect(unbannedUser).toBe("rehabilitated_bot");
      expect(capturedCommunity).toBe("rust");
    });
  });

  describe("permissions (client.admin.permissions)", () => {
    it("grants a scoped permission via PUT /admin/permissions", async () => {
      let capturedBody: unknown;

      server.use(
        http.put(`${TEST_BASE_URL}/admin/permissions`, async ({ request }) => {
          capturedBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.admin.permissions.grant({
        username: "mod_agent",
        permission: "member.kick",
        community: "rust",
      });

      expect(capturedBody).toEqual({
        username: "mod_agent",
        permission: "member.kick",
        community: "rust",
      });
    });

    it("revokes a global permission via DELETE /admin/permissions", async () => {
      let capturedBody: unknown;

      server.use(
        http.delete(`${TEST_BASE_URL}/admin/permissions`, async ({ request }) => {
          capturedBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.admin.permissions.revoke({
        username: "mod_agent",
        permission: "content.delete",
      });

      expect(capturedBody).toEqual({
        username: "mod_agent",
        permission: "content.delete",
      });
    });
  });

  describe("actions (client.admin.actions)", () => {
    it("lists audit actions and iterates over them", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/admin/actions`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              actions: [
                {
                  id: "act_1",
                  action_type: "ban_actor",
                  reason: "Spam",
                  created_at: "2026-09-03T00:00:00Z",
                  admin_username: "admin",
                  target_id: 1,
                  target_type: "actor",
                },
              ],
              next_cursor: "act_cur_2",
            });
          }
          if (cursor === "act_cur_2") {
            return HttpResponse.json({
              actions: [
                {
                  id: "act_2",
                  action_type: "delete_content",
                  reason: "Offensive",
                  created_at: "2026-09-03T01:00:00Z",
                  admin_username: "admin",
                  target_id: 2,
                  target_type: "post",
                },
              ],
              next_cursor: null,
            });
          }
          return HttpResponse.json({ actions: [], next_cursor: null });
        }),
      );

      const firstPage = await client.admin.actions.list();
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.items[0]?.actionType).toBe("ban_actor");

      const allActionIds: string[] = [];
      for await (const action of client.admin.actions.iterate()) {
        allActionIds.push(action.id);
      }
      expect(allActionIds).toEqual(["act_1", "act_2"]);
    });
  });

  describe("ForbiddenError on unauthorized admin calls", () => {
    it("throws ForbiddenError (403) when user lacks moderator or admin privileges", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/admin/reports`, () => {
          return HttpResponse.json(
            { code: "FORBIDDEN", detail: "Moderator or admin role required" },
            { status: 403 },
          );
        }),
      );

      await expect(client.admin.reports.list()).rejects.toThrowError(ForbiddenError);
    });
  });
});
