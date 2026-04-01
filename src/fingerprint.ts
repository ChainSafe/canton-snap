/**
 * Canton key fingerprint computation.
 *
 * Produces the multihash-encoded SHA-256 fingerprint identical to Go's
 * keys.CantonKeyPair.Fingerprint() — used for Canton party identification.
 */

import { sha256 } from "@noble/hashes/sha256";
import { compressedPubKeyToSPKIDer } from "./spki.js";

/**
 * Compute the Canton key fingerprint from SPKI DER bytes.
 *
 * Algorithm:
 * 1. Prepend 4-byte big-endian purpose value (12 = TopologyTransactionSignature)
 * 2. SHA-256 hash the concatenation
 * 3. Wrap in multihash format: 0x12 (SHA-256) + 0x20 (32 bytes) + hash
 *
 * @param spkiDer - DER-encoded SPKI public key bytes
 * @returns hex-encoded fingerprint string (no 0x prefix)
 */
export function fingerprintFromSPKI(spkiDer: Uint8Array): string {
  // Purpose prefix: 4-byte big-endian uint32 = 12
  const purpose = new Uint8Array([0x00, 0x00, 0x00, 0x0c]);

  // Concatenate purpose + SPKI DER
  const input = new Uint8Array(purpose.length + spkiDer.length);
  input.set(purpose);
  input.set(spkiDer, purpose.length);

  // SHA-256 hash
  const hash = sha256(input);

  // Multihash encoding: 0x12 (SHA-256 algo) + 0x20 (32-byte length) + hash
  const multihash = new Uint8Array(2 + hash.length);
  multihash[0] = 0x12;
  multihash[1] = 0x20;
  multihash.set(hash, 2);

  return bytesToHex(multihash);
}

/**
 * Compute the Canton key fingerprint from a compressed public key.
 *
 * Convenience wrapper that encodes to SPKI DER first.
 *
 * @param compressedPubKey - 33-byte compressed secp256k1 public key
 * @returns hex-encoded fingerprint string (no 0x prefix)
 */
export function fingerprintFromCompressedPubKey(compressedPubKey: Uint8Array): string {
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  return fingerprintFromSPKI(spkiDer);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
