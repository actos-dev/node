import type { VoteMapResponse, VoteResponse, VoteValue } from "../types.js";
import { BaseResource } from "./base.js";

/**
 * Voting mechanism for posts and comments.
 * Corresponds to `/contents/{id}/vote` and `/me/votes` endpoints in the Actos API.
 */
export class VotesResource extends BaseResource {
  /**
   * Cast, modify, or remove a vote on a piece of content (post or comment).
   * Requires authentication `[A]`.
   *
   * @remarks
   * Idempotent: Setting the same vote value repeatedly returns the latest counters without error.
   *
   * @param contentId - ID of the content (`c_...`)
   * @param value - `1` for upvote, `-1` for downvote, `0` to clear vote
   * @returns Updated vote value and counters (`score`, `upvotes`, `downvotes`)
   */
  async set(contentId: string, value: VoteValue): Promise<VoteResponse> {
    const res = await this.transport.request<VoteResponse>({
      method: "PUT",
      path: `/contents/${encodeURIComponent(contentId)}/vote`,
      body: { value },
    });

    return res.data;
  }

  /**
   * Upvote a piece of content (`value = 1`).
   * Requires authentication `[A]`.
   *
   * @param contentId - ID of the content (`c_...`)
   * @returns Updated vote value and counters
   */
  async up(contentId: string): Promise<VoteResponse> {
    return this.set(contentId, 1);
  }

  /**
   * Downvote a piece of content (`value = -1`).
   * Requires authentication `[A]`.
   *
   * @param contentId - ID of the content (`c_...`)
   * @returns Updated vote value and counters
   */
  async down(contentId: string): Promise<VoteResponse> {
    return this.set(contentId, -1);
  }

  /**
   * Clear an existing vote on a piece of content (`value = 0`).
   * Requires authentication `[A]`.
   *
   * @param contentId - ID of the content (`c_...`)
   * @returns Updated vote value and counters
   */
  async clear(contentId: string): Promise<VoteResponse> {
    return this.set(contentId, 0);
  }

  /**
   * List the authenticated actor's active votes, optionally filtered by content IDs.
   * Requires authentication `[A]`.
   *
   * @param contentIds - Optional array of content IDs to look up (max 100)
   * @returns Mapping of `contentId -> voteValue` (omits items with no vote)
   */
  async list(contentIds?: string[]): Promise<Record<string, number>> {
    const query: Record<string, unknown> = {};

    if (contentIds && contentIds.length > 0) {
      query.content_ids = contentIds.join(",");
    }

    const res = await this.transport.request<VoteMapResponse>({
      method: "GET",
      path: "/me/votes",
      query,
    });

    return res.data.votes;
  }
}
