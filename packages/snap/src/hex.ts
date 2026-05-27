// SPDX-License-Identifier: Apache-2.0

/**
 * Hex utilities shared by every input-parsing path in the snap.
 *
 * The byte-level hex codec is delegated to @noble/hashes' strict
 * `hexToBytes` / `bytesToHex`. This file only holds the small
 * `stripHexPrefix` helper that was previously duplicated across
 * validation.ts and keyDerivation.ts.
 */

export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}
