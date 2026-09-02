import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type {
  ListTagsParams,
  Page,
  Post,
  PostListResponse,
  Tag,
  TagListResponse,
  TagMatch,
  TagPostsParams,
  TagSearchResponse,
} from "../types.js";
import { stringCamelToSnake } from "../utils/case.js";
import { BaseResource } from "./base.js";

/**
 * Tag discovery, autocomplete search, and tagged post feeds.
 * Corresponds to `/tags/*` endpoints in the Actos API.
 */
export class TagsResource extends BaseResource {
  /**
   * List tags ordered by usage count with cursor pagination.
   *
   * @remarks
   * Note: This endpoint does NOT support `fields` filtering.
   *
   * @param params - Pagination parameters (cursor, limit)
   * @returns A Page of Tag objects
   */
  async list(params?: ListTagsParams): Promise<Page<Tag>> {
    const res = await this.transport.request<TagListResponse>({
      method: "GET",
      path: "/tags",
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.tags,
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over tags.
   *
   * @param params - Pagination parameters without cursor
   * @returns AsyncPaginator yielding Tag objects one by one
   */
  iterate(params?: Omit<ListTagsParams, "cursor">): AsyncPaginator<Tag> {
    return createAsyncIterable((cursor) => this.list({ ...params, cursor }));
  }

  /**
   * Autocomplete/prefix search for tags matching a given prefix.
   *
   * @param prefix - Prefix to search for
   * @returns Array of matching tags with post counts
   */
  async search(prefix: string): Promise<TagMatch[]> {
    const res = await this.transport.request<TagSearchResponse>({
      method: "GET",
      path: "/tags/search",
      query: { q: prefix },
    });

    return res.data.tags;
  }

  /**
   * List posts tagged with a specific tag name.
   *
   * @param name - Tag name (without # prefix)
   * @param params - Sorting (`hot` | `new` | `top`), pagination, and field projection
   * @returns A Page of Post objects matching the tag
   */
  async posts<F extends keyof Post = keyof Post>(
    name: string,
    params?: TagPostsParams<F>,
  ): Promise<Page<Pick<Post, F>>> {
    const query: Record<string, unknown> = {
      sort: params?.sort,
      cursor: params?.cursor,
      limit: params?.limit,
      fields:
        params?.fields && params.fields.length > 0
          ? params.fields.map((f) => stringCamelToSnake(String(f))).join(",")
          : undefined,
    };

    const res = await this.transport.request<PostListResponse>({
      method: "GET",
      path: `/tags/${encodeURIComponent(name)}/posts`,
      query,
    });

    return {
      items: res.data.posts as unknown as Pick<Post, F>[],
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over posts tagged with a specific tag name.
   *
   * @param name - Tag name
   * @param params - Query options without cursor
   * @returns AsyncPaginator yielding Post items one by one
   */
  iteratePosts<F extends keyof Post = keyof Post>(
    name: string,
    params?: Omit<TagPostsParams<F>, "cursor">,
  ): AsyncPaginator<Pick<Post, F>> {
    return createAsyncIterable((cursor) => this.posts(name, { ...params, cursor }));
  }
}
