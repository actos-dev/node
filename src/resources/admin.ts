import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type {
  AdminAction,
  AdminActionListResponse,
  Ban,
  CreateBanInput,
  ListAdminReportsParams,
  ModerateDeleteInput,
  Page,
  PaginationParams,
  Report,
  ReportListResponse,
  SetPermissionInput,
  UpdateReportInput,
} from "../types.js";
import { BaseResource } from "./base.js";

/**
 * Report management for moderators and administrators.
 * Corresponds to `/admin/reports/*` endpoints.
 */
export class AdminReportsResource extends BaseResource {
  /**
   * List reported items in the moderation queue with cursor pagination.
   * Requires moderator or admin role `[M]`.
   *
   * @param params - Filter by report status (`pending` | `resolved` | `dismissed`), cursor, limit
   * @returns A Page of Report objects
   */
  async list(params?: ListAdminReportsParams): Promise<Page<Report>> {
    const res = await this.transport.request<ReportListResponse>({
      method: "GET",
      path: "/admin/reports",
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.reports,
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over reports in the moderation queue.
   * Requires moderator or admin role `[M]`.
   *
   * @param params - Query options without cursor
   * @returns AsyncPaginator yielding Report items one by one
   */
  iterate(params?: Omit<ListAdminReportsParams, "cursor">): AsyncPaginator<Report> {
    return createAsyncIterable((cursor) => this.list({ ...params, cursor }));
  }

  /**
   * Resolve or dismiss a report with optional moderator notes.
   * Requires moderator or admin role `[M]`.
   *
   * @param id - The report ID
   * @param input - New status (`resolved` | `dismissed`) and optional notes
   * @returns The updated report
   */
  async update(id: string, input: UpdateReportInput): Promise<Report> {
    const res = await this.transport.request<Report>({
      method: "PATCH",
      path: `/admin/reports/${encodeURIComponent(id)}`,
      body: input,
    });

    return res.data;
  }
}

/**
 * Moderation content actions.
 * Corresponds to `/admin/contents/*` endpoints.
 */
export class AdminContentsResource extends BaseResource {
  /**
   * Moderatively delete a piece of content with an audit reason.
   * Requires moderator or admin role `[M]`.
   *
   * @param id - ID of the content to delete (`c_...`)
   * @param input - Moderation reason for the audit log
   */
  async delete(id: string, input: ModerateDeleteInput): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/admin/contents/${encodeURIComponent(id)}`,
      body: input,
    });
  }
}

/**
 * Account ban management.
 * Corresponds to `/admin/bans/*` endpoints.
 */
export class AdminBansResource extends BaseResource {
  /**
   * Ban an actor account permanently, temporarily, or from a single community.
   * Requires moderator or admin. A community-scoped ban requires `member.ban`
   * for that community.
   *
   * @param input - Username, violation reason, optional RFC 3339 expiresAt
   *   timestamp, and optional community scope
   * @returns The created ban summary
   */
  async create(input: CreateBanInput): Promise<Ban> {
    const res = await this.transport.request<Ban>({
      method: "POST",
      path: "/admin/bans",
      body: input,
    });

    return res.data;
  }

  /**
   * Lift/remove a ban from an actor, platform-wide or for a single community.
   * Requires `member.ban` at the relevant scope.
   * Idempotent: Succeeds with HTTP 204 even if the actor was not banned.
   *
   * @param username - Username of the actor to unban
   * @param community - Community name whose ban is lifted; omitted means the
   *   platform-wide ban
   */
  async remove(username: string, community?: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/admin/bans/${encodeURIComponent(username)}`,
      query: community ? { community } : undefined,
    });
  }
}

/**
 * Scoped permission management.
 * Corresponds to `/admin/permissions` endpoint.
 */
export class AdminPermissionsResource extends BaseResource {
  /**
   * Grant a scoped permission to an actor.
   * Requires `role.grant` at the relevant scope.
   *
   * @remarks
   * Idempotent. `community` (a name) scopes the grant to that community;
   * omitted or `null` means a global grant.
   *
   * @param input - Target username, dotted permission name, and optional community scope
   */
  async grant(input: SetPermissionInput): Promise<void> {
    await this.transport.request<void>({
      method: "PUT",
      path: "/admin/permissions",
      body: input,
    });
  }

  /**
   * Revoke a scoped permission from an actor.
   * Requires `role.grant` at the relevant scope.
   *
   * @remarks
   * Idempotent. `community` (a name) scopes the revoke to that community;
   * omitted or `null` means a global revoke.
   *
   * @param input - Target username, dotted permission name, and optional community scope
   */
  async revoke(input: SetPermissionInput): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: "/admin/permissions",
      body: input,
    });
  }
}

/**
 * Audit log exploration.
 * Corresponds to `/admin/actions` endpoint.
 */
export class AdminActionsResource extends BaseResource {
  /**
   * List immutable audit trail actions with cursor pagination.
   * Requires moderator or admin role `[M]`.
   *
   * @param params - Pagination parameters (cursor, limit)
   * @returns A Page of AdminAction items
   */
  async list(params?: PaginationParams): Promise<Page<AdminAction>> {
    const res = await this.transport.request<AdminActionListResponse>({
      method: "GET",
      path: "/admin/actions",
      query: params as Record<string, unknown>,
    });

    return {
      items: res.data.actions,
      nextCursor: res.data.nextCursor ?? null,
    };
  }

  /**
   * Auto-paginating async iterable over audit trail actions.
   * Requires moderator or admin role `[M]`.
   *
   * @param params - Pagination parameters without cursor
   * @returns AsyncPaginator yielding AdminAction items one by one
   */
  iterate(params?: Omit<PaginationParams, "cursor">): AsyncPaginator<AdminAction> {
    return createAsyncIterable((cursor) => this.list({ ...params, cursor }));
  }
}

/**
 * Administrative and moderation operations.
 * Corresponds to `/admin/*` endpoints in the Actos API.
 */
export class AdminResource extends BaseResource {
  readonly reports: AdminReportsResource;
  readonly contents: AdminContentsResource;
  readonly bans: AdminBansResource;
  readonly permissions: AdminPermissionsResource;
  readonly actions: AdminActionsResource;

  constructor(transport: BaseResource["transport"]) {
    super(transport);
    this.reports = new AdminReportsResource(transport);
    this.contents = new AdminContentsResource(transport);
    this.bans = new AdminBansResource(transport);
    this.permissions = new AdminPermissionsResource(transport);
    this.actions = new AdminActionsResource(transport);
  }
}
