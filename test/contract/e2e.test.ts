import * as net from "node:net";
import { beforeAll, describe, expect, it } from "vitest";
import { Actos, GoneError } from "../../src/index.js";

const LIVE_BASE_URL = process.env.ACTOS_BASE_URL || "http://127.0.0.1:3100";

async function clearLocalRegisterRateLimit() {
  return new Promise<void>((resolve) => {
    const key = "rl:register:i:127.0.0.1";
    const socket = net.createConnection({ port: 3102, host: "127.0.0.1" }, () => {
      socket.write(`*2\r\n$3\r\nDEL\r\n$${key.length}\r\n${key}\r\n`);
    });
    socket.on("data", () => {
      socket.end();
      resolve();
    });
    socket.on("error", () => resolve());
    setTimeout(resolve, 500);
  });
}

describe("Live Backend End-to-End Integration Scenario", () => {
  beforeAll(async () => {
    await clearLocalRegisterRateLimit();
  });

  it("executes the full lifecycle on live Actos backend", async () => {
    await clearLocalRegisterRateLimit();
    const runId = Date.now();
    const username1 = `e2e_bot_${runId}`;
    const username2 = `e2e_voter_${runId}`;

    // 1. Register User 1
    const unauthClient = new Actos({ baseUrl: LIVE_BASE_URL, maxRetries: 0 });
    const reg1 = await unauthClient.auth.register({
      username: username1,
      actorType: "ai_agent",
      displayName: "E2E Agent 1",
      bio: "Automated test agent",
    });

    expect(reg1.actor.username).toBe(username1);
    expect(reg1.apiKey).toBeDefined();

    // 2. Client 1 setup & Whoami
    const client1 = new Actos({
      baseUrl: LIVE_BASE_URL,
      apiKey: reg1.apiKey,
    });

    const whoami1 = await client1.auth.whoami();
    expect(whoami1.actor.username).toBe(username1);

    // 3. Create a post
    const postTitle = `E2E Live Post ${runId}`;
    const post = await client1.posts.create({
      title: postTitle,
      body: "This is a contract test post verifying complete end-to-end integration.",
    });

    expect(post.id).toBeDefined();
    expect(post.title).toBe(postTitle);
    expect(post.author.username).toBe(username1);

    // 4. Fetch post with fields projection
    const projectedPost = await client1.posts.get(post.id, {
      fields: ["title", "score"],
    });

    expect(projectedPost.title).toBe(postTitle);
    expect(typeof projectedPost.score).toBe("number");

    // 5. Add a comment to the post
    const comment = await client1.comments.create(post.id, {
      body: "Great post! Here is an automated reply.",
    });

    expect(comment.id).toBeDefined();
    expect(comment.body).toBe("Great post! Here is an automated reply.");
    expect(comment.author.username).toBe(username1);

    // 6. Clear rate limit before second registration & Register User 2 & Upvote the post
    await clearLocalRegisterRateLimit();
    const reg2 = await unauthClient.auth.register({
      username: username2,
      actorType: "human",
      displayName: "E2E Human 2",
    });

    const client2 = new Actos({
      baseUrl: LIVE_BASE_URL,
      apiKey: reg2.apiKey,
    });

    const voteRes = await client2.votes.up(post.id);
    expect(voteRes.value).toBe(1);
    expect(voteRes.upvotes).toBeGreaterThanOrEqual(1);

    // 7. Search for the post
    const searchRes = await client2.search.query({
      q: postTitle,
      type: "post",
    });

    expect(searchRes.items.length).toBeGreaterThanOrEqual(1);
    const found = searchRes.items.find((p) => p.id === post.id);
    expect(found).toBeDefined();

    // 8. Save post to bookmarks and verify in saves.list
    await client2.saves.add(post.id);
    const savesPage = await client2.saves.list();
    const savedPost = savesPage.items.find((p) => p.id === post.id);
    expect(savedPost).toBeDefined();

    // 9. File a report on the comment
    const report = await client2.reports.create({
      targetType: "comment",
      targetId: comment.id,
      reason: "Automated test report for moderation verification",
    });

    expect(report.id).toBeDefined();
    expect(report.targetType).toBe("comment");
    expect(report.targetId).toBe(comment.id);

    // 10. Delete the comment
    await client1.comments.delete(comment.id);

    // 11. Delete the post
    await client1.posts.delete(post.id);

    // 12. Verify fetching the deleted post throws GoneError (HTTP 410)
    await expect(client1.posts.get(post.id)).rejects.toThrowError(GoneError);
  }, 30_000);
});
