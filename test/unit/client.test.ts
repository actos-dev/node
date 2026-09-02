import util from "node:util";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Actos Client", () => {
  it("initializes with defaults", () => {
    const client = new Actos();
    expect(client.baseUrl).toBe("http://127.0.0.1:3100");
    expect(client.rateLimit).toBeNull();
  });

  it("initializes with custom options", () => {
    const client = new Actos({
      baseUrl: "https://api.actos.world",
      apiKey: "actos_test_secret_12345",
      timeout: 10_000,
      maxRetries: 3,
    });

    expect(client.baseUrl).toBe("https://api.actos.world");
    expect(client.transport.timeout).toBe(10_000);
    expect(client.transport.maxRetries).toBe(3);
  });

  it("reads environment variables when options are omitted", () => {
    const originalEnv = { ...process.env };
    process.env.ACTOS_BASE_URL = "https://env.actos.world";
    process.env.ACTOS_API_KEY = "env_secret_key";

    try {
      const client = new Actos();
      expect(client.baseUrl).toBe("https://env.actos.world");
      expect(client.transport.apiKey).toBe("env_secret_key");
    } finally {
      process.env = originalEnv;
    }
  });

  it("masks API key in toString, util.inspect, and JSON.stringify (§2.15)", () => {
    const secretKey = "actos_sec_secretpassword98765";
    const client = new Actos({
      baseUrl: "https://api.actos.world",
      apiKey: secretKey,
    });

    // 1. toString()
    const str = client.toString();
    expect(str).toContain("actos_***");
    expect(str).not.toContain(secretKey);

    // 2. util.inspect()
    const inspected = util.inspect(client);
    expect(inspected).toContain("actos_***");
    expect(inspected).not.toContain(secretKey);

    // 3. JSON.stringify()
    const jsonStr = JSON.stringify(client);
    expect(jsonStr).toContain("actos_***");
    expect(jsonStr).not.toContain(secretKey);
  });

  it("exposes all resource namespaces defined in SDK contract §2.1", () => {
    const client = new Actos();

    expect(client.auth).toBeDefined();
    expect(client.actors).toBeDefined();
    expect(client.posts).toBeDefined();
    expect(client.comments).toBeDefined();
    expect(client.tags).toBeDefined();
    expect(client.feed).toBeDefined();
    expect(client.search).toBeDefined();
    expect(client.votes).toBeDefined();
    expect(client.saves).toBeDefined();
    expect(client.uploads).toBeDefined();
    expect(client.reports).toBeDefined();
    expect(client.admin).toBeDefined();
    expect(client.meta).toBeDefined();
  });

  it("delegates rateLimit to transport", () => {
    const client = new Actos();
    expect(client.rateLimit).toBeNull();

    client.transport.rateLimit = {
      limit: 100,
      remaining: 85,
      reset: 1725300000,
    };

    expect(client.rateLimit).toEqual({
      limit: 100,
      remaining: 85,
      reset: 1725300000,
    });
  });

  it("provides raw escape hatch request without case transformation (§3)", async () => {
    let capturedBody: unknown;
    let capturedQuery: string | null = null;

    server.use(
      http.post(`${TEST_BASE_URL}/raw-endpoint`, async ({ request }) => {
        const url = new URL(request.url);
        capturedQuery = url.searchParams.get("raw_Param");
        capturedBody = await request.json();
        return HttpResponse.json({
          raw_response_key: "preserved_value",
          camelCaseKey: 42,
        });
      }),
    );

    const client = new Actos({ baseUrl: TEST_BASE_URL });

    const rawData = await client.request<{
      raw_response_key: string;
      camelCaseKey: number;
    }>("POST", "/raw-endpoint", {
      query: { raw_Param: "test_value" },
      body: JSON.stringify({ custom_body_field: 123, camelField: "abc" }),
    });

    // Query key preserved
    expect(capturedQuery).toBe("test_value");

    // Request payload keys preserved without camelToSnake
    expect(capturedBody).toEqual({
      custom_body_field: 123,
      camelField: "abc",
    });

    // Response payload keys preserved without snakeToCamel
    expect(rawData).toEqual({
      raw_response_key: "preserved_value",
      camelCaseKey: 42,
    });
  });
});
