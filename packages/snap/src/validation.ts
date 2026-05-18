/**
 * RPC parameter validation. Runs before any dialog or key derivation so
 * malformed input is rejected without paying the cost of rendering
 * arbitrary user-supplied content.
 *
 * Hex parsing uses @noble/hashes' strict `hexToBytes`, which throws on
 * non-hex characters and on odd-length input.
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { PreparedTransaction, SignHashMetadata } from "./types";
import { PREPARED_TRANSACTION_SCHEMA } from "./constants";
import { stripHexPrefix } from "./hex";

const MAX_KEY_INDEX = 1000;
const MAX_METADATA_FIELD_LENGTH = 200;
const MAX_PREPARED_DETAILS = 20;
const MAX_PREPARED_TRANSACTION_CANONICAL_BYTES = 64 * 1024;

// Canton topology hashes are SHA-256 multihashes: 0x12 (sha2-256 algorithm
// code) + 0x20 (32-byte digest length) + 32 bytes of digest = 34 bytes total.
const MULTIHASH_SHA256_PREFIX = new Uint8Array([0x12, 0x20]);
const TOPOLOGY_HASH_BYTES = 34;

function parseSha256Multihash(value: unknown, field: string): Uint8Array {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const stripped = stripHexPrefix(value);
  if (stripped.length !== TOPOLOGY_HASH_BYTES * 2) {
    throw new Error(
      `${field} must be a SHA-256 multihash (${TOPOLOGY_HASH_BYTES} bytes / ${TOPOLOGY_HASH_BYTES * 2} hex chars)`,
    );
  }
  const bytes = hexToBytes(stripped);
  if (bytes[0] !== MULTIHASH_SHA256_PREFIX[0] || bytes[1] !== MULTIHASH_SHA256_PREFIX[1]) {
    throw new Error(`${field} must use the SHA-256 multihash prefix 0x1220`);
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Canonical JSON used to recompute the prepared-transaction hash.
 *
 * The exact algorithm — middleware implementations MUST match this byte
 * for byte or the snap will refuse every signing request:
 *
 *   - `null`, booleans, finite numbers, and strings serialise via
 *     ECMA-262 `JSON.stringify`. Non-finite numbers (`NaN`, ±Infinity)
 *     are rejected.
 *   - Arrays render as `[elem,elem,...]` with no whitespace.
 *   - Objects sort keys by JavaScript codepoint order (`Array#sort`),
 *     then render as `{"k":v,"k":v,...}`.
 *   - No whitespace, no trailing commas anywhere.
 *
 * This is close to RFC 8785 (JCS) but uses ECMA-262 string escaping for
 * non-ASCII characters (literal UTF-8 in the output, unlike JCS which
 * permits either escaped or literal). The middleware must use a JSON
 * encoder that:
 *   - sorts object keys by codepoint,
 *   - emits no whitespace,
 *   - emits `<`, `>`, `&` as their literal characters (NOT `<`),
 *   - emits the same number formatting (which is moot today because
 *     every prepared-transaction field is a string).
 *
 * Cross-implementation test vectors live in canton-middleware. Mismatch
 * surfaces at signing time as "transactionHash does not match canonical
 * transaction data".
 */
function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("preparedTransaction contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error("preparedTransaction contains an unsupported JSON value");
}

export function validateKeyIndex(value: unknown): number {
  const i = value ?? 0;
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i > MAX_KEY_INDEX) {
    throw new Error(`keyIndex must be an integer between 0 and ${MAX_KEY_INDEX}`);
  }
  return i;
}

function checkMetadataString(field: string, value: unknown, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) throw new Error(`metadata.${field} is required`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`metadata.${field} must be a string`);
  }
  if (value.length > MAX_METADATA_FIELD_LENGTH) {
    throw new Error(`metadata.${field} must be ≤ ${MAX_METADATA_FIELD_LENGTH} characters`);
  }
  return value;
}

export function validateMetadata(value: unknown): SignHashMetadata | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("metadata must be an object");
  }
  const m = value as Record<string, unknown>;
  return {
    operation: checkMetadataString("operation", m.operation, true) as string,
    tokenSymbol: checkMetadataString("tokenSymbol", m.tokenSymbol, true) as string,
    amount: checkMetadataString("amount", m.amount, true) as string,
    recipient: checkMetadataString("recipient", m.recipient, false),
    sender: checkMetadataString("sender", m.sender, false),
  };
}

export function parseTopologyHash(value: unknown): Uint8Array {
  return parseSha256Multihash(value, "topology hash");
}

function buildPreparedHashInput(preparedTransaction: PreparedTransaction): Record<string, unknown> {
  const input: Record<string, unknown> = {
    schema: preparedTransaction.schema,
    operation: preparedTransaction.operation,
    tokenSymbol: preparedTransaction.tokenSymbol,
    amount: preparedTransaction.amount,
  };
  for (const field of [
    "recipient",
    "sender",
    "network",
    "transferId",
    "expiresAt",
    "partyId",
    "details",
  ]) {
    const value = preparedTransaction[field as keyof PreparedTransaction];
    if (value !== undefined) input[field] = value;
  }
  return input;
}

function sha256Multihash(data: Uint8Array): Uint8Array {
  const digest = sha256(data);
  const multihash = new Uint8Array(MULTIHASH_SHA256_PREFIX.length + digest.length);
  multihash.set(MULTIHASH_SHA256_PREFIX);
  multihash.set(digest, MULTIHASH_SHA256_PREFIX.length);
  return multihash;
}

export interface ParsedPreparedTransaction {
  digest: Uint8Array;
  transactionHash: Uint8Array;
  transactionHashHex: string;
  metadata: SignHashMetadata;
  details?: Record<string, string>;
}

export function parsePreparedTransaction(value: unknown): ParsedPreparedTransaction {
  if (!isRecord(value)) throw new Error("preparedTransaction is required");
  const metadata = validateMetadata(value);
  if (!metadata) throw new Error("preparedTransaction metadata is required");

  if (value.schema !== PREPARED_TRANSACTION_SCHEMA) {
    throw new Error(`preparedTransaction.schema must be ${PREPARED_TRANSACTION_SCHEMA}`);
  }
  const details = validatePreparedDetails(value.details);

  const preparedTransaction: PreparedTransaction = {
    schema: PREPARED_TRANSACTION_SCHEMA,
    transactionHash: checkMetadataString("transactionHash", value.transactionHash, true) as string,
    operation: metadata.operation,
    tokenSymbol: metadata.tokenSymbol,
    amount: metadata.amount,
    recipient: metadata.recipient,
    sender: metadata.sender,
    details,
    network: checkMetadataString("network", value.network, false),
    transferId: checkMetadataString("transferId", value.transferId, false),
    expiresAt: checkMetadataString("expiresAt", value.expiresAt, false),
    partyId: checkMetadataString("partyId", value.partyId, false),
  };

  const transactionHash = parseSha256Multihash(
    preparedTransaction.transactionHash,
    "preparedTransaction.transactionHash",
  );
  const canonical = canonicalJson(buildPreparedHashInput(preparedTransaction));
  const canonicalBytes = new TextEncoder().encode(canonical);
  if (canonicalBytes.length > MAX_PREPARED_TRANSACTION_CANONICAL_BYTES) {
    throw new Error(
      `preparedTransaction canonical envelope must be ≤ ${MAX_PREPARED_TRANSACTION_CANONICAL_BYTES} bytes`,
    );
  }

  const expectedTransactionHash = sha256Multihash(canonicalBytes);
  if (bytesToHex(expectedTransactionHash) !== bytesToHex(transactionHash)) {
    throw new Error(
      "preparedTransaction.transactionHash does not match canonical transaction data",
    );
  }

  return {
    digest: sha256(transactionHash),
    transactionHash,
    transactionHashHex: bytesToHex(transactionHash),
    metadata,
    details: buildDialogDetails(preparedTransaction),
  };
}

function validatePreparedDetails(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("preparedTransaction.details must be an object");
  const entries = Object.entries(value);
  if (entries.length > MAX_PREPARED_DETAILS) {
    throw new Error(`preparedTransaction.details must contain ≤ ${MAX_PREPARED_DETAILS} fields`);
  }
  const result: Record<string, string> = {};
  for (const [key, detail] of entries) {
    if (key.length === 0 || key.length > MAX_METADATA_FIELD_LENGTH) {
      throw new Error("preparedTransaction.details keys must be non-empty bounded strings");
    }
    if (typeof detail !== "string") {
      throw new Error(`preparedTransaction.details.${key} must be a string`);
    }
    if (detail.length > MAX_METADATA_FIELD_LENGTH) {
      throw new Error(
        `preparedTransaction.details.${key} must be ≤ ${MAX_METADATA_FIELD_LENGTH} characters`,
      );
    }
    result[key] = detail;
  }
  return result;
}

function buildDialogDetails(
  preparedTransaction: PreparedTransaction,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  const contextFields: Array<[keyof PreparedTransaction, string]> = [
    ["network", "Network"],
    ["transferId", "Transfer ID"],
    ["expiresAt", "Expires at"],
    ["partyId", "Party ID"],
  ];
  for (const [field, label] of contextFields) {
    const value = preparedTransaction[field];
    if (typeof value === "string") result[label] = value;
  }
  for (const [key, value] of Object.entries(preparedTransaction.details ?? {})) {
    result[key in result ? `Detail ${key}` : key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
