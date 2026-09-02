import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Actos } from "../../src/client.js";
import { ActosError } from "../../src/errors.js";

const TEST_BASE_URL = "http://api.actos.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("UploadsResource (client.uploads)", () => {
  const client = new Actos({
    baseUrl: TEST_BASE_URL,
    apiKey: "actos_sec_test_upload_key",
  });

  describe("create()", () => {
    it("uploads a Blob as multipart/form-data without manually setting Content-Type", async () => {
      let capturedContentType: string | null = null;
      let capturedFilename: string | null = null;
      let capturedByteSize = 0;

      server.use(
        http.post(`${TEST_BASE_URL}/uploads`, async ({ request }) => {
          capturedContentType = request.headers.get("content-type");
          const formData = await request.formData();
          const fileEntry = formData.get("file");

          if (fileEntry instanceof Blob) {
            capturedByteSize = fileEntry.size;
            capturedFilename = (fileEntry as { name?: string }).name ?? null;
          }

          return HttpResponse.json(
            {
              id: "u_blob_123",
              url: "https://cdn.actos.test/u_blob_123.webp",
              thumbnail_url: "https://cdn.actos.test/u_blob_123_thumb.webp",
              mime_type: "image/webp",
              byte_size: 1024,
              checksum_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
              created_at: "2026-09-03T00:00:00Z",
              width: 800,
              height: 600,
            },
            { status: 201 },
          );
        }),
      );

      const blob = new Blob(["hello world"], { type: "text/plain" });
      const upload = await client.uploads.create(blob, { filename: "hello.txt" });

      expect(capturedContentType).toContain("multipart/form-data; boundary=");
      expect(capturedFilename).toBe("hello.txt");
      expect(capturedByteSize).toBe(11);

      expect(upload.id).toBe("u_blob_123");
      expect(upload.thumbnailUrl).toBe("https://cdn.actos.test/u_blob_123_thumb.webp");
      expect(upload.byteSize).toBe(1024);
      expect(upload.width).toBe(800);
      expect(upload.height).toBe(600);
    });

    it("uploads a Uint8Array", async () => {
      let capturedFilename: string | null = null;

      server.use(
        http.post(`${TEST_BASE_URL}/uploads`, async ({ request }) => {
          const formData = await request.formData();
          const fileEntry = formData.get("file");
          if (fileEntry instanceof Blob) {
            capturedFilename = (fileEntry as { name?: string }).name ?? null;
          }

          return HttpResponse.json(
            {
              id: "u_uint8_456",
              url: "https://cdn.actos.test/u_uint8_456.webp",
              thumbnail_url: "https://cdn.actos.test/u_uint8_456_thumb.webp",
              mime_type: "image/webp",
              byte_size: 4,
              checksum_sha256: "abc...",
              created_at: "2026-09-03T00:00:00Z",
              width: null,
              height: null,
            },
            { status: 201 },
          );
        }),
      );

      const bytes = new Uint8Array([1, 2, 3, 4]);
      const upload = await client.uploads.create(bytes, { filename: "binary.dat" });

      expect(capturedFilename).toBe("binary.dat");
      expect(upload.id).toBe("u_uint8_456");
    });

    it("uploads from a local file path on disk in Node.js", async () => {
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, `actos_test_upload_${Date.now()}.png`);
      fs.writeFileSync(filePath, Buffer.from("fake-png-data"));

      let capturedFilename: string | null = null;

      server.use(
        http.post(`${TEST_BASE_URL}/uploads`, async ({ request }) => {
          const formData = await request.formData();
          const fileEntry = formData.get("file");
          if (fileEntry instanceof Blob) {
            capturedFilename = (fileEntry as { name?: string }).name ?? null;
          }

          return HttpResponse.json(
            {
              id: "u_disk_789",
              url: "https://cdn.actos.test/u_disk_789.webp",
              thumbnail_url: "https://cdn.actos.test/u_disk_789_thumb.webp",
              mime_type: "image/webp",
              byte_size: 13,
              checksum_sha256: "def...",
              created_at: "2026-09-03T00:00:00Z",
              width: 100,
              height: 100,
            },
            { status: 201 },
          );
        }),
      );

      try {
        const upload = await client.uploads.create(filePath);
        expect(capturedFilename).toBe(path.basename(filePath));
        expect(upload.id).toBe("u_disk_789");
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    it("throws ActosError when file path string is passed in a non-Node environment", async () => {
      const originalVersions = process.versions;
      try {
        // Temporarily simulate browser / non-Node environment
        Object.defineProperty(process, "versions", {
          value: {},
          configurable: true,
        });

        await expect(client.uploads.create("/some/path/image.png")).rejects.toThrowError(
          ActosError,
        );
      } finally {
        Object.defineProperty(process, "versions", {
          value: originalVersions,
          configurable: true,
        });
      }
    });
  });

  describe("delete()", () => {
    it("deletes an upload via DELETE /uploads/:id", async () => {
      let deletedId: string | null = null;

      server.use(
        http.delete(`${TEST_BASE_URL}/uploads/:id`, ({ params }) => {
          deletedId = params.id as string;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client.uploads.delete("u_test_del");
      expect(deletedId).toBe("u_test_del");
    });
  });

  describe("Upload and attach to post flow (§2.10, PLAN.md Faz 11)", () => {
    it("uploads an image and connects it to a new post via attachments array", async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/uploads`, () => {
          return HttpResponse.json(
            {
              id: "u_flow_123",
              url: "https://cdn.actos.test/u_flow_123.webp",
              thumbnail_url: "https://cdn.actos.test/u_flow_123_thumb.webp",
              mime_type: "image/webp",
              byte_size: 2048,
              checksum_sha256: "sha256...",
              created_at: "2026-09-03T00:00:00Z",
              width: 1920,
              height: 1080,
            },
            { status: 201 },
          );
        }),
        http.post(`${TEST_BASE_URL}/posts`, async ({ request }) => {
          const body = (await request.json()) as {
            title: string;
            body: string;
            attachments?: string[];
          };

          return HttpResponse.json(
            {
              id: "c_post_with_attachment",
              title: body.title,
              content_type: "post",
              body: body.body,
              body_format: "markdown",
              author_deleted: false,
              score: 0,
              upvotes: 0,
              downvotes: 0,
              comment_count: 0,
              created_at: "2026-09-03T00:00:00Z",
              deleted: false,
              attachments: [
                {
                  id: "u_flow_123",
                  url: "https://cdn.actos.test/u_flow_123.webp",
                  thumbnail_url: "https://cdn.actos.test/u_flow_123_thumb.webp",
                  mime_type: "image/webp",
                  byte_size: 2048,
                  checksum_sha256: "sha256...",
                  created_at: "2026-09-03T00:00:00Z",
                  width: 1920,
                  height: 1080,
                },
              ],
              author: { id: "a_1", username: "author", actor_type: "human", created_at: "..." },
            },
            { status: 201 },
          );
        }),
      );

      // Step 1: Upload the file
      const blob = new Blob(["image-bytes"], { type: "image/png" });
      const upload = await client.uploads.create(blob, { filename: "screenshot.png" });
      expect(upload.id).toBe("u_flow_123");

      // Step 2: Attach to post
      const post = await client.posts.create({
        title: "Check out this visual architecture",
        body: "Diagram attached below",
        attachments: [upload.id],
      });

      expect(post.id).toBe("c_post_with_attachment");
      expect(post.attachments).toHaveLength(1);
      expect(post.attachments?.[0]?.id).toBe("u_flow_123");
      expect(post.attachments?.[0]?.url).toBe("https://cdn.actos.test/u_flow_123.webp");
    });
  });
});
