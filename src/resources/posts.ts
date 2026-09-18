import type { CreatePostOptions, GetPostOptions, Post, UpdatePostInput } from "../types.js";
import { camelToSnake, stringCamelToSnake } from "../utils/case.js";
import { resolveFilePart } from "../utils/file.js";
import { BaseResource } from "./base.js";

/**
 * Post creation, retrieval, updates, and deletion.
 * Corresponds to `/posts/*` endpoints in the Actos API.
 */
export class PostsResource extends BaseResource {
  /**
   * Create a new post.
   * Requires authentication `[A]`.
   *
   * @remarks
   * **Automatic Idempotency (§2.9)**:
   * - By default, an `Idempotency-Key` header with a unique UUID v4 is automatically generated and sent.
   * - To provide your own key (e.g. for safe retries across process restarts), pass a string in `options.idempotencyKey`.
   * - To disable idempotency headers completely, pass `idempotencyKey: null`.
   *
   * **Images (`options.files`)**: when omitted, the request stays plain `application/json`,
   * exactly as it does without this option. When one or more files are given, the request is
   * sent instead as `multipart/form-data`, with the JSON body carried in a part named `payload`
   * and each file appended as a part named `files` (up to four).
   *
   * @param input - Post title, body, tags, optional community, optional cross-post source,
   *   optional images, and optional idempotency key
   * @returns The newly created post
   */
  async create(input: CreatePostOptions): Promise<Post> {
    const idempotencyKey =
      input.idempotencyKey === undefined
        ? crypto.randomUUID()
        : (input.idempotencyKey ?? undefined);

    const payload = {
      title: input.title,
      body: input.body,
      tags: input.tags,
      community: input.community,
      crossPostSource: input.crossPostSource,
    };

    let body: unknown = payload;

    if (input.files && input.files.length > 0) {
      const formData = new FormData();
      formData.append("payload", JSON.stringify(camelToSnake(payload)));

      for (const [index, file] of input.files.entries()) {
        const { blob, filename } = await resolveFilePart(file, undefined, `file-${index}.bin`);
        formData.append("files", blob, filename);
      }

      body = formData;
    }

    const res = await this.transport.request<Post>({
      method: "POST",
      path: "/posts",
      body,
      idempotencyKey,
    });

    return res.data;
  }

  /**
   * Retrieve a single post by its ID.
   *
   * @param id - The post ID (`c_...`)
   * @param options - Optional field selection to limit returned properties
   * @returns The post, narrowed to the selected fields if `fields` was specified
   * @throws {NotFoundError} if the post never existed (HTTP 404)
   * @throws {GoneError} if the post was deleted (HTTP 410)
   */
  async get<F extends keyof Post = keyof Post>(
    id: string,
    options?: GetPostOptions<F>,
  ): Promise<Pick<Post, F>> {
    let query: Record<string, unknown> | undefined;

    if (options?.fields && options.fields.length > 0) {
      query = {
        fields: options.fields.map((f) => stringCamelToSnake(String(f))).join(","),
      };
    }

    const res = await this.transport.request<Pick<Post, F>>({
      method: "GET",
      path: `/posts/${encodeURIComponent(id)}`,
      query,
    });

    return res.data;
  }

  /**
   * Update the title or body of an existing post.
   * Requires authentication `[A]`.
   *
   * @param id - ID of the post to update
   * @param input - Updated title and/or body
   * @returns The updated post
   */
  async update(id: string, input: UpdatePostInput): Promise<Post> {
    const res = await this.transport.request<Post>({
      method: "PATCH",
      path: `/posts/${encodeURIComponent(id)}`,
      body: input,
    });

    return res.data;
  }

  /**
   * Soft-delete a post by its ID.
   * Requires authentication `[A]`.
   *
   * @param id - ID of the post to delete
   */
  async delete(id: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/posts/${encodeURIComponent(id)}`,
    });
  }
}
