/**
 * RPC parameter validation. Runs before any dialog or key derivation so
 * malformed input is rejected without paying the cost of rendering
 * arbitrary user-supplied content.
 *
 * Hex parsing uses @noble/hashes' strict `hexToBytes`, which throws on
 * non-hex characters and on odd-length input.
 */

import { hexToBytes } from "@noble/hashes/utils";
import type { SignHashMetadata } from "./types";

const MAX_KEY_INDEX = 1000;
const SIGN_HASH_BYTES = 32;
const TOPOLOGY_HASH_MIN_BYTES = 1;
const TOPOLOGY_HASH_MAX_BYTES = 128;
const MAX_METADATA_FIELD_LENGTH = 200;

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
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
  if (typeof value !== "string") throw new Error("hash is required");
  const stripped = stripHexPrefix(value);
  if (stripped.length === 0 || stripped.length % 2 !== 0) {
    throw new Error("hash must be a non-empty even-length hex string");
  }
  const byteLength = stripped.length / 2;
  if (byteLength < TOPOLOGY_HASH_MIN_BYTES || byteLength > TOPOLOGY_HASH_MAX_BYTES) {
    throw new Error(
      `topology hash must be ${TOPOLOGY_HASH_MIN_BYTES}–${TOPOLOGY_HASH_MAX_BYTES} bytes`,
    );
  }
  return hexToBytes(stripped);
}
