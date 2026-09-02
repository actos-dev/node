/**
 * Helper to check if a value is a plain JavaScript object (excluding Date, Blob, Buffer, etc.)
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (typeof val !== "object" || val === null) {
    return false;
  }

  if (Array.isArray(val) || val instanceof Date || val instanceof RegExp) {
    return false;
  }

  if (typeof Blob !== "undefined" && val instanceof Blob) {
    return false;
  }

  if (typeof FormData !== "undefined" && val instanceof FormData) {
    return false;
  }

  if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
    return false;
  }

  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

/**
 * Converts a camelCase string to snake_case.
 */
export function stringCamelToSnake(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Converts a snake_case string to camelCase.
 */
export function stringSnakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

const EXEMPT_KEYS = new Set(["metadata", "votes"]);

/**
 * Deeply transforms all object keys from camelCase to snake_case.
 *
 * CRITICAL EXCEPTION: Keys in EXEMPT_KEYS (`metadata`, `votes`) preserve their entire
 * content untouched (metadata represents arbitrary user JSONB data, and votes represents
 * dynamic content ID maps).
 */
export function camelToSnake<T = unknown>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((item) => camelToSnake(item)) as T;
  }

  if (!isPlainObject(input)) {
    return input as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    const snakeKey = stringCamelToSnake(key);

    if (EXEMPT_KEYS.has(key) || EXEMPT_KEYS.has(snakeKey)) {
      result[snakeKey] = value;
    } else {
      result[snakeKey] = camelToSnake(value);
    }
  }

  return result as T;
}

/**
 * Deeply transforms all object keys from snake_case to camelCase.
 *
 * CRITICAL EXCEPTION: Keys in EXEMPT_KEYS (`metadata`, `votes`) preserve their entire
 * content untouched.
 */
export function snakeToCamel<T = unknown>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((item) => snakeToCamel(item)) as T;
  }

  if (!isPlainObject(input)) {
    return input as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    const camelKey = stringSnakeToCamel(key);

    if (EXEMPT_KEYS.has(key) || EXEMPT_KEYS.has(camelKey)) {
      result[camelKey] = value;
    } else {
      result[camelKey] = snakeToCamel(value);
    }
  }

  return result as T;
}
