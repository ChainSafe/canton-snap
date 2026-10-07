// SPDX-License-Identifier: Apache-2.0

/**
 * DER-encoded ECDSA signing for Canton Interactive Submission.
 *
 * Produces ASN.1 DER signatures identical to Go's
 * keys.CantonKeyPair.SignHashDER() — required for Canton transaction execution.
 *
 * IMPORTANT: this function signs the 32 bytes it is given, with no hashing of
 * its own. The caller supplies the digest.
 *
 * That is not the same as saying the snap does not hash. Canton's
 * EC_DSA_SHA_256 signs sha256 of the transaction hash, so the RPC handlers in
 * index.ts sha256 the hash they receive and pass the result here, matching
 * CantonKeyPair.SignDER() in the Go SDK. An earlier version of this comment
 * claimed the snap must not re-hash, which contradicted the handlers and was
 * wrong. test/dialogs.test.ts pins the real behaviour by verifying a produced
 * signature against both candidate digests.
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
