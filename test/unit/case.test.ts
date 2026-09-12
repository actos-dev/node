import { describe, expect, it } from "vitest";
import {
  camelToSnake,
  snakeToCamel,
  stringCamelToSnake,
  stringSnakeToCamel,
} from "../../src/utils/case.js";

describe("Case conversion utilities", () => {
  describe("string transformations", () => {
    it("converts camelCase strings to snake_case", () => {
      expect(stringCamelToSnake("displayName")).toBe("display_name");
      expect(stringCamelToSnake("actorType")).toBe("actor_type");
      expect(stringCamelToSnake("nextCursor")).toBe("next_cursor");
      expect(stringCamelToSnake("idempotencyKey")).toBe("idempotency_key");
      expect(stringCamelToSnake("id")).toBe("id");
      expect(stringCamelToSnake("sha256Checksum")).toBe("sha256_checksum");
    });

    it("converts snake_case strings to camelCase", () => {
      expect(stringSnakeToCamel("display_name")).toBe("displayName");
      expect(stringSnakeToCamel("actor_type")).toBe("actorType");
      expect(stringSnakeToCamel("next_cursor")).toBe("nextCursor");
      expect(stringSnakeToCamel("idempotency_key")).toBe("idempotencyKey");
      expect(stringSnakeToCamel("id")).toBe("id");
      expect(stringSnakeToCamel("checksum_sha256")).toBe("checksumSha256");
    });
  });

  describe("camelToSnake deep conversion", () => {
    it("converts plain nested objects", () => {
      const input = {
        displayName: "Agent Smith",
        actorType: "ai_agent",
        authorProfile: {
          followerCount: 42,
          registeredAt: "2026-09-02",
        },
      };

      const expected = {
        display_name: "Agent Smith",
        actor_type: "ai_agent",
        author_profile: {
          follower_count: 42,
          registered_at: "2026-09-02",
        },
      };

      expect(camelToSnake(input)).toEqual(expected);
    });

    it("converts arrays of objects", () => {
      const input = [
        { authorId: "1", postCount: 5 },
        { authorId: "2", postCount: 10 },
      ];

      const expected = [
        { author_id: "1", post_count: 5 },
        { author_id: "2", post_count: 10 },
      ];

      expect(camelToSnake(input)).toEqual(expected);
    });

    it("leaves primitives, null, undefined, dates unchanged", () => {
      expect(camelToSnake("string")).toBe("string");
      expect(camelToSnake(123)).toBe(123);
      expect(camelToSnake(true)).toBe(true);
      expect(camelToSnake(null)).toBeNull();
      expect(camelToSnake(undefined)).toBeUndefined();

      const date = new Date();
      expect(camelToSnake(date)).toBe(date);
    });
  });

  describe("snakeToCamel deep conversion", () => {
    it("converts plain nested objects", () => {
      const input = {
        display_name: "Agent Smith",
        actor_type: "ai_agent",
        author_profile: {
          follower_count: 42,
          registered_at: "2026-09-02",
        },
      };

      const expected = {
        displayName: "Agent Smith",
        actorType: "ai_agent",
        authorProfile: {
          followerCount: 42,
          registeredAt: "2026-09-02",
        },
      };

      expect(snakeToCamel(input)).toEqual(expected);
    });

    it("converts arrays of objects", () => {
      const input = [
        { author_id: "1", post_count: 5 },
        { author_id: "2", post_count: 10 },
      ];

      const expected = [
        { authorId: "1", postCount: 5 },
        { authorId: "2", postCount: 10 },
      ];

      expect(snakeToCamel(input)).toEqual(expected);
    });

    it("leaves primitives, null, undefined unchanged", () => {
      expect(snakeToCamel("string")).toBe("string");
      expect(snakeToCamel(123)).toBe(123);
      expect(snakeToCamel(null)).toBeNull();
      expect(snakeToCamel(undefined)).toBeUndefined();
    });
  });
});
