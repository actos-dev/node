import { ActosError } from "../errors.js";
import type { UploadFileInput, UploadOptions } from "../types.js";

/**
 * Resolves a user-supplied file input into a `Blob` plus a filename, ready
 * to be appended as a part of a `multipart/form-data` body.
 *
 * @remarks
 * Accepts:
 * 1. `Blob` or `File` (universal)
 * 2. `Uint8Array` (or `Buffer`)
 * 3. File path string (`string`, Node.js only)
 *
 * Shared by post/comment image attachments and avatar uploads, since all
 * three call sites need to turn the same set of input shapes into a form
 * part.
 *
 * @param file - The file content as a Blob, File, Uint8Array, or local file path string
 * @param options - Optional filename and MIME contentType overrides
 * @param fallbackFilename - Used when no filename can be derived from the input or options
 * @throws {ActosError} if a file path string is passed in a non-Node.js environment, or the input type is unsupported
 */
export async function resolveFilePart(
  file: UploadFileInput,
  options?: UploadOptions,
  fallbackFilename = "upload.bin",
): Promise<{ blob: Blob; filename: string }> {
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
    const filename = options?.filename ?? basename(file);
    const blob = new Blob([buffer], {
      type: options?.contentType ?? "application/octet-stream",
    });
    return { blob, filename };
  }

  if (file instanceof Uint8Array) {
    const filename = options?.filename ?? fallbackFilename;
    const blob = new Blob([file as unknown as BlobPart], {
      type: options?.contentType ?? "application/octet-stream",
    });
    return { blob, filename };
  }

  if (typeof Blob !== "undefined" && file instanceof Blob) {
    const maybeFile = file as { name?: string };
    const filename = options?.filename ?? maybeFile.name ?? fallbackFilename;
    const blob = options?.contentType ? new Blob([file], { type: options.contentType }) : file;
    return { blob, filename };
  }

  throw new ActosError(
    "Unsupported file input. Expected Blob, File, Uint8Array, or file path string.",
  );
}
