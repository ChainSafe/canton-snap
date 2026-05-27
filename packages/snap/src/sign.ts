// SPDX-License-Identifier: Apache-2.0

/**
 * DER-encoded ECDSA signing for Canton Interactive Submission.
 *
 * Produces ASN.1 DER signatures identical to Go's
 * keys.CantonKeyPair.SignHashDER() — required for Canton transaction execution.
 *
 * IMPORTANT: The snap receives a pre-hashed 32-byte digest. It signs the
 * digest directly and must NOT re-hash.
 */

import { secp256k1 } from "@noble/curves/secp256k1";

/**
 * Sign a 32-byte hash and return an ASN.1 DER-encoded ECDSA signature.
 *
 * Uses RFC 6979 deterministic k and low-S normalization (BIP-62). DER
 * encoding is delegated to @noble/curves' Signature.toDERRawBytes(),
 * which is canonical and cross-validated against the Go test vectors.
 */
export function signHashDER(privateKey: Uint8Array, hash: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error(`private key must be 32 bytes, got ${privateKey.length}`);
  }
  if (hash.length !== 32) {
    throw new Error(`hash must be 32 bytes, got ${hash.length}`);
  }

  return secp256k1.sign(hash, privateKey, { lowS: true }).toDERRawBytes();
}
