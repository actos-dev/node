import type {
  ApiKey,
  CreateKeyInput,
  CreateKeyResponse,
  ListKeysResponse,
  RecoverInput,
  RecoverResponse,
  RegenerateRecoveryCodesResponse,
  RegisterInput,
  RegisterResponse,
  Whoami,
} from "../types.js";
import { BaseResource } from "./base.js";

/**
 * Authentication and credential management resource.
 * Corresponds to `/auth/*` endpoints in the Actos API.
 */
export class AuthResource extends BaseResource {
  /**
   * Register a new actor on the Actos platform.
   *
   * @remarks
   * **CRITICAL SECURITY WARNING**:
   * The `apiKey` and `recoveryCodes` in the response are returned **ONLY ONCE** upon registration.
   * They can NEVER be retrieved again from any endpoint.
   * You MUST store them immediately and securely.
   *
   * @param input - Registration details including username and actorType
   * @returns The newly created actor profile, the initial API key, and 10 recovery codes
   */
  async register(input: RegisterInput): Promise<RegisterResponse> {
    const res = await this.transport.request<RegisterResponse>({
      method: "POST",
      path: "/auth/register",
      body: input,
    });
    return res.data;
  }

  /**
   * Validate authentication credentials and retrieve current actor profile, active key, and assigned roles.
   * Requires authentication `[A]`.
   *
   * @returns Profile of the authenticated actor, assigned roles, and the API key summary
   */
  async whoami(): Promise<Whoami> {
    const res = await this.transport.request<Whoami>({
      method: "GET",
      path: "/auth/whoami",
    });
    return res.data;
  }

  /**
   * Generate a new API key for the authenticated actor.
   * Requires authentication `[A]`.
   *
   * @remarks
   * The plaintext `apiKey` is returned **ONLY ONCE** in this response.
   * Subsequent calls to `listKeys()` will only return the metadata (`id`, `created_at`, etc.), not the secret.
   *
   * @param input - Optional configuration such as label
   * @returns The created API key summary and the plaintext API key token
   */
  async createKey(input?: CreateKeyInput): Promise<CreateKeyResponse> {
    const res = await this.transport.request<CreateKeyResponse>({
      method: "POST",
      path: "/auth/keys",
      body: input ?? {},
    });
    return res.data;
  }

  /**
   * List all active API keys for the authenticated actor.
   * Requires authentication `[A]`.
   * Note: Plaintext secrets are never returned; only key metadata is provided.
   *
   * @returns Array of API key summaries
   */
  async listKeys(): Promise<ApiKey[]> {
    const res = await this.transport.request<ListKeysResponse>({
      method: "GET",
      path: "/auth/keys",
    });
    return res.data.keys;
  }

  /**
   * Revoke an API key by its ID.
   * Requires authentication `[A]`.
   *
   * @param keyId - UUID of the key to revoke
   */
  async revokeKey(keyId: string): Promise<void> {
    await this.transport.request<void>({
      method: "DELETE",
      path: `/auth/keys/${encodeURIComponent(keyId)}`,
    });
  }

  /**
   * Recover account access using a valid recovery code and obtain a new API key.
   * Does not require authentication (the recovery code acts as the proof).
   * The used recovery code is permanently consumed.
   *
   * @param input - Username and recovery code
   * @returns A new API key and the count of remaining recovery codes
   */
  async recover(input: RecoverInput): Promise<RecoverResponse> {
    const res = await this.transport.request<RecoverResponse>({
      method: "POST",
      path: "/auth/recover",
      body: input,
    });
    return res.data;
  }

  /**
   * Invalidate all existing recovery codes and generate 10 fresh recovery codes.
   * Requires authentication `[A]`.
   *
   * @remarks
   * The new codes are returned **ONLY ONCE** in this response. Store them securely.
   *
   * @returns 10 fresh recovery codes
   */
  async regenerateRecoveryCodes(): Promise<RegenerateRecoveryCodesResponse> {
    const res = await this.transport.request<RegenerateRecoveryCodesResponse>({
      method: "POST",
      path: "/auth/recovery-codes/regenerate",
    });
    return res.data;
  }
}
