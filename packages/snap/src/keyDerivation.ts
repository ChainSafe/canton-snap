// SPDX-License-Identifier: Apache-2.0

/**
 * Key derivation for Canton signing keys using snap_getEntropy.
 *
 * snap_getEntropy returns snap-scoped entropy, deterministic per
 * (snap, salt) and unlinkable from the user's BIP-44 wallet keys.
 * The entropy is hashed to a 32-byte secp256k1 private key. Keys are
 * re-derived on every invocation and never persisted.
 *
 * Note: snap_getEntropy is scoped to the snap's ID, so a key derived
 * under `local:http://localhost:4040` will differ from one derived
 * under `npm:@chainsafe/canton-snap`. Canton identities are tied to
 * the published snap.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { hexToBytes } from "@noble/hashes/utils";
import { stripHexPrefix } from "./hex";

export interface DerivedKey {
  privateKey: Uint8Array;
  compressedPubKey: Uint8Array;
}

/**
 * Rejection-sample a valid secp256k1 private key from an entropy seed.
 *
 * sha256 output ∈ [0, 2²⁵⁶), curve order n ≈ 2²⁵⁶ − 2¹²⁸, so the failure
 * probability is ≈2⁻¹²⁸. If we ever land in the invalid sliver we
 * re-hash with a counter rather than fail or fall back to biased
 * modular reduction.
 */
function entropyToPrivateKey(entropy: Uint8Array): Uint8Array {
  let candidate = sha256(entropy);
  let counter = 0;
  while (!secp256k1.utils.isValidPrivateKey(candidate)) {
    counter++;
    if (counter > 32) {
      throw new Error("could not derive valid private key from entropy");
    }
    const extended = new Uint8Array(candidate.length + 1);
    extended.set(candidate);
    extended[candidate.length] = counter;
    candidate = sha256(extended);
  }
  return candidate;
}

export async function deriveCantonKey(keyIndex: number = 0): Promise<DerivedKey> {
  const entropy = await snap.request({
    method: "snap_getEntropy",
    params: {
      version: 1,
      salt: `canton-network-key-${keyIndex}`,
    },
  });

  const privateKey = entropyToPrivateKey(hexToBytes(stripHexPrefix(entropy)));
  const compressedPubKey = secp256k1.getPublicKey(privateKey, true);

  return { privateKey, compressedPubKey };
}
