import { describe, expect, it } from "vitest";
import { VERSION } from "../../src/index.js";

describe("Actos SDK", () => {
  it("exports current version", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
