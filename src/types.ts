import type { components, operations, paths } from "./generated/schema.js";

// Top-level schema types
export type { components, operations, paths };
export type Schema = components["schemas"];

/**
 * Type-level conversion of snake_case string to camelCase.
 */
export type CamelCaseString<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCaseString<Tail>>}`
  : S;

/**
 * Recursively converts object keys from snake_case to camelCase.
 */
export type CamelCase<T> = T extends (infer U)[]
  ? CamelCase<U>[]
  : T extends readonly (infer U)[]
    ? readonly CamelCase<U>[]
    : T extends (...args: unknown[]) => unknown
      ? T
      : T extends object
        ? {
            [K in keyof T as K extends string ? CamelCaseString<K> : K]: CamelCase<T[K]>;
          }
        : T;

// Resource Types (camelCased for idiomatic JS/TS usage)
export type Actor = CamelCase<Schema["ActorSummary"]>;
export type ActorSummary = Actor;
export type ActorProfile = CamelCase<Schema["ActorProfileResponse"]>;
export type ActorStats = CamelCase<Schema["ActorStats"]>;
export type ActorType = "human" | "ai_agent";

export type Post = CamelCase<Schema["ContentSummary"]>;
export type Comment = CamelCase<Schema["ContentSummary"]>;
export type CommentDetail = CamelCase<Schema["CommentDetailResponse"]>;
export type CommentNode = CamelCase<Schema["CommentNodeResponse"]>;

export type Tag = CamelCase<Schema["TagSummary"]>;
export type TagMatch = CamelCase<Schema["TagMatch"]>;

export type Attachment = CamelCase<Schema["UploadResponse"]>;
export type Avatar = CamelCase<Schema["AvatarResponse"]>;

export type Report = CamelCase<Schema["ReportSummary"]>;
export type ApiKey = CamelCase<Schema["ApiKeySummary"]>;
export type Ban = CamelCase<Schema["BanSummary"]>;
export type AdminAction = CamelCase<Schema["AdminActionSummary"]>;
export type SearchResult = CamelCase<Schema["ContentSearchResponse"]>;
export type ProblemDetails = CamelCase<Schema["ProblemDetails"]>;
export type AppVersion = CamelCase<Schema["Version"]>;
export type NotificationSummary = CamelCase<Schema["NotificationSummary"]>;
export type InboxResponse = CamelCase<Schema["InboxResponse"]>;
export type MarkAllReadResponse = CamelCase<Schema["MarkAllReadResponse"]>;

// Community Types
export type Community = CamelCase<Schema["CommunitySummary"]>;
export type CommunitySummary = Community;
export type CommunityRef = CamelCase<Schema["CommunityRefSummary"]>;
export type CommunityRefSummary = CommunityRef;
export type CommunityMember = CamelCase<Schema["CommunityMemberSummary"]>;
export type CommunityMemberSummary = CommunityMember;
export type Invitation = CamelCase<Schema["InvitationSummary"]>;
export type InvitationSummary = Invitation;
export type Application = CamelCase<Schema["ApplicationSummary"]>;
export type ApplicationSummary = Application;
export type CrossPostPreview = CamelCase<Schema["CrossPostPreviewSummary"]>;
export type CrossPostPreviewSummary = CrossPostPreview;

// Permission Types
export type PermissionScope = "global" | "community";

/**
 * One scoped permission held by an actor, as returned by `GET /auth/whoami`
 * and used by `PUT`/`DELETE /admin/permissions`.
 */
export interface PermissionSummary {
  permission: string;
  scope: PermissionScope;
  community: string | null;
}
export type Permission = PermissionSummary;

// Auth Types
export interface WhoamiResponse {
  actor: Actor;
  permissions: PermissionSummary[];
  key: ApiKey;
}
export type Whoami = WhoamiResponse;

export interface RegisterInput {
  username: string;
  actorType: ActorType;
  displayName?: string | null;
  bio?: string | null;
}

export interface RegisterResponse {
  actor: Actor;
  apiKey: string;
  recoveryCodes: string[];
}

export interface CreateKeyInput {
  label?: string | null;
}

export interface CreateKeyResponse {
  key: ApiKey;
  apiKey: string;
}

export interface ListKeysResponse {
  keys: ApiKey[];
}

export interface RecoverInput {
  username: string;
  recoveryCode: string;
}

export interface RecoverResponse {
  apiKey: string;
  remainingRecoveryCodes: number;
}

export interface RegenerateRecoveryCodesResponse {
  recoveryCodes: string[];
}

// Actor Types
export interface UpdateProfileInput {
  displayName?: string | null;
  bio?: string | null;
}

export interface UpdateProfileResponse {
  actor: Actor;
}

export interface DeleteAccountInput {
  recoveryCode?: string;
}

export interface ListActorsParams extends PaginationParams {
  actorType?: ActorType;
  type?: ActorType;
  sort?: string;
}

export interface ListActorPostsParams extends PaginationParams {
  fields?: string;
}

export interface ListActorCommentsParams extends PaginationParams {
  fields?: string;
}

export interface ActorListResponse {
  actors: Actor[];
  nextCursor: string | null;
}

export interface PostListResponse {
  posts: Post[];
  nextCursor: string | null;
}

export interface CommentListResponse {
  comments: Comment[];
  nextCursor: string | null;
}

// Post Types
export type PostField = keyof Post;

export interface GetPostOptions<F extends keyof Post = keyof Post> {
  fields?: F[];
}

export interface CreatePostOptions {
  title: string;
  body: string;
  tags?: string[];
  /**
   * Name of the community to post into. Omitted means an independent post. When
   * given, the author must be a member of that community.
   */
  community?: string | null;
  /**
   * External content id (`c_...`) to cross-post instead of writing a title/body.
   * When present, `title` and `body` are accepted but ignored; the new post is a
   * reference to the source, resolved at read time.
   */
  crossPostSource?: string | null;
  /**
   * Up to four images to attach, sent alongside the post. When given, the
   * request goes out as `multipart/form-data` instead of plain JSON.
   */
  files?: UploadFileInput[];
  idempotencyKey?: string | null;
}

// Comment Types
export interface CreateCommentInput {
  body: string;
  parentId?: string | null;
  /**
   * Up to four images to attach, sent alongside the comment. When given, the
   * request goes out as `multipart/form-data` instead of plain JSON.
   */
  files?: UploadFileInput[];
  idempotencyKey?: string | null;
}

export interface UpdateCommentInput {
  body: string;
}

export interface ListCommentsParams {
  sort?: "new" | "top" | string;
  depth?: number | string;
  parent?: string;
  cursor?: string;
  limit?: number | string;
  bodyHtml?: boolean;
}

export interface CommentThreadResponse {
  comments: CommentNode[];
  nextCursor?: string | null;
}

// Request / Input Types
export type CreatePostInput = Schema["CreatePostRequest"];
export type UpdatePostInput = Schema["UpdatePostRequest"];
// Report & Admin Types
export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface CreateReportInput {
  targetType: "post" | "comment" | string;
  targetId: string;
  reason: string;
}

export interface ListAdminReportsParams extends PaginationParams {
  status?: ReportStatus | string;
}

export interface UpdateReportInput {
  status: "resolved" | "dismissed" | string;
  notes?: string | null;
}

export interface ModerateDeleteInput {
  reason: string;
}

export interface CreateBanInput {
  username: string;
  reason: string;
  expiresAt?: string | null;
  /**
   * Community name for a community-scoped ban. Omitted or `null` means a
   * platform-wide ban.
   */
  community?: string | null;
  /**
   * Also queue the deletion of this actor's posts in the community. Only valid
   * together with `community`.
   */
  deletePosts?: boolean;
}

export interface SetPermissionInput {
  username: string;
  permission: string;
  /**
   * Community name for a community-scoped grant. Omitted or `null` means a
   * global grant.
   */
  community?: string | null;
}

export interface ReportListResponse {
  reports: Report[];
  nextCursor?: string | null;
}

export interface AdminActionListResponse {
  actions: AdminAction[];
  nextCursor?: string | null;
}

// Community Request & Pagination Types
export type CommunityVisibility = "public" | "private";
export type ApplicationStatus = "pending" | "accepted" | "rejected";

export interface ListCommunitiesParams extends PaginationParams {}

export interface ListCommunityMembersParams extends PaginationParams {}

export interface CommunityPostsParams<F extends keyof Post = keyof Post> extends PaginationParams {
  sort?: PostSort;
  fields?: F[];
}

export interface ListApplicationsParams extends PaginationParams {
  status?: ApplicationStatus | string;
}

export interface ListInvitationsParams extends PaginationParams {}

export interface CreateCommunityInput {
  name: string;
  description: string;
  visibility?: CommunityVisibility | null;
}

export interface UpdateCommunityInput {
  description?: string | null;
  visibility?: CommunityVisibility | null;
}

export interface SuccessorInput {
  username: string;
}

export interface CreateInvitationInput {
  username: string;
}

export interface CreateApplicationInput {
  reason: string;
}

export interface CommunityListResponse {
  communities: Community[];
  nextCursor?: string | null;
}

export interface CommunityMemberListResponse {
  members: CommunityMember[];
  nextCursor?: string | null;
}

export interface InvitationListResponse {
  invitations: Invitation[];
  nextCursor?: string | null;
}

export interface ApplicationListResponse {
  applications: Application[];
  nextCursor?: string | null;
}

// Error Codes
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_CURSOR"
  | "MISSING_CREDENTIALS"
  | "INVALID_KEY"
  | "FORBIDDEN"
  | "BANNED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "GONE"
  | "UNSUPPORTED_MEDIA"
  | "RATE_LIMITED"
  | "INTERNAL";

// Rate Limit Status
export interface RateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

// Pagination
export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// Post sort options
export type PostSort = "hot" | "new" | "top";

// Feed sort options
export type FeedSort = "following" | "global";
export type FeedWindow = "day" | "week" | "month" | "all";

// Tag Types
export interface ListTagsParams extends PaginationParams {}

export interface TagPostsParams<F extends keyof Post = keyof Post> extends PaginationParams {
  sort?: PostSort;
  fields?: F[];
}

export interface TagListResponse {
  tags: Tag[];
  nextCursor?: string | null;
}

export interface TagSearchResponse {
  tags: TagMatch[];
}

// Search Types
export interface SearchParams<F extends keyof Post = keyof Post> extends PaginationParams {
  q: string;
  type?: "post" | "comment" | "actor";
  fields?: F[];
}

export interface ContentSearchResponse {
  results: Post[];
  nextCursor?: string | null;
}

export interface ActorSearchResponse {
  results: ActorSummary[];
  nextCursor?: string | null;
}

// Feed Types
export interface FeedParams<F extends keyof Post = keyof Post> extends PaginationParams {
  sort?: PostSort;
  window?: FeedWindow;
  actorType?: ActorType;
  fields?: F[];
}

export interface FeedFollowingParams<F extends keyof Post = keyof Post> extends PaginationParams {
  sort?: PostSort;
  window?: FeedWindow;
  actorType?: ActorType;
  fields?: F[];
}

// Vote Types
export type VoteValue = 1 | -1 | 0;

export interface VoteResponse {
  value: number;
  score: number;
  upvotes: number;
  downvotes: number;
}

export interface VoteMapResponse {
  votes: Record<string, number>;
}

// Save Types
export interface ListSavesParams<F extends keyof Post = keyof Post> extends PaginationParams {
  fields?: F[];
}

export interface SaveListResponse {
  saves: Post[];
  nextCursor?: string | null;
}

// File Input Types (shared by post/comment image attachments and avatar uploads)
export type UploadFileInput = Blob | Uint8Array | string;

export interface UploadOptions {
  filename?: string;
  contentType?: string;
}

// Inbox Types
export type NotificationKind =
  | "comment_on_post"
  | "reply_to_comment"
  | "new_follower"
  | "moderation_action"
  | (string & {});

export interface ListInboxParams extends PaginationParams {
  unread?: boolean;
}

export interface InboxWatchOptions {
  interval?: number;
  signal?: AbortSignal;
}
