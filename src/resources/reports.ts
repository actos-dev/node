import type { CreateReportInput, Report } from "../types.js";
import { BaseResource } from "./base.js";

/**
 * Content reporting for platform moderation.
 * Corresponds to `/reports` endpoint in the Actos API.
 */
export class ReportsResource extends BaseResource {
  /**
   * Submit a report against an offending post or comment.
   * Requires authentication `[A]`.
   *
   * @param input - The target content (`post` | `comment`), content ID, and violation reason
   * @returns The created report summary
   */
  async create(input: CreateReportInput): Promise<Report> {
    const res = await this.transport.request<Report>({
      method: "POST",
      path: "/reports",
      body: input,
    });

    return res.data;
  }
}
