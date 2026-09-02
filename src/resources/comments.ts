import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type {
  Comment,
  CommentDetail,
  CommentNode,
  CommentThreadResponse,
  CreateCommentInput,
  ListCommentsParams,
  UpdateCommentInput,
} from "../types.js";
import { BaseResource } from "./base.js";

/**
 * Comment creation, thread traversal, updates, and deletion.
 * Corresponds to `/posts/{id}/comments` and `/comments/{id}` endpoints in the Actos API.
 */
export class CommentsResource extends BaseResource {
  /**
   * Post a new comment or reply to an existing comment.
   * Requires authentication `[A]`.
   *
   * @param postId - ID of the post being commented on (`c_...`)
   * @param input - Comment body, optional parentId, and attachments
   * @returns The created comment
   */
  async create(postId: string, input: CreateCommentInput): Promise<Comment> {
    const body = {
      body: input.body,
      parentId: input.parentId,
      attachmentIds: input.attachmentIds ?? input.attachments,
    };

    const res = await this.transport.request<Comment>({
      method: "POST",
      path: `/posts/${encodeURIComponent(postId)}/comments`,
      body,
      idempotencyKey: input.idempotencyKey ?? undefined,
    });

    return res.data;
  }

  /**
   * List the hierarchical comment tree/forest for a post.
   *
   * @remarks
   * Note: This endpoint does NOT support `fields` projection; full comment nodes are returned.
   *
   * @param postId - ID of the post
   * @param params - Sorting (`new` | `top`), tree depth, parent comment filter, cursor, limit
   * @returns Array of top-level comment nodes, each containing their nested replies
   */
  async list(postId: string, params?: ListCommentsParams): Promise<CommentNode[]> {
    const res = await this.transport.request<CommentThreadResponse>({
      method: "GET",
      path: `/posts/${encodeURIComponent(postId)}/comments`,
      query: params as Record<string, unknown>,
    });

    return res.data.comments;
  }

  /**
   * Auto-paginating async iterable over top-level comment nodes in a post's comment thread.
   *
   * @param postId - ID of the post
   * @param params - Thread query options without cursor
   * @returns AsyncPaginator yielding CommentNode objects
   */
  iterate(
    postId: string,
    params?: Omit<ListCommentsParams, "cursor">,
  ): AsyncPaginator<CommentNode> {
    return createAsyncIterable(async (cursor) => {
      const res = await this.transport.request<CommentThreadResponse>({
        method: "GET",
        path: `/posts/${encodeURIComponent(postId)}/comments`,
        query: { ...params, cursor } as Record<string, unknown>,
      });

      return {
        items: res.data.comments,
        nextCursor: res.data.nextCursor ?? null,
      };
    });
  }

  /**
   * Retrieve a single comment along with its ancestor chain back to the root.
   *
   * @remarks
   * **Soft-deletion Note**:
   * Unlike posts which return HTTP 410 Gone when deleted, a soft-deleted comment returns
   * HTTP 200 OK with `comment.deleted: true` and `comment.body: "[silindi]"`.
   * This preserves the comment thread tree structure for any descendant replies.
   *
   * @param id - The comment ID (`c_...`)
   * @returns The comment detail with ancestor comments
   * @throws {NotFoundError} if the comment never existed (HTTP 404)
   */
  async get(id: string): Promise<CommentDetail> {
    const res = await this.transport.request<CommentDetail>({
      method: "GET",
      path: `/comments/${encodeURIComponent(id)}`,
    });

    return res.data;
  }

  /**
   * Update the body text of an existing comment.
   * Requires authentication `[A]`.
   *
   * @param id - ID of the comment to edit
   * @param input - Updated body text
   * @returns The updated comment
   */
  async update(id: string, input: UpdateCommentInput): Promise<Comment> {
    const res = await this.transport.request<Comment>({
      method: "PATCH",
      path: `/comments/${encodeURIComponent(id)}`,
      body: input,
    });

    return res.data;
  }

  /**
   * Soft-delete a comment by its ID.
   * Requires authentication `[A]`.
   * The comment node remains in the tree with masked content so its replies remain accessible.
   *
   * @param id - ID of the comment to delete
   */
  async delete(id: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/comments/${encodeURIComponent(id)}`,
    });
  }
}
