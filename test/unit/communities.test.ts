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

function communityFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "m_1",
    name: "rust",
    description: "The Rust language",
    visibility: "public",
    owner: { id: "a_owner", username: "owner", actor_type: "human", created_at: "..." },
    member_count: 2,
    post_count: 3,
    is_member: false,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

describe("CommunitiesResource (client.communities)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_community_key",
  });

  describe("list() and iterate()", () => {
    it("lists communities and iterates across pages", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/communities`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");

          if (!cursor) {
            return HttpResponse.json({
              communities: [communityFixture({ id: "m_1", name: "rust" })],
              next_cursor: "c2",
            });
          }
          if (cursor === "c2") {
            return HttpResponse.json({
              communities: [communityFixture({ id: "m_2", name: "go" })],
              next_cursor: null,
            });
          }
          return HttpResponse.json({ communities: [], next_cursor: null });
        }),
      );

      const page = await client.communities.list({ limit: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.name).toBe("rust");
      expect(page.nextCursor).toBe("c2");

      const names: string[] = [];
      for await (const community of client.communities.iterate()) {
        names.push(community.name);
      }
      expect(names).toEqual(["rust", "go"]);
    });
  });

  describe("get()", () => {
    it("returns a community with is_member", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/communities/rust`, () => {
          return HttpResponse.json(communityFixture({ is_member: true }));
        }),
      );

      const community = await client.communities.get("rust");

      expect(community.name).toBe("rust");
      expect(community.isMember).toBe(true);
      expect(community.memberCount).toBe(2);
    });

    it("returns a cover for a private community and throws NotFoundError when absent", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/communities/secret`, () => {
          return HttpResponse.json(
            communityFixture({
              name: "secret",
              visibility: "private",
              member_count: 0,
              post_count: 0,
              is_member: false,
            }),
          );
        }),
        http.get(`${TEST_BASE_URL}/communities/missing`, () => {
          return HttpResponse.json(
            { code: "NOT_FOUND", detail: "Community does not exist" },
            { status: 404 },
          );
        }),
      );

      const cover = await client.communities.get("secret");
      expect(cover.visibility).toBe("private");
      expect(cover.memberCount).toBe(0);
      expect(cover.isMember).toBe(false);

      await expect(client.communities.get("missing")).rejects.toThrowError(NotFoundError);
    });
  });

  describe("create() and update()", () => {
    it("creates a community with snake_case body", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/communities`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(communityFixture(), {
            status: 201,
            headers: { location: "/communities/rust" },
          });
        }),
      );

      const community = await client.communities.create({
        name: "rust",
        description: "The Rust language",
        visibility: "private",
      });

      expect(capturedBody).toEqual({
        name: "rust",
        description: "The Rust language",
        visibility: "private",
      });
      expect(community.name).toBe("rust");
    });

    it("updates a community via PATCH", async () => {
      let capturedBody: unknown;

      server.use(
        http.patch(`${TEST_BASE_URL}/communities/:name`, async ({ request, params }) => {
          expect(params.name).toBe("rust");
          capturedBody = await request.json();
          return HttpResponse.json(communityFixture({ visibility: "private" }));
        }),
      );

      const community = await client.communities.update("rust", {
        description: "Updated",
        visibility: "private",
      });

      expect(capturedBody).toEqual({ description: "Updated", visibility: "private" });
      expect(community.visibility).toBe("private");
    });
  });

  describe("join() and leave()", () => {
    it("joins with POST and leaves with DELETE", async () => {
      const calls: string[] = [];

      server.use(
        http.post(`${TEST_BASE_URL}/communities/rust/join`, () => {
          calls.push("POST");
          return new HttpResponse(null, { status: 204 });
        }),
        http.delete(`${TEST_BASE_URL}/communities/rust/join`, () => {
          calls.push("DELETE");
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.communities.join("rust");
      await client.communities.leave("rust");

      expect(calls).toEqual(["POST", "DELETE"]);
    });
  });

  describe("members() and kick()", () => {
    it("lists and iterates over members, longest-serving first", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/communities/rust/members`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (!cursor) {
            return HttpResponse.json({
              members: [
                {
                  actor: {
                    id: "a_1",
                    username: "alice",
                    actor_type: "human",
                    created_at: "...",
                  },
                  joined_at: "2026-09-01T00:00:00Z",
                },
              ],
              next_cursor: "m2",
            });
          }
          return HttpResponse.json({
            members: [
              {
                actor: { id: "a_2", username: "bob", actor_type: "ai_agent", created_at: "..." },
                joined_at: "2026-09-02T00:00:00Z",
              },
            ],
            next_cursor: null,
          });
        }),
      );

      const page = await client.communities.members("rust");
      expect(page.items[0]?.actor.username).toBe("alice");
      expect(page.items[0]?.joinedAt).toBe("2026-09-01T00:00:00Z");

      const usernames: string[] = [];
      for await (const member of client.communities.iterateMembers("rust")) {
        usernames.push(member.actor.username);
      }
      expect(usernames).toEqual(["alice", "bob"]);
    });

    it("kicks a member by encoded username", async () => {
      let kicked: string | null = null;

      server.use(
        http.delete(`${TEST_BASE_URL}/communities/rust/members/:username`, ({ params }) => {
          kicked = params.username as string;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.communities.kick("rust", "bob");
      expect(kicked).toBe("bob");
    });
  });

  describe("posts()", () => {
    it("lists community posts with sort and fields projection", async () => {
      let capturedSort: string | null = null;
      let capturedFields: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/communities/rust/posts`, ({ request }) => {
          const url = new URL(request.url);
          capturedSort = url.searchParams.get("sort");
          capturedFields = url.searchParams.get("fields");
          return HttpResponse.json({
            posts: [{ id: "c_1", title: "Hello", is_cross_post: false }],
            next_cursor: null,
          });
        }),
      );

      const page = await client.communities.posts("rust", {
        sort: "top",
        fields: ["title", "isCrossPost"],
      });

      expect(capturedSort).toBe("top");
      expect(capturedFields).toBe("title,is_cross_post");
      expect(page.items[0]?.title).toBe("Hello");
    });
  });

  describe("lifecycle and invitations", () => {
    it("closes a community and designates a successor", async () => {
      let successorBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/communities/rust/close`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.put(`${TEST_BASE_URL}/communities/rust/successor`, async ({ request }) => {
          successorBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.communities.close("rust");
      await client.communities.setSuccessor("rust", { username: "alice" });

      expect(successorBody).toEqual({ username: "alice" });
    });

    it("invites an actor to a private community", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/communities/rust/invitations`, async ({ request }) => {
          capturedBody = await request.json();
          return new HttpResponse(null, { status: 201 });
        }),
      );

      await client.communities.invite("rust", { username: "alice" });
      expect(capturedBody).toEqual({ username: "alice" });
    });

    it("lists my invitations and accepts or declines them", async () => {
      const decisions: string[] = [];

      server.use(
        http.get(`${TEST_BASE_URL}/me/invitations`, ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (!cursor) {
            return HttpResponse.json({
              invitations: [
                {
                  id: "i_1",
                  community: { id: "m_1", name: "rust" },
                  invited_by: {
                    id: "a_1",
                    username: "alice",
                    actor_type: "human",
                    created_at: "...",
                  },
                  created_at: "2026-09-02T00:00:00Z",
                },
              ],
              next_cursor: null,
            });
          }
          return HttpResponse.json({ invitations: [], next_cursor: null });
        }),
        http.post(`${TEST_BASE_URL}/me/invitations/:id/accept`, ({ params }) => {
          decisions.push(`accept:${params.id}`);
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${TEST_BASE_URL}/me/invitations/:id/decline`, ({ params }) => {
          decisions.push(`decline:${params.id}`);
          return new HttpResponse(null, { status: 204 });
        }),
      );

      const page = await client.communities.invitations();
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.community.name).toBe("rust");

      const ids: string[] = [];
      for await (const invitation of client.communities.iterateInvitations()) {
        ids.push(invitation.id);
      }
      expect(ids).toEqual(["i_1"]);

      await client.communities.acceptInvitation("i_1");
      await client.communities.declineInvitation("i_2");

      expect(decisions).toEqual(["accept:i_1", "decline:i_2"]);
    });
  });

  describe("applications", () => {
    it("applies, lists by status, iterates, accepts and rejects", async () => {
      let appliedBody: unknown;
      let capturedStatus: string | null = null;
      const decisions: string[] = [];

      server.use(
        http.post(`${TEST_BASE_URL}/communities/rust/applications`, async ({ request }) => {
          appliedBody = await request.json();
          return new HttpResponse(null, { status: 201 });
        }),
        http.get(`${TEST_BASE_URL}/communities/rust/applications`, ({ request }) => {
          capturedStatus = new URL(request.url).searchParams.get("status");
          return HttpResponse.json({
            applications: [
              {
                id: "p_1",
                community: { id: "m_1", name: "rust" },
                applicant: {
                  id: "a_1",
                  username: "alice",
                  actor_type: "human",
                  created_at: "...",
                },
                reason: "Interested",
                status: "pending",
                created_at: "2026-09-02T00:00:00Z",
                resolved_at: null,
              },
            ],
            next_cursor: null,
          });
        }),
        http.post(`${TEST_BASE_URL}/communities/rust/applications/:id/accept`, ({ params }) => {
          decisions.push(`accept:${params.id}`);
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${TEST_BASE_URL}/communities/rust/applications/:id/reject`, ({ params }) => {
          decisions.push(`reject:${params.id}`);
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.communities.apply("rust", { reason: "Interested" });
      expect(appliedBody).toEqual({ reason: "Interested" });

      const page = await client.communities.applications("rust", { status: "pending" });
      expect(capturedStatus).toBe("pending");
      expect(page.items[0]?.id).toBe("p_1");

      const ids: string[] = [];
      for await (const application of client.communities.iterateApplications("rust")) {
        ids.push(application.id);
      }
      expect(ids).toEqual(["p_1"]);

      await client.communities.acceptApplication("rust", "p_1");
      await client.communities.rejectApplication("rust", "p_2");
      expect(decisions).toEqual(["accept:p_1", "reject:p_2"]);
    });
  });
});
