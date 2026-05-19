/**
 * RPC parameter validation. Runs before any dialog or key derivation so
 * malformed input is rejected without paying the cost of rendering
 * arbitrary user-supplied content.
 *
 * Hex parsing uses @noble/hashes' strict `hexToBytes`, which throws on
 * non-hex characters and on odd-length input.
 *
 * NOTE: The prepared-transaction envelope path (snap-recomputed canonical
 * SHA-256 multihash) is temporarily removed. canton-middleware must ship
 * envelope emission first, then the envelope check is reintroduced here
 * and in canton_signHash. See ChainSafe/canton-snap tracking issue.
 */

import { hexToBytes } from "@noble/hashes/utils";
import type { SignHashMetadata } from "./types";
import { stripHexPrefix } from "./hex";

const MAX_KEY_INDEX = 1000;
const SIGN_HASH_BYTES = 32;
const MAX_METADATA_FIELD_LENGTH = 200;

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

export function validateKeyIndex(value: unknown): number {
  const i = value ?? 0;
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i > MAX_KEY_INDEX) {
    throw new Error(`keyIndex must be an integer between 0 and ${MAX_KEY_INDEX}`);
  }
  return i;
}

export function parseSignHash(value: unknown): Uint8Array {
  if (typeof value !== "string") throw new Error("hash is required");
  const stripped = stripHexPrefix(value);
  if (stripped.length !== SIGN_HASH_BYTES * 2) {
    throw new Error(`hash must be ${SIGN_HASH_BYTES} bytes (${SIGN_HASH_BYTES * 2} hex chars)`);
  }
  return hexToBytes(stripped);
}

export function parseTopologyHash(value: unknown): Uint8Array {
  return parseSha256Multihash(value, "topology hash");
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
