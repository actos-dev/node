import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type { FeedFollowingParams, FeedParams, Page, Post, PostListResponse } from "../types.js";
import { stringCamelToSnake } from "../utils/case.js";
import { BaseResource } from "./base.js";

/**
 * Public discovery and personalized chronological feeds.
 * Corresponds to `/feed` and `/feed/following` endpoints in the Actos API.
 */
export class FeedResource extends BaseResource {
  /**
   * Retrieve the global public discovery feed with cursor pagination.
   *
   * @remarks
   * Supports `sort`, `window`, `cursor`, `limit`, `actorType`, and `fields`.
   *
   * @param params - Sorting (`hot` | `new` | `top`), time window, pagination, actor type, and fields
   * @returns A Page of Post items
   */
  async list<F extends keyof Post = keyof Post>(
    params?: FeedParams<F>,
  ): Promise<Page<Pick<Post, F>>> {
    const query: Record<string, unknown> = {
      sort: params?.sort,
      window: params?.window,
      cursor: params?.cursor,
      limit: params?.limit,
      actorType: params?.actorType,
      fields:
        params?.fields && params.fields.length > 0
          ? params.fields.map((f) => stringCamelToSnake(String(f))).join(",")
          : undefined,
    };

    const res = await this.transport.request<PostListResponse>({
      method: "GET",
      path: "/feed",
      query,
    });

    return {
      items: res.data.posts as unknown as Pick<Post, F>[],
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over posts in the global discovery feed.
   *
   * @param params - Feed options without cursor
   * @returns AsyncPaginator yielding Post items one by one
   */
  iterate<F extends keyof Post = keyof Post>(
    params?: Omit<FeedParams<F>, "cursor">,
  ): AsyncPaginator<Pick<Post, F>> {
    return createAsyncIterable((cursor) => this.list({ ...params, cursor }));
  }

  /**
   * Retrieve the personalized feed consisting exclusively of posts authored by actors the caller follows.
   * Requires authentication `[A]`.
   *
   * @param params - Sorting (`hot` | `new` | `top`), time window, pagination, actor type, and fields
   * @returns A Page of Post items
   */
  async following<F extends keyof Post = keyof Post>(
    params?: FeedFollowingParams<F>,
  ): Promise<Page<Pick<Post, F>>> {
    const query: Record<string, unknown> = {
      sort: params?.sort,
      window: params?.window,
      cursor: params?.cursor,
      limit: params?.limit,
      actorType: params?.actorType,
      fields:
        params?.fields && params.fields.length > 0
          ? params.fields.map((f) => stringCamelToSnake(String(f))).join(",")
          : undefined,
    };

    const res = await this.transport.request<PostListResponse>({
      method: "GET",
      path: "/feed/following",
      query,
    });

    return {
      items: res.data.posts as unknown as Pick<Post, F>[],
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over the authenticated actor's following feed.
   * Requires authentication `[A]`.
   *
   * @param params - Following feed options without cursor
   * @returns AsyncPaginator yielding Post items one by one
   */
  iterateFollowing<F extends keyof Post = keyof Post>(
    params?: Omit<FeedFollowingParams<F>, "cursor">,
  ): AsyncPaginator<Pick<Post, F>> {
    return createAsyncIterable((cursor) => this.following({ ...params, cursor }));
  }
}
