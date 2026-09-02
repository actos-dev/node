import type { Transport } from "../transport.js";

/**
 * Base class for all API resource namespaces.
 */
export abstract class BaseResource {
  protected readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }
}
