import { RateLimitError } from "../errors.js";
import { type AsyncPaginator, createAsyncIterable } from "../pagination.js";
import type {
  InboxResponse,
  InboxWatchOptions,
  ListInboxParams,
  MarkAllReadResponse,
  NotificationSummary,
} from "../types.js";
import { BaseResource } from "./base.js";

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Inbox and notification management.
 * Corresponds to `/me/inbox*` endpoints in the Actos API.
 * Requires authentication `[A]`.
 */
export class InboxResource extends BaseResource {
  /**
   * Retrieve notifications in the authenticated actor's inbox.
   *
   * @remarks
   * Ordered newest first, keyset-cursor paginated.
   * Note: Notifications whose target has been deleted (soft-deleted posts, comments, or actors)
   * are still returned normally with their original target ID. Fetching the target resource
   * directly will yield a `410 Gone` (`GoneError`). This is expected behavior and not an SDK/API error.
   *
   * @param params - Optional unread filter, cursor, and limit
   * @returns InboxResponse containing notifications array, nextCursor, and total unreadCount
   */
  async list(params?: ListInboxParams): Promise<InboxResponse> {
    const query: Record<string, unknown> = {
      unread: params?.unread,
      cursor: params?.cursor,
      limit: params?.limit,
    };

    const res = await this.transport.request<InboxResponse>({
      method: "GET",
      path: "/me/inbox",
      query,
    });

    return res.data;
  }

  /**
   * Auto-paginating async iterable over notifications in the authenticated actor's inbox.
   *
   * @param params - Inbox query options without cursor
   * @returns AsyncPaginator yielding NotificationSummary items one by one
   */
  iterate(params?: Omit<ListInboxParams, "cursor">): AsyncPaginator<NotificationSummary> {
    return createAsyncIterable(async (cursor) => {
      const res = await this.list({ ...params, cursor });
      return {
        items: res.notifications ?? [],
        nextCursor: res.nextCursor ?? null,
      };
    });
  }

  /**
   * Mark a single notification as read.
   *
   * @remarks
   * Idempotent: Applying to an already-read notification does not push `readAt` forward
   * and returns 204.
   *
   * @param id - The notification ID (`n_...`)
   * @throws {NotFoundError} if the notification does not exist or belongs to another actor (HTTP 404)
   */
  async read(id: string): Promise<void> {
    await this.transport.request<void>({
      method: "PATCH",
      path: `/me/inbox/${encodeURIComponent(id)}/read`,
    });
  }

  /**
   * Bulk-mark notifications as read.
   *
   * @remarks
   * Idempotent: If `cursor` is omitted, all unread notifications are marked read.
   * If `cursor` is given, only those up to that cursor are marked read.
   * Already-read notifications are not counted in `marked`.
   *
   * @param cursor - Optional cursor boundary up to which notifications will be marked read
   * @returns MarkAllReadResponse with number of notifications newly marked as read
   */
  async readAll(cursor?: string): Promise<MarkAllReadResponse> {
    const res = await this.transport.request<MarkAllReadResponse>({
      method: "POST",
      path: "/me/inbox/read",
      query: cursor ? { cursor } : undefined,
    });

    return res.data;
  }

  /**
   * Convenience method to fetch the total unread notification count.
   *
   * @remarks
   * Derives total unread count from `list({ limit: 1 })`. Backend does not
   * provide a separate `/me/inbox/unread-count` endpoint.
   *
   * @returns Total number of unread notifications
   */
  async unreadCount(): Promise<number> {
    const res = await this.list({ limit: 1 });
    return res.unreadCount;
  }

  /**
   * Watch for new notifications via periodic polling.
   *
   * @remarks
   * This is a polling helper, not a real-time WebSocket or push channel.
   * The backend does not support webhooks or push notifications.
   * Respects rate limits (`X-RateLimit-*`) and `Retry-After` headers.
   * Must be cancellable via `signal` (AbortSignal) to prevent resource leaks.
   *
   * @param options - Polling interval in ms (default: 5000) and optional AbortSignal
   * @returns AsyncIterable yielding new NotificationSummary items
   */
  async *watch(options?: InboxWatchOptions): AsyncIterable<NotificationSummary> {
    const interval = options?.interval ?? 5000;
    const seenIds = new Set<string>();

    while (!options?.signal?.aborted) {
      try {
        const res = await this.list({ unread: true });
        const newItems: NotificationSummary[] = [];

        for (const notification of res.notifications ?? []) {
          if (!seenIds.has(notification.id)) {
            newItems.push(notification);
          }
        }

        // Yield in chronological order (oldest to newest within this batch)
        for (let i = newItems.length - 1; i >= 0; i--) {
          const item = newItems[i];
          if (item) {
            seenIds.add(item.id);
            yield item;
          }
        }

        // Keep set size bounded to prevent unbounded memory growth in long-running processes
        if (seenIds.size > 5000) {
          const ids = Array.from(seenIds);
          const toKeep = ids.slice(ids.length - 2500);
          seenIds.clear();
          for (const id of toKeep) {
            seenIds.add(id);
          }
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          const retryAfterSec = err.retryAfter ?? err.rateLimit?.reset ?? 1;
          const waitMs = Math.max(interval, retryAfterSec * 1000);
          const ok = await sleepWithSignal(waitMs, options?.signal);
          if (!ok || options?.signal?.aborted) {
            return;
          }
          continue;
        }
        throw err;
      }

      // Check current rate limit from transport headers
      let waitMs = interval;
      if (this.transport.rateLimit && this.transport.rateLimit.remaining === 0) {
        const resetSec = this.transport.rateLimit.reset;
        if (resetSec > 0) {
          waitMs = Math.max(waitMs, resetSec * 1000);
        }
      }

      const ok = await sleepWithSignal(waitMs, options?.signal);
      if (!ok || options?.signal?.aborted) {
        return;
      }
    }
  }
}
