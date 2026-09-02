import type { Page } from "./types.js";

export type { Page };

export type PageFetcher<T> = (cursor?: string) => Promise<Page<T>>;

/**
 * An AsyncIterableIterator that automatically handles cursor-based pagination.
 * Supports `for await (const item of paginator)` and `.collect(limit)`.
 */
export class AsyncPaginator<T> implements AsyncIterableIterator<T> {
  private readonly fetchPage: PageFetcher<T>;
  private currentCursor?: string;
  private currentItems: T[] = [];
  private itemIndex = 0;
  private done = false;
  private started = false;

  constructor(fetchPage: PageFetcher<T>, initialCursor?: string) {
    this.fetchPage = fetchPage;
    this.currentCursor = initialCursor;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    // If there are still items in the current page buffer, yield the next item
    if (this.itemIndex < this.currentItems.length) {
      const value = this.currentItems[this.itemIndex] as T;
      this.itemIndex++;
      return { done: false, value };
    }

    // If already started and no next cursor exists, iteration is complete
    if (this.started && (!this.currentCursor || this.currentCursor.trim() === "")) {
      this.done = true;
      return { done: true, value: undefined };
    }

    // Fetch next page
    this.started = true;
    const page = await this.fetchPage(this.currentCursor);

    this.currentItems = page.items || [];
    this.currentCursor = page.nextCursor ?? undefined;
    this.itemIndex = 0;

    // If fetched page has no items, iteration is complete
    if (this.currentItems.length === 0) {
      this.done = true;
      return { done: true, value: undefined };
    }

    const value = this.currentItems[this.itemIndex] as T;
    this.itemIndex++;
    return { done: false, value };
  }

  async return(): Promise<IteratorResult<T>> {
    this.done = true;
    this.currentItems = [];
    return { done: true, value: undefined };
  }

  /**
   * Collects items into an array, optionally up to a maximum limit.
   */
  async collect(limit?: number): Promise<T[]> {
    const results: T[] = [];
    for await (const item of this) {
      results.push(item);
      if (limit !== undefined && results.length >= limit) {
        break;
      }
    }
    return results;
  }
}

/**
 * Creates an AsyncPaginator for cursor-based pagination.
 */
export function createAsyncIterable<T>(
  fetchPage: PageFetcher<T>,
  initialCursor?: string,
): AsyncPaginator<T> {
  return new AsyncPaginator<T>(fetchPage, initialCursor);
}
