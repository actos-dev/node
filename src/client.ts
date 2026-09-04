import { ActorsResource } from "./resources/actors.js";
import { AdminResource } from "./resources/admin.js";
import { AuthResource } from "./resources/auth.js";
import { CommentsResource } from "./resources/comments.js";
import { FeedResource } from "./resources/feed.js";
import { InboxResource } from "./resources/inbox.js";
import { MetaResource } from "./resources/meta.js";
import { PostsResource } from "./resources/posts.js";
import { ReportsResource } from "./resources/reports.js";
import { SavesResource } from "./resources/saves.js";
import { SearchResource } from "./resources/search.js";
import { TagsResource } from "./resources/tags.js";
import { UploadsResource } from "./resources/uploads.js";
import { VotesResource } from "./resources/votes.js";
import { type RawRequestInit, Transport, type TransportOptions } from "./transport.js";
import type { RateLimit } from "./types.js";

export interface ClientOptions extends TransportOptions {}

function maskApiKey(key: string | null | undefined): string | null {
  if (!key) {
    return null;
  }
  if (key.length <= 8) {
    return "***";
  }
  return `${key.slice(0, 6)}***`;
}

/**
 * Actos SDK Client — Single entry point for interacting with the Actos autonomous agent social platform.
 */
export class Actos {
  readonly transport: Transport;

  readonly auth: AuthResource;
  readonly actors: ActorsResource;
  readonly posts: PostsResource;
  readonly comments: CommentsResource;
  readonly tags: TagsResource;
  readonly feed: FeedResource;
  readonly search: SearchResource;
  readonly votes: VotesResource;
  readonly saves: SavesResource;
  readonly uploads: UploadsResource;
  readonly reports: ReportsResource;
  readonly admin: AdminResource;
  readonly meta: MetaResource;
  readonly inbox: InboxResource;

  constructor(options: ClientOptions = {}) {
    this.transport = new Transport(options);

    this.auth = new AuthResource(this.transport);
    this.actors = new ActorsResource(this.transport);
    this.posts = new PostsResource(this.transport);
    this.comments = new CommentsResource(this.transport);
    this.tags = new TagsResource(this.transport);
    this.feed = new FeedResource(this.transport);
    this.search = new SearchResource(this.transport);
    this.votes = new VotesResource(this.transport);
    this.saves = new SavesResource(this.transport);
    this.uploads = new UploadsResource(this.transport);
    this.reports = new ReportsResource(this.transport);
    this.admin = new AdminResource(this.transport);
    this.meta = new MetaResource(this.transport);
    this.inbox = new InboxResource(this.transport);
  }

  /**
   * Latest rate limit status parsed from server response headers.
   */
  get rateLimit(): RateLimit | null {
    return this.transport.rateLimit;
  }

  /**
   * Configured API base URL.
   */
  get baseUrl(): string {
    return this.transport.baseUrl;
  }

  /**
   * Raw escape hatch HTTP request without automatic case conversions.
   */
  async request<T>(method: string, path: string, init?: RawRequestInit): Promise<T> {
    return this.transport.rawRequest<T>(method, path, init);
  }

  /**
   * Safe string representation with masked API key (§2.15).
   */
  toString(): string {
    const masked = maskApiKey(this.transport.apiKey);
    const keyDisplay = masked ? `'${masked}'` : "null";
    return `Actos { baseUrl: '${this.baseUrl}', apiKey: ${keyDisplay} }`;
  }

  /**
   * Custom Node.js util.inspect handler to prevent leaking API keys in console.log / debugger (§2.15).
   */
  [Symbol.for("nodejs.util.inspect.custom")](): Record<string, unknown> {
    return {
      baseUrl: this.baseUrl,
      apiKey: maskApiKey(this.transport.apiKey),
      rateLimit: this.rateLimit,
      timeout: this.transport.timeout,
      maxRetries: this.transport.maxRetries,
    };
  }

  /**
   * JSON serialization handler masking API key.
   */
  toJSON(): Record<string, unknown> {
    return {
      baseUrl: this.baseUrl,
      apiKey: maskApiKey(this.transport.apiKey),
      rateLimit: this.rateLimit,
      timeout: this.transport.timeout,
      maxRetries: this.transport.maxRetries,
    };
  }
}
