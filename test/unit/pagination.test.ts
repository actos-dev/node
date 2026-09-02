import { describe, expect, it, vi } from "vitest";
import { createAsyncIterable } from "../../src/pagination.js";
import type { Page } from "../../src/types.js";

describe("Pagination utility (createAsyncIterable)", () => {
  it("iterates over multiple pages transparently", async () => {
    const fetchPage = vi.fn(async (cursor?: string): Promise<Page<string>> => {
      if (!cursor) {
        return { items: ["post_1", "post_2"], nextCursor: "cursor_page_2" };
      }
      if (cursor === "cursor_page_2") {
        return { items: ["post_3", "post_4"], nextCursor: "cursor_page_3" };
      }
      if (cursor === "cursor_page_3") {
        return { items: ["post_5"], nextCursor: null };
      }
      return { items: [], nextCursor: null };
    });

    const iterator = createAsyncIterable(fetchPage);
    const items: string[] = [];

    for await (const item of iterator) {
      items.push(item);
    }

    expect(items).toEqual(["post_1", "post_2", "post_3", "post_4", "post_5"]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor_page_2");
    expect(fetchPage).toHaveBeenNthCalledWith(3, "cursor_page_3");
  });

  it("handles single page with no next cursor", async () => {
    const fetchPage = vi.fn(async (): Promise<Page<number>> => {
      return { items: [10, 20, 30], nextCursor: null };
    });

    const iterator = createAsyncIterable(fetchPage);
    const items: number[] = [];

    for await (const item of iterator) {
      items.push(item);
    }

    expect(items).toEqual([10, 20, 30]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("handles completely empty initial page", async () => {
    const fetchPage = vi.fn(async (): Promise<Page<string>> => {
      return { items: [], nextCursor: null };
    });

    const iterator = createAsyncIterable(fetchPage);
    const items: string[] = [];

    for await (const item of iterator) {
      items.push(item);
    }

    expect(items).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("handles early break in loop without requesting subsequent pages", async () => {
    const fetchPage = vi.fn(async (cursor?: string): Promise<Page<string>> => {
      if (!cursor) {
        return { items: ["a", "b", "c"], nextCursor: "cur_2" };
      }
      return { items: ["d", "e"], nextCursor: null };
    });

    const iterator = createAsyncIterable(fetchPage);
    const collected: string[] = [];

    for await (const item of iterator) {
      collected.push(item);
      if (collected.length === 2) {
        break;
      }
    }

    expect(collected).toEqual(["a", "b"]);
    // Page 2 should not have been requested
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("collects items with and without limit", async () => {
    const fetchPage = vi.fn(async (cursor?: string): Promise<Page<number>> => {
      if (!cursor) {
        return { items: [1, 2, 3], nextCursor: "cur_2" };
      }
      return { items: [4, 5, 6], nextCursor: null };
    });

    const paginator1 = createAsyncIterable(fetchPage);
    const all = await paginator1.collect();
    expect(all).toEqual([1, 2, 3, 4, 5, 6]);

    fetchPage.mockClear();

    const paginator2 = createAsyncIterable(fetchPage);
    const limited = await paginator2.collect(2);
    expect(limited).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
