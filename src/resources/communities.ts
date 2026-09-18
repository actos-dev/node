import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type {
  Application,
  ApplicationListResponse,
  Community,
  CommunityListResponse,
  CommunityMember,
  CommunityMemberListResponse,
  CommunityPostsParams,
  CreateApplicationInput,
  CreateCommunityInput,
  CreateInvitationInput,
  Invitation,
  InvitationListResponse,
  ListApplicationsParams,
  ListCommunitiesParams,
  ListCommunityMembersParams,
  ListInvitationsParams,
  Page,
  Post,
  PostListResponse,
  SuccessorInput,
  UpdateCommunityInput,
} from "../types.js";
import { stringCamelToSnake } from "../utils/case.js";
import { BaseResource } from "./base.js";

/**
 * Community directory, membership, moderation queues, and invitations.
 * Corresponds to `/communities/*` and `/me/invitations*` endpoints in the Actos API.
 */
export class CommunitiesResource extends BaseResource {
  /**
   * List public communities in the directory, newest first, with cursor pagination.
   *
   * @remarks
   * Private communities are never listed. Note: `isMember` is always `false` here,
   * because a directory listing has no actor to ask about.
   *
   * @param params - Pagination parameters (cursor, limit)
   * @returns A Page of Community objects
   */
  async list(params?: ListCommunitiesParams): Promise<Page<Community>> {
    const res = await this.transport.request<CommunityListResponse>({
      method: "GET",
      path: "/communities",
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.communities,
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over the public community directory.
   *
   * @param params - Directory query options without cursor
   * @returns AsyncPaginator yielding Community objects one by one
   */
  iterate(params?: Omit<ListCommunitiesParams, "cursor">): AsyncPaginator<Community> {
    return createAsyncIterable((cursor) => this.list({ ...params, cursor }));
  }

  /**
   * Retrieve a single community by its name.
   *
   * @remarks
   * A private community a viewer may not see inside returns a cover: the same name
   * and description, with `memberCount = 0`, `postCount = 0` and `isMember = false`.
   *
   * @param name - Community name
   * @returns The community summary (or cover)
   * @throws {NotFoundError} if the community does not exist (HTTP 404)
   */
  async get(name: string): Promise<Community> {
    const res = await this.transport.request<Community>({
      method: "GET",
      path: `/communities/${encodeURIComponent(name)}`,
    });

    return res.data;
  }

  /**
   * Create a community. The creator becomes the owner and the first member.
   * Requires authentication `[A]`.
   *
   * @remarks
   * An actor may own at most 3 communities. `visibility` may be `public` (default)
   * or `private`; a private community is unlisted and only its members can see inside.
   *
   * @param input - Community name, description, and optional visibility
   * @returns The newly created community
   */
  async create(input: CreateCommunityInput): Promise<Community> {
    const res = await this.transport.request<Community>({
      method: "POST",
      path: "/communities",
      body: input,
    });

    return res.data;
  }

  /**
   * Edit a community's description and/or visibility.
   * Requires authentication `[A]` and `community.edit` scoped to the community
   * (the owner always holds it).
   *
   * @remarks
   * The name is the community's address and is not editable. `visibility` is
   * one-way: a public community may become private, never the reverse.
   *
   * @param name - Community name
   * @param input - New description and/or visibility; absent fields are left unchanged
   * @returns The updated community
   */
  async update(name: string, input: UpdateCommunityInput): Promise<Community> {
    const res = await this.transport.request<Community>({
      method: "PATCH",
      path: `/communities/${encodeURIComponent(name)}`,
      body: input,
    });

    return res.data;
  }

  /**
   * Join a public community.
   * Requires authentication `[A]`.
   *
   * @remarks
   * Instant and idempotent: being a member already is not an error.
   *
   * @param name - Community name
   */
  async join(name: string): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/communities/${encodeURIComponent(name)}/join`,
    });
  }

  /**
   * Leave a community.
   * Requires authentication `[A]`.
   *
   * @remarks
   * Idempotent. If the owner leaves, ownership passes to the designated successor,
   * else to the longest-serving moderator; a community with neither is closed.
   *
   * @param name - Community name
   */
  async leave(name: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/communities/${encodeURIComponent(name)}/join`,
    });
  }

  /**
   * List a community's members, longest-serving first, with cursor pagination.
   *
   * @param name - Community name
   * @param params - Pagination parameters (cursor, limit)
   * @returns A Page of CommunityMember objects
   */
  async members(name: string, params?: ListCommunityMembersParams): Promise<Page<CommunityMember>> {
    const res = await this.transport.request<CommunityMemberListResponse>({
      method: "GET",
      path: `/communities/${encodeURIComponent(name)}/members`,
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.members,
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over a community's members.
   *
   * @param name - Community name
   * @param params - Query options without cursor
   * @returns AsyncPaginator yielding CommunityMember objects one by one
   */
  iterateMembers(
    name: string,
    params?: Omit<ListCommunityMembersParams, "cursor">,
  ): AsyncPaginator<CommunityMember> {
    return createAsyncIterable((cursor) => this.members(name, { ...params, cursor }));
  }

  /**
   * Kick a member from a community.
   * Requires authentication `[A]` and `member.kick` scoped to the community.
   *
   * @remarks
   * The owner cannot be kicked. A non-member returns HTTP 404.
   *
   * @param name - Community name
   * @param username - Username of the member to kick
   */
  async kick(name: string, username: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/communities/${encodeURIComponent(name)}/members/${encodeURIComponent(username)}`,
    });
  }

  /**
   * List a community's posts with cursor pagination and optional fields projection.
   *
   * @remarks
   * Supports the three sorts (`new`, `top`, `hot`). A community that exists but has
   * no live posts returns an empty list, not `404`.
   *
   * @param name - Community name
   * @param params - Sorting, pagination, and field projection
   * @returns A Page of Post objects belonging to the community
   */
  async posts<F extends keyof Post = keyof Post>(
    name: string,
    params?: CommunityPostsParams<F>,
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
      path: `/communities/${encodeURIComponent(name)}/posts`,
      query,
    });

    return {
      items: res.data.posts as unknown as Pick<Post, F>[],
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over a community's posts.
   *
   * @param name - Community name
   * @param params - Query options without cursor
   * @returns AsyncPaginator yielding Post items one by one
   */
  iteratePosts<F extends keyof Post = keyof Post>(
    name: string,
    params?: Omit<CommunityPostsParams<F>, "cursor">,
  ): AsyncPaginator<Pick<Post, F>> {
    return createAsyncIterable((cursor) => this.posts(name, { ...params, cursor }));
  }

  /**
   * Close a community.
   * Requires authentication `[A]` and `community.close` scoped to the community.
   *
   * @remarks
   * A public community's posts become independent; a private community's posts are
   * deleted. Closing an already closed community returns HTTP 404.
   *
   * @param name - Community name
   */
  async close(name: string): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/communities/${encodeURIComponent(name)}/close`,
    });
  }

  /**
   * Designate the actor who inherits a community when the owner leaves or deletes
   * their account. Owner only.
   *
   * @param name - Community name
   * @param input - Username of the successor
   */
  async setSuccessor(name: string, input: SuccessorInput): Promise<void> {
    await this.transport.request<void>({
      method: "PUT",
      path: `/communities/${encodeURIComponent(name)}/successor`,
      body: input,
    });
  }

  /**
   * Invite an actor to a private community.
   * Requires authentication `[A]` and `member.invite` scoped to the community.
   *
   * @remarks
   * Private communities only; a public community is joined instantly and returns
   * HTTP 400. The invitee is not a member until they accept.
   *
   * @param name - Community name
   * @param input - Username of the invitee
   */
  async invite(name: string, input: CreateInvitationInput): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/communities/${encodeURIComponent(name)}/invitations`,
      body: input,
    });
  }

  /**
   * List a community's applications (the moderation queue), oldest first.
   * Requires authentication `[A]` and `member.approve` scoped to the community.
   *
   * @param name - Community name
   * @param params - Optional status filter, cursor, and limit
   * @returns A Page of Application objects
   */
  async applications(name: string, params?: ListApplicationsParams): Promise<Page<Application>> {
    const res = await this.transport.request<ApplicationListResponse>({
      method: "GET",
      path: `/communities/${encodeURIComponent(name)}/applications`,
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.applications,
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over a community's applications.
   *
   * @param name - Community name
   * @param params - Query options without cursor
   * @returns AsyncPaginator yielding Application objects one by one
   */
  iterateApplications(
    name: string,
    params?: Omit<ListApplicationsParams, "cursor">,
  ): AsyncPaginator<Application> {
    return createAsyncIterable((cursor) => this.applications(name, { ...params, cursor }));
  }

  /**
   * Apply to a private community.
   * Requires authentication `[A]`.
   *
   * @remarks
   * Private communities only; a public community is joined instantly and returns
   * HTTP 400. The actor must not already be a member and must not be banned.
   *
   * @param name - Community name
   * @param input - Reason for applying (1-2000 characters)
   */
  async apply(name: string, input: CreateApplicationInput): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/communities/${encodeURIComponent(name)}/applications`,
      body: input,
    });
  }

  /**
   * Accept a pending application, making the applicant a member.
   * Requires authentication `[A]` and `member.approve` scoped to the community.
   *
   * @param name - Community name
   * @param id - The application's external id (`p_...`)
   */
  async acceptApplication(name: string, id: string): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/communities/${encodeURIComponent(name)}/applications/${encodeURIComponent(id)}/accept`,
    });
  }

  /**
   * Reject a pending application.
   * Requires authentication `[A]` and `member.approve` scoped to the community.
   *
   * @param name - Community name
   * @param id - The application's external id (`p_...`)
   */
  async rejectApplication(name: string, id: string): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/communities/${encodeURIComponent(name)}/applications/${encodeURIComponent(id)}/reject`,
    });
  }

  /**
   * List the authenticated actor's pending invitations, newest first.
   * Requires authentication `[A]`.
   *
   * @param params - Pagination parameters (cursor, limit)
   * @returns A Page of Invitation objects
   */
  async invitations(params?: ListInvitationsParams): Promise<Page<Invitation>> {
    const res = await this.transport.request<InvitationListResponse>({
      method: "GET",
      path: "/me/invitations",
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.invitations,
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over the authenticated actor's pending invitations.
   *
   * @param params - Query options without cursor
   * @returns AsyncPaginator yielding Invitation objects one by one
   */
  iterateInvitations(params?: Omit<ListInvitationsParams, "cursor">): AsyncPaginator<Invitation> {
    return createAsyncIterable((cursor) => this.invitations({ ...params, cursor }));
  }

  /**
   * Accept an invitation, becoming a member of its community.
   * Requires authentication `[A]`.
   *
   * @param id - The invitation's external id (`i_...`)
   */
  async acceptInvitation(id: string): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/me/invitations/${encodeURIComponent(id)}/accept`,
    });
  }

  /**
   * Decline an invitation without becoming a member.
   * Requires authentication `[A]`.
   *
   * @param id - The invitation's external id (`i_...`)
   */
  async declineInvitation(id: string): Promise<void> {
    await this.transport.request<void>({
      method: "POST",
      path: `/me/invitations/${encodeURIComponent(id)}/decline`,
    });
  }
}
