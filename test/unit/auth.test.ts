import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";
import { AuthenticationError, InvalidKeyError, ValidationError } from "../../src/errors.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AuthResource (client.auth)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_initial_123",
  });

  describe("register()", () => {
    it("registers new actor and returns one-time apiKey and recoveryCodes", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/auth/register`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(
            {
              actor: {
                id: "a_bob123",
                username: "bob",
                actor_type: "ai_agent",
                display_name: "Bob The Agent",
                bio: "Autonomous assistant",
                created_at: "2026-09-02T00:00:00Z",
              },
              api_key: "actos_sec_bob_initial_key",
              recovery_codes: ["code-1", "code-2", "code-3"],
            },
            { status: 201 },
          );
        }),
      );

      const res = await client.auth.register({
        username: "bob",
        actorType: "ai_agent",
        displayName: "Bob The Agent",
        bio: "Autonomous assistant",
      });

      // Request body had keys converted to snake_case
      expect(capturedBody).toEqual({
        username: "bob",
        actor_type: "ai_agent",
        display_name: "Bob The Agent",
        bio: "Autonomous assistant",
      });

      // Response converted to camelCase
      expect(res.actor.username).toBe("bob");
      expect(res.actor.actorType).toBe("ai_agent");
      expect(res.apiKey).toBe("actos_sec_bob_initial_key");
      expect(res.recoveryCodes).toEqual(["code-1", "code-2", "code-3"]);
    });

    it("throws ValidationError when username is taken or invalid", async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/auth/register`, () => {
          return HttpResponse.json(
            {
              code: "VALIDATION_FAILED",
              detail: "Username already exists or contains invalid characters",
            },
            { status: 400 },
          );
        }),
      );

      await expect(
        client.auth.register({
          username: "invalid!",
          actorType: "human",
        }),
      ).rejects.toThrowError(ValidationError);
    });
  });

  describe("whoami()", () => {
    it("returns authenticated actor, roles, and active key", async () => {
      let authHeader: string | null = null;

      server.use(
        http.get(`${TEST_BASE_URL}/auth/whoami`, ({ request }) => {
          authHeader = request.headers.get("authorization");
          return HttpResponse.json({
            actor: {
              id: "a_alice",
              username: "alice",
              actor_type: "human",
              created_at: "2026-09-02T00:00:00Z",
            },
            roles: ["admin", "moderator"],
            key: {
              id: "k_alice_1",
              label: "Primary Key",
              created_at: "2026-09-02T00:00:00Z",
            },
          });
        }),
      );

      const whoami = await client.auth.whoami();

      expect(authHeader).toBe("Bearer actos_sec_initial_123");
      expect(whoami.actor.username).toBe("alice");
      expect(whoami.roles).toEqual(["admin", "moderator"]);
      expect(whoami.key.id).toBe("k_alice_1");
    });

    it("throws AuthenticationError / InvalidKeyError when token is invalid", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/auth/whoami`, () => {
          return HttpResponse.json(
            { code: "INVALID_KEY", detail: "API key is invalid or revoked" },
            { status: 401 },
          );
        }),
      );

      await expect(client.auth.whoami()).rejects.toThrowError(InvalidKeyError);
      await expect(client.auth.whoami()).rejects.toThrowError(AuthenticationError);
    });
  });

  describe("createKey()", () => {
    it("creates a new API key with label and returns secret token", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/auth/keys`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(
            {
              key: {
                id: "k_runner_99",
                label: "worker-node-1",
                created_at: "2026-09-02T01:00:00Z",
              },
              api_key: "actos_sec_worker_token",
            },
            { status: 201 },
          );
        }),
      );

      const res = await client.auth.createKey({ label: "worker-node-1" });

      expect(capturedBody).toEqual({ label: "worker-node-1" });
      expect(res.key.id).toBe("k_runner_99");
      expect(res.key.label).toBe("worker-node-1");
      expect(res.apiKey).toBe("actos_sec_worker_token");
    });
  });

  describe("listKeys()", () => {
    it("returns array of active keys without secrets", async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/auth/keys`, () => {
          return HttpResponse.json({
            keys: [
              { id: "k_1", label: "Default", created_at: "2026-09-01T00:00:00Z" },
              { id: "k_2", label: "Worker", created_at: "2026-09-02T00:00:00Z" },
            ],
          });
        }),
      );

      const keys = await client.auth.listKeys();

      expect(keys).toHaveLength(2);
      expect(keys[0]?.id).toBe("k_1");
      expect(keys[1]?.id).toBe("k_2");
    });
  });

  describe("revokeKey()", () => {
    it("sends DELETE to /auth/keys/:key_id and succeeds with 204", async () => {
      let revokedId: string | null = null;

      server.use(
        http.delete(`${TEST_BASE_URL}/auth/keys/:keyId`, ({ params }) => {
          revokedId = params.keyId as string;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.auth.revokeKey("k_target_uuid");
      expect(revokedId).toBe("k_target_uuid");
    });
  });

  describe("recover()", () => {
    it("recovers account using recovery code and returns new apiKey", async () => {
      let capturedBody: unknown;

      server.use(
        http.post(`${TEST_BASE_URL}/auth/recover`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            api_key: "actos_sec_recovered_123",
            remaining_recovery_codes: 9,
          });
        }),
      );

      const res = await client.auth.recover({
        username: "bob",
        recoveryCode: "code-1",
      });

      expect(capturedBody).toEqual({
        username: "bob",
        recovery_code: "code-1",
      });

      expect(res.apiKey).toBe("actos_sec_recovered_123");
      expect(res.remainingRecoveryCodes).toBe(9);
    });
  });

  describe("regenerateRecoveryCodes()", () => {
    it("generates a new set of 10 recovery codes", async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/auth/recovery-codes/regenerate`, () => {
          return HttpResponse.json({
            recovery_codes: [
              "new-1",
              "new-2",
              "new-3",
              "new-4",
              "new-5",
              "new-6",
              "new-7",
              "new-8",
              "new-9",
              "new-10",
            ],
          });
        }),
      );

      const res = await client.auth.regenerateRecoveryCodes();

      expect(res.recoveryCodes).toHaveLength(10);
      expect(res.recoveryCodes[0]).toBe("new-1");
    });
  });
});
