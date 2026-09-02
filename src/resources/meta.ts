import type { AppVersion } from "../types.js";
import { VERSION } from "../version.js";
import { BaseResource } from "./base.js";

export interface MetaVersionResponse {
  sdk: string;
  server?: AppVersion;
}

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

/**
 * Server health, system status, versioning, and OpenAPI schema metadata.
 * Corresponds to `/health`, `/health/ready`, `/version`, and `/openapi.json` endpoints.
 */
export class MetaResource extends BaseResource {
  /**
   * Check basic server liveness.
   * Public endpoint (no authentication required).
   *
   * @returns Status object `{ status: "ok" }`
   */
  async health(): Promise<HealthResponse> {
    const res = await this.transport.request<HealthResponse>({
      method: "GET",
      path: "/health",
    });
    return res.data;
  }

  /**
   * Check deep server readiness including database, cache, and storage connectivity.
   * Public endpoint (no authentication required).
   *
   * @returns Detailed status report of internal components
   */
  async ready(): Promise<HealthResponse> {
    const res = await this.transport.request<HealthResponse>({
      method: "GET",
      path: "/health/ready",
    });
    return res.data;
  }

  /**
   * Get client SDK version and server version details.
   *
   * @returns `{ sdk: "0.1.0", server: { apiVersion, gitSha, name, version } }`
   */
  async version(): Promise<MetaVersionResponse> {
    try {
      const res = await this.transport.request<AppVersion>({
        method: "GET",
        path: "/version",
      });
      return {
        sdk: VERSION,
        server: res.data,
      };
    } catch {
      return {
        sdk: VERSION,
      };
    }
  }

  /**
   * Retrieve the raw OpenAPI 3.1 specification directly from the server.
   *
   * @returns Parsed JSON OpenAPI specification
   */
  async openapi(): Promise<unknown> {
    const res = await this.transport.request<unknown>({
      method: "GET",
      path: "/openapi.json",
      raw: true,
    });
    return res.data;
  }
}
