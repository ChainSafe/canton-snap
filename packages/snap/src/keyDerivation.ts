/**
 * Key derivation for Canton signing keys using snap_getEntropy.
 *
 * snap_getEntropy returns snap-scoped entropy, deterministic per
 * (snap, salt) and unlinkable from the user's BIP-44 wallet keys.
 * The entropy is hashed to a uniformly distributed 32-byte value used
 * as a secp256k1 private key. Keys are re-derived on every invocation
 * and never persisted.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes, stripHexPrefix } from "./hex";

export interface DerivedKey {
  privateKey: Uint8Array;
  compressedPubKey: Uint8Array;
}

/**
 * Derive a Canton signing key from the MetaMask seed.
 *
 * The same seed + same keyIndex always produces the same key.
 * Different key indices produce different keys.
 *
 * @param keyIndex - non-negative integer key index (validated by caller).
 * @returns 32-byte private key and 33-byte compressed public key
 */
export async function deriveCantonKey(keyIndex: number = 0): Promise<DerivedKey> {
  const entropy = await snap.request({
    method: "snap_getEntropy",
    params: {
      version: 1,
      salt: `canton-network-key-${keyIndex}`,
    },
  });

  // Hash the entropy to ensure uniform distribution as a secp256k1
  // private key (must be < curve order n).
  const privateKey = sha256(hexToBytes(stripHexPrefix(entropy)));
  const compressedPubKey = secp256k1.getPublicKey(privateKey, true);

  return { privateKey, compressedPubKey };
}
