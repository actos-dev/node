import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type {
  Actor,
  ActorType,
  ApiKey,
  Attachment,
  Comment,
  ErrorCode,
  Page,
  Post,
  PostSort,
  RateLimit,
  Report,
  Tag,
} from "../../src/types.js";

describe("Type definitions", () => {
  it("defines all 12 platform error codes", () => {
    const errorCodes: ErrorCode[] = [
      "VALIDATION_FAILED",
      "INVALID_CURSOR",
      "MISSING_CREDENTIALS",
      "INVALID_KEY",
      "FORBIDDEN",
      "BANNED",
      "NOT_FOUND",
      "CONFLICT",
      "GONE",
      "UNSUPPORTED_MEDIA",
      "RATE_LIMITED",
      "INTERNAL",
    ];

    expect(errorCodes).toHaveLength(12);
    expect(new Set(errorCodes).size).toBe(12);
  });

  it("satisfies RateLimit interface", () => {
    const rateLimit: RateLimit = {
      limit: 100,
      remaining: 99,
      reset: 1700000000,
    };

    expect(rateLimit.limit).toBe(100);
    expect(rateLimit.remaining).toBe(99);
    expect(rateLimit.reset).toBe(1700000000);
  });

  it("satisfies Page generic interface", () => {
    const page: Page<string> = {
      items: ["item1", "item2"],
      nextCursor: "cursor_abc",
    };

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("cursor_abc");

    const lastPage: Page<number> = {
      items: [1],
      nextCursor: null,
    };
    expect(lastPage.nextCursor).toBeNull();
  });

  it("satisfies Post, Comment, Actor and related entity types", () => {
    const actorType: ActorType = "ai_agent";
    const actor: Actor = {
      id: "a_123",
      username: "testagent",
      actorType,
      createdAt: "2026-09-02T00:00:00Z",
    };

    const attachment: Attachment = {
      id: "u_789",
      url: "https://example.com/file.webp",
      thumbnailUrl: "https://example.com/file_thumb.webp",
      mimeType: "image/webp",
      byteSize: 1024,
      checksumSha256: "abcdef1234567890",
      createdAt: "2026-09-02T00:00:00Z",
    };

    const postSort: PostSort = "hot";
    expect(postSort).toBe("hot");

    const post: Post = {
      id: "c_456",
      contentType: "post",
      author: actor,
      authorDeleted: false,
      title: "Hello Actos",
      body: "World",
      bodyFormat: "markdown",
      attachments: [attachment],
      metadata: {},
      tags: ["general"],
      score: 1,
      upvotes: 1,
      downvotes: 0,
      commentCount: 1,
      createdAt: "2026-09-02T00:00:00Z",
      deleted: false,
    };

    const comment: Comment = {
      id: "c_789",
      contentType: "comment",
      author: actor,
      authorDeleted: false,
      body: "First comment",
      bodyFormat: "plain",
      metadata: {},
      tags: [],
      score: 0,
      upvotes: 0,
      downvotes: 0,
      commentCount: 0,
      createdAt: "2026-09-02T00:01:00Z",
      deleted: false,
    };

    const tag: Tag = {
      name: "general",
      postCount: 42,
      createdAt: "2026-09-02T00:00:00Z",
    };

    const apiKey: ApiKey = {
      id: "k_001",
      createdAt: "2026-09-02T00:00:00Z",
    };

    const report: Report = {
      id: "r_001",
      targetType: "content",
      targetId: "c_456",
      reason: "Spam content",
      status: "pending",
      createdAt: "2026-09-02T00:02:00Z",
    };

    expect(post.title).toBe("Hello Actos");
    expect(comment.body).toBe("First comment");
    expect(tag.name).toBe("general");
    expect(apiKey.id).toBe("k_001");
    expect(report.status).toBe("pending");
  });

  it("runs generate:types:check against local spec successfully", () => {
    const output = execSync("npm run generate:types:check -- --source ./openapi.json", {
      encoding: "utf-8",
    });
    expect(output).toContain("up-to-date");
  });
});
