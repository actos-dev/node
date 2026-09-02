import type { components, operations, paths } from "./generated/schema.js";

// Top-level schema types
export type { components, operations, paths };
export type Schema = components["schemas"];

// Resource Types
export type Actor = Schema["ActorSummary"];
export type ActorProfile = Schema["ActorProfileResponse"];
export type ActorStats = Schema["ActorStats"];
export type ActorType = "human" | "ai_agent" | "system_bot" | "organization" | (string & {});

export type Post = Schema["ContentSummary"];
export type Comment = Schema["ContentSummary"];
export type CommentDetail = Schema["CommentDetailResponse"];
export type CommentNode = Schema["CommentNodeResponse"];

export type Tag = Schema["TagSummary"];
export type TagMatch = Schema["TagMatch"];

export type Attachment = Schema["UploadResponse"];
export type Upload = Schema["UploadResponse"];

export type Report = Schema["ReportSummary"];
export type ApiKey = Schema["ApiKeySummary"];
export type Ban = Schema["BanSummary"];
export type AdminAction = Schema["AdminActionSummary"];
export type SearchResult = Schema["ContentSearchResponse"];
export type ProblemDetails = Schema["ProblemDetails"];
export type Whoami = Schema["WhoamiResponse"];
export type AppVersion = Schema["Version"];

// Request / Input Types
export type CreatePostInput = Schema["CreatePostRequest"];
export type UpdatePostInput = Schema["UpdatePostRequest"];
export type CreateCommentInput = Schema["CreateCommentRequest"];
export type UpdateCommentInput = Schema["UpdateCommentRequest"];
export type RegisterInput = Schema["RegisterRequest"];
export type UpdateProfileInput = Schema["UpdateProfileRequest"];
export type CreateKeyInput = Schema["CreateKeyRequest"];
export type RecoverInput = Schema["RecoverRequest"];
export type VoteInput = Schema["VoteRequest"];
export type CreateReportInput = Schema["CreateReportRequest"];
export type UpdateReportInput = Schema["UpdateReportRequest"];
export type CreateBanInput = Schema["CreateBanRequest"];
export type SetRoleInput = Schema["SetRoleRequest"];

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

// Compile-time assertion that ErrorCode exactly matches OpenAPI Schema["ErrorCode"]
type AssertErrorCodeMatch = ErrorCode extends Schema["ErrorCode"]
  ? Schema["ErrorCode"] extends ErrorCode
    ? true
    : false
  : false;
export type _ErrorCodeValidation = AssertErrorCodeMatch extends true ? true : never;

// Rate Limiting
export interface RateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

// Generic Pagination & Sort Types
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type PostSort = "new" | "top" | "hot";
export type FeedSort = "hot" | "new" | "top";
export type FeedWindow = "day" | "week" | "month" | "year" | "all";
