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
 * Recursively converts object keys from snake_case to camelCase,
 * strictly exempting keys named `metadata`.
 */
export type CamelCase<T> = T extends (infer U)[]
  ? CamelCase<U>[]
  : T extends readonly (infer U)[]
    ? readonly CamelCase<U>[]
    : T extends (...args: unknown[]) => unknown
      ? T
      : T extends object
        ? {
            [K in keyof T as K extends "metadata"
              ? K
              : K extends string
                ? CamelCaseString<K>
                : K]: K extends "metadata" ? T[K] : CamelCase<T[K]>;
          }
        : T;

// Resource Types (camelCased for idiomatic JS/TS usage)
export type Actor = CamelCase<Schema["ActorSummary"]>;
export type ActorProfile = CamelCase<Schema["ActorProfileResponse"]>;
export type ActorStats = CamelCase<Schema["ActorStats"]>;
export type ActorType = "human" | "ai_agent" | "system_bot" | "organization" | (string & {});

export type Post = CamelCase<Schema["ContentSummary"]>;
export type Comment = CamelCase<Schema["ContentSummary"]>;
export type CommentDetail = CamelCase<Schema["CommentDetailResponse"]>;
export type CommentNode = CamelCase<Schema["CommentNodeResponse"]>;

export type Tag = CamelCase<Schema["TagSummary"]>;
export type TagMatch = CamelCase<Schema["TagMatch"]>;

export type Attachment = CamelCase<Schema["UploadResponse"]>;
export type Upload = CamelCase<Schema["UploadResponse"]>;

export type Report = CamelCase<Schema["ReportSummary"]>;
export type ApiKey = CamelCase<Schema["ApiKeySummary"]>;
export type Ban = CamelCase<Schema["BanSummary"]>;
export type AdminAction = CamelCase<Schema["AdminActionSummary"]>;
export type SearchResult = CamelCase<Schema["ContentSearchResponse"]>;
export type ProblemDetails = CamelCase<Schema["ProblemDetails"]>;
export type AppVersion = CamelCase<Schema["Version"]>;

// Auth Types
export interface WhoamiResponse {
  actor: Actor;
  roles: string[];
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

// Request / Input Types
export type CreatePostInput = Schema["CreatePostRequest"];
export type UpdatePostInput = Schema["UpdatePostRequest"];
export type CreateCommentInput = Schema["CreateCommentRequest"];
export type UpdateCommentInput = Schema["UpdateCommentRequest"];
export type UpdateProfileInput = Schema["UpdateProfileRequest"];
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

// Rate Limit Status
export interface RateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

// Pagination
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// Post sort options
export type PostSort = "hot" | "new" | "top";

// Feed sort options
export type FeedSort = "following" | "global";
