import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";
import { VERSION } from "../../src/version.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("MetaResource (client.meta)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_meta_key",
  });

  it("checks liveness via GET /health", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/health`, () => {
        return HttpResponse.json({ status: "ok" });
      }),
    );

    const res = await client.meta.health();
    expect(res.status).toBe("ok");
  });

  it("checks readiness via GET /health/ready", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/health/ready`, () => {
        return HttpResponse.json({
          status: "ready",
          database: { status: "up" },
          redis: { status: "up" },
          storage: { status: "up" },
        });
      }),
    );

    const res = await client.meta.ready();
    expect(res.status).toBe("ready");
    expect(res.database).toEqual({ status: "up" });
  });

  it("returns SDK and server version information via GET /version", async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/version`, () => {
        return HttpResponse.json({
          api_version: "v1",
          git_sha: "abcdef123456",
          name: "actos-api",
          version: "0.1.0",
        });
      }),
    );

    const info = await client.meta.version();
    expect(info.sdk).toBe(VERSION);
    expect(info.server?.apiVersion).toBe("v1");
    expect(info.server?.gitSha).toBe("abcdef123456");
    expect(info.server?.name).toBe("actos-api");
    expect(info.server?.version).toBe("0.1.0");
  });

  it("fetches raw OpenAPI specification via GET /openapi.json", async () => {
    const mockSpec = {
      openapi: "3.1.0",
      info: { title: "Actos API", version: "0.1.0" },
      paths: {
        "/posts/{id}": {},
      },
    };

    server.use(
      http.get(`${TEST_BASE_URL}/openapi.json`, () => {
        return HttpResponse.json(mockSpec);
      }),
    );

    const spec = await client.meta.openapi();
    expect(spec).toEqual(mockSpec);
  });
});
