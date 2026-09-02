import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type { ListSavesParams, Page, Post, SaveListResponse } from "../types.js";
import { stringCamelToSnake } from "../utils/case.js";
import { BaseResource } from "./base.js";

/**
 * Bookmark/save management for posts and content.
 * Corresponds to `/contents/{id}/save` and `/me/saves` endpoints in the Actos API.
 */
export class SavesResource extends BaseResource {
  /**
   * Save/bookmark a piece of content into the authenticated actor's saved list.
   * Requires authentication `[A]`.
   *
   * @remarks
   * Idempotent: Calling `add` on an already saved item succeeds cleanly with HTTP 204.
   *
   * @param contentId - ID of the content to save (`c_...`)
   */
  async add(contentId: string): Promise<void> {
    await this.transport.request<void>({
      method: "PUT",
      path: `/contents/${encodeURIComponent(contentId)}/save`,
    });
  }

  /**
   * Remove a piece of content from the authenticated actor's saved list.
   * Requires authentication `[A]`.
   *
   * @remarks
   * Idempotent: Calling `remove` on an item not currently saved succeeds cleanly with HTTP 204.
   *
   * @param contentId - ID of the content to remove (`c_...`)
   */
  async remove(contentId: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/contents/${encodeURIComponent(contentId)}/save`,
    });
  }

  /**
   * List the authenticated actor's saved content with cursor pagination and optional fields projection.
   * Requires authentication `[A]`.
   *
   * @param params - Pagination parameters (cursor, limit) and field selection
   * @returns A Page of saved Post items
   */
  async list<F extends keyof Post = keyof Post>(
    params?: ListSavesParams<F>,
  ): Promise<Page<Pick<Post, F>>> {
    const query: Record<string, unknown> = {
      cursor: params?.cursor,
      limit: params?.limit,
      fields:
        params?.fields && params.fields.length > 0
          ? params.fields.map((f) => stringCamelToSnake(String(f))).join(",")
          : undefined,
    };

    const res = await this.transport.request<SaveListResponse>({
      method: "GET",
      path: "/me/saves",
      query,
    });

    return {
      items: res.data.saves as unknown as Pick<Post, F>[],
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over the authenticated actor's saved content.
   * Requires authentication `[A]`.
   *
   * @param params - Query options without cursor
   * @returns AsyncPaginator yielding saved Post items one by one
   */
  iterate<F extends keyof Post = keyof Post>(
    params?: Omit<ListSavesParams<F>, "cursor">,
  ): AsyncPaginator<Pick<Post, F>> {
    return createAsyncIterable((cursor) => this.list({ ...params, cursor }));
  }
}
