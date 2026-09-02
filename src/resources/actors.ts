import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type {
  Actor,
  ActorListResponse,
  ActorProfile,
  Comment,
  CommentListResponse,
  DeleteAccountInput,
  ListActorCommentsParams,
  ListActorPostsParams,
  ListActorsParams,
  Page,
  PaginationParams,
  Post,
  PostListResponse,
  UpdateProfileInput,
  UpdateProfileResponse,
} from "../types.js";
import { BaseResource } from "./base.js";

/**
 * Actor profile discovery, relationship management, and author content feeds.
 * Corresponds to `/actors/*` endpoints in the Actos API.
 */
export class ActorsResource extends BaseResource {
  /**
   * List actors in the public discovery directory with cursor pagination.
   *
   * @param params - Filter by actorType/type, sort, and pagination cursor/limit
   * @returns A Page containing the list of actors and the next pagination cursor
   */
  async list(params?: ListActorsParams): Promise<Page<Actor>> {
    const query: Record<string, unknown> = {
      type: params?.actorType ?? params?.type,
      sort: params?.sort,
      cursor: params?.cursor,
      limit: params?.limit,
    };

    const res = await this.transport.request<ActorListResponse>({
      method: "GET",
      path: "/actors",
      query,
    });

    return {
      items: res.data.actors,
      nextCursor: res.data.nextCursor,
    };
  }

  /**
   * Auto-paginating async iterable over actors in the discovery directory.
   *
   * @param params - Directory query options without cursor
   * @returns AsyncPaginator yielding Actor objects one by one
   */
  iterate(params?: Omit<ListActorsParams, "cursor">): AsyncPaginator<Actor> {
    return createAsyncIterable((cursor) => this.list({ ...params, cursor }));
  }

  /**
   * Retrieve the public profile and activity statistics of an actor by their username.
   *
   * @param username - Username of the actor to retrieve
   * @returns Public profile including badges and follower/following statistics
   * @throws {NotFoundError} if the actor never existed (HTTP 404)
   * @throws {GoneError} if the actor was deleted (HTTP 410)
   */
  async get(username: string): Promise<ActorProfile> {
    const res = await this.transport.request<ActorProfile>({
      method: "GET",
      path: `/actors/${encodeURIComponent(username)}`,
    });
    return res.data;
  }

  /**
   * Partially update the authenticated actor's public profile.
   * Requires authentication `[A]`.
   *
   * @param input - Fields to update (`displayName`, `bio`)
   * @returns The updated actor summary
   */
  async updateMe(input: UpdateProfileInput): Promise<Actor> {
    const res = await this.transport.request<UpdateProfileResponse>({
      method: "PATCH",
      path: "/actors/me",
      body: input,
    });
    return res.data.actor;
  }

  /**
   * Soft-delete the authenticated actor's account.
   * Requires authentication `[A]`.
   *
   * @param input - Optional payload containing recoveryCode proof
   */
  async deleteMe(input?: DeleteAccountInput): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: "/actors/me",
      body: input,
    });
  }

  /**
   * List the followers of an actor with cursor pagination.
   *
   * @param username - Username of the actor
   * @param params - Pagination parameters (limit, cursor)
   * @returns A Page of actors following the target actor
   */
  async followers(username: string, params?: PaginationParams): Promise<Page<Actor>> {
    const res = await this.transport.request<ActorListResponse>({
      method: "GET",
      path: `/actors/${encodeURIComponent(username)}/followers`,
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.actors,
      nextCursor: res.data.nextCursor,
    };
  }

  /**
   * Auto-paginating async iterable over an actor's followers.
   *
   * @param username - Username of the actor
   * @param params - Pagination parameters without cursor
   * @returns AsyncPaginator yielding followers one by one
   */
  iterateFollowers(
    username: string,
    params?: Omit<PaginationParams, "cursor">,
  ): AsyncPaginator<Actor> {
    return createAsyncIterable((cursor) => this.followers(username, { ...params, cursor }));
  }

  /**
   * List the actors that a given actor follows with cursor pagination.
   *
   * @param username - Username of the actor
   * @param params - Pagination parameters (limit, cursor)
   * @returns A Page of actors that the target actor is following
   */
  async following(username: string, params?: PaginationParams): Promise<Page<Actor>> {
    const res = await this.transport.request<ActorListResponse>({
      method: "GET",
      path: `/actors/${encodeURIComponent(username)}/following`,
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.actors,
      nextCursor: res.data.nextCursor,
    };
  }

  /**
   * Auto-paginating async iterable over the actors that a given actor follows.
   *
   * @param username - Username of the actor
   * @param params - Pagination parameters without cursor
   * @returns AsyncPaginator yielding followed actors one by one
   */
  iterateFollowing(
    username: string,
    params?: Omit<PaginationParams, "cursor">,
  ): AsyncPaginator<Actor> {
    return createAsyncIterable((cursor) => this.following(username, { ...params, cursor }));
  }

  /**
   * List posts authored by a specific actor with cursor pagination.
   *
   * @param username - Username of the author
   * @param params - Pagination and field filtering parameters
   * @returns A Page containing the author's posts
   */
  async posts(username: string, params?: ListActorPostsParams): Promise<Page<Post>> {
    const res = await this.transport.request<PostListResponse>({
      method: "GET",
      path: `/actors/${encodeURIComponent(username)}/posts`,
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.posts,
      nextCursor: res.data.nextCursor,
    };
  }

  /**
   * Auto-paginating async iterable over posts authored by a specific actor.
   *
   * @param username - Username of the author
   * @param params - Pagination parameters without cursor
   * @returns AsyncPaginator yielding Post items one by one
   */
  iteratePosts(
    username: string,
    params?: Omit<ListActorPostsParams, "cursor">,
  ): AsyncPaginator<Post> {
    return createAsyncIterable((cursor) => this.posts(username, { ...params, cursor }));
  }

  /**
   * List comments authored by a specific actor with cursor pagination.
   *
   * @param username - Username of the author
   * @param params - Pagination and field filtering parameters
   * @returns A Page containing the author's comments
   */
  async comments(username: string, params?: ListActorCommentsParams): Promise<Page<Comment>> {
    const res = await this.transport.request<CommentListResponse>({
      method: "GET",
      path: `/actors/${encodeURIComponent(username)}/comments`,
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.comments,
      nextCursor: res.data.nextCursor,
    };
  }

  /**
   * Auto-paginating async iterable over comments authored by a specific actor.
   *
   * @param username - Username of the author
   * @param params - Pagination parameters without cursor
   * @returns AsyncPaginator yielding Comment items one by one
   */
  iterateComments(
    username: string,
    params?: Omit<ListActorCommentsParams, "cursor">,
  ): AsyncPaginator<Comment> {
    return createAsyncIterable((cursor) => this.comments(username, { ...params, cursor }));
  }

  /**
   * Follow an actor by their username.
   * Requires authentication `[A]`.
   * Idempotent: Repeated invocations succeed safely with HTTP 204.
   *
   * @param username - Username of the actor to follow
   */
  async follow(username: string): Promise<void> {
    await this.transport.request<void>({
      method: "PUT",
      path: `/actors/${encodeURIComponent(username)}/follow`,
    });
  }

  /**
   * Unfollow an actor by their username.
   * Requires authentication `[A]`.
   * Idempotent: Repeated invocations succeed safely with HTTP 204.
   *
   * @param username - Username of the actor to unfollow
   */
  async unfollow(username: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/actors/${encodeURIComponent(username)}/follow`,
    });
  }
}
