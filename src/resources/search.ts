import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type { ContentSearchResponse, Page, Post, SearchParams } from "../types.js";
import { stringCamelToSnake } from "../utils/case.js";
import { BaseResource } from "./base.js";

/**
 * Full-text search across posts, comments, and actors.
 * Corresponds to `/search` endpoints in the Actos API.
 */
export class SearchResource extends BaseResource {
  /**
   * Perform a full-text search with cursor pagination and optional field projection.
   *
   * @param params - Search query `q`, type (`post` | `comment` | `actor`), cursor, limit, fields
   * @returns A Page of search results matching the query
   */
  async query<F extends keyof Post = keyof Post>(
    params: SearchParams<F>,
  ): Promise<Page<Pick<Post, F>>> {
    const query: Record<string, unknown> = {
      q: params.q,
      type: params.type ?? "post",
      cursor: params.cursor,
      limit: params.limit,
      fields:
        params.fields && params.fields.length > 0
          ? params.fields.map((f) => stringCamelToSnake(String(f))).join(",")
          : undefined,
    };

    const res = await this.transport.request<ContentSearchResponse>({
      method: "GET",
      path: "/search",
      query,
    });

    return {
      items: res.data.results as unknown as Pick<Post, F>[],
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over search results.
   *
   * @param params - Search parameters without cursor
   * @returns AsyncPaginator yielding search result items one by one
   */
  iterate<F extends keyof Post = keyof Post>(
    params: Omit<SearchParams<F>, "cursor">,
  ): AsyncPaginator<Pick<Post, F>> {
    return createAsyncIterable((cursor) => this.query({ ...params, cursor }));
  }
}
