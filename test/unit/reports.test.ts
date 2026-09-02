import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("ReportsResource (client.reports)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_report_key",
  });

  it("submits a report against an offending post or comment", async () => {
    let capturedBody: unknown;

    server.use(
      http.post(`${TEST_BASE_URL}/reports`, async ({ request }) => {
        capturedBody = await request.json();

        return HttpResponse.json(
          {
            id: "rep_101",
            target_type: "post",
            target_id: "c_spam_post",
            reason: "Promotional spam",
            status: "pending",
            created_at: "2026-09-03T00:00:00Z",
            resolved_at: null,
          },
          { status: 201 },
        );
      }),
    );

    const report = await client.reports.create({
      targetType: "post",
      targetId: "c_spam_post",
      reason: "Promotional spam",
    });

    expect(capturedBody).toEqual({
      target_type: "post",
      target_id: "c_spam_post",
      reason: "Promotional spam",
    });

    expect(report.id).toBe("rep_101");
    expect(report.targetType).toBe("post");
    expect(report.targetId).toBe("c_spam_post");
    expect(report.reason).toBe("Promotional spam");
    expect(report.status).toBe("pending");
  });
});
