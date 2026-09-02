import { ActosError } from "../errors.js";
import type { Upload, UploadFileInput, UploadOptions } from "../types.js";
import { BaseResource } from "./base.js";

/**
 * File upload and attachment management.
 * Corresponds to `/uploads/*` endpoints in the Actos API.
 */
export class UploadsResource extends BaseResource {
  /**
   * Upload an image or file attachment for posts or comments.
   * Requires authentication `[A]`.
   *
   * @remarks
   * Accepts:
   * 1. `Blob` or `File` (universal)
   * 2. `Uint8Array` (or `Buffer`)
   * 3. File path string (`string`, Node.js only)
   *
   * @example
   * ```ts
   * const upload = await client.uploads.create("./screenshot.png");
   * const post = await client.posts.create({
   *   title: "Attached upload",
   *   body: "Check this out",
   *   attachments: [upload.id],
   * });
   * ```
   *
   * @param file - The file content as a Blob, File, Uint8Array, or local file path string
   * @param options - Optional filename and MIME contentType overrides
   * @returns Metadata of the uploaded file including its public URL and dimensions
   * @throws {ActosError} if a file path string is passed in a non-Node.js environment
   */
  async create(file: UploadFileInput, options?: UploadOptions): Promise<Upload> {
    let blob: Blob;
    let filename: string;

    if (typeof file === "string") {
      const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);

      if (!isNode) {
        throw new ActosError(
          "File path string is only supported in Node.js environments. Use Blob, File, or Uint8Array instead.",
        );
      }

      const { readFile } = await import("node:fs/promises");
      const { basename } = await import("node:path");

      const buffer = await readFile(file);
      filename = options?.filename ?? basename(file);
      blob = new Blob([buffer], {
        type: options?.contentType ?? "application/octet-stream",
      });
    } else if (file instanceof Uint8Array) {
      filename = options?.filename ?? "upload.bin";
      blob = new Blob([file as unknown as BlobPart], {
        type: options?.contentType ?? "application/octet-stream",
      });
    } else if (typeof Blob !== "undefined" && file instanceof Blob) {
      const maybeFile = file as { name?: string };
      filename = options?.filename ?? maybeFile.name ?? "upload.bin";
      if (options?.contentType) {
        blob = new Blob([file], { type: options.contentType });
      } else {
        blob = file;
      }
    } else {
      throw new ActosError(
        "Unsupported file input. Expected Blob, File, Uint8Array, or file path string.",
      );
    }

    const formData = new FormData();
    formData.append("file", blob, filename);

    const res = await this.transport.request<Upload>({
      method: "POST",
      path: "/uploads",
      body: formData,
    });

    return res.data;
  }

  /**
   * Delete an uploaded file by its ID.
   * Requires authentication `[A]`.
   *
   * @param id - ID of the upload to delete (`u_...`)
   */
  async delete(id: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/uploads/${encodeURIComponent(id)}`,
    });
  }
}
