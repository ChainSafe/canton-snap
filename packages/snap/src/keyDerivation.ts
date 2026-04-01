/**
 * Key derivation for Canton signing keys using snap_getEntropy.
 *
 * Uses snap_getEntropy to derive deterministic, snap-specific entropy
 * from the user's MetaMask seed phrase. The entropy is then used as
 * a secp256k1 private key for Canton signing.
 *
 * snap_getEntropy is the recommended approach for snaps that need
 * non-Ethereum keys, as snap_getBip44Entropy forbids coin type 60.
 *
 * Keys are re-derived on every invocation, never persisted.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

export interface DerivedKey {
  privateKey: Uint8Array;
  compressedPubKey: Uint8Array;
}

/**
 * Derive a Canton signing key from the MetaMask seed.
 *
 * Uses snap_getEntropy with a salt that includes the key index,
 * producing a deterministic 32-byte value used as a secp256k1 private key.
 *
 * The same seed + same salt always produces the same key.
 * Different key indices produce different keys.
 *
 * @param keyIndex - Key index (default 0). Different indices produce different keys.
 * @returns 32-byte private key and 33-byte compressed public key
 */
export async function deriveCantonKey(keyIndex: number = 0): Promise<DerivedKey> {
  // snap_getEntropy returns deterministic entropy derived from the user's
  // seed phrase, unique to this snap and the provided salt.
  const entropy = await snap.request({
    method: "snap_getEntropy",
    params: {
      version: 1,
      salt: `canton-network-key-${keyIndex}`,
    },
  });

  // The entropy is a hex string. Hash it to ensure uniform distribution
  // as a secp256k1 private key (must be < curve order n).
  const entropyBytes = hexToBytes(entropy);
  const privateKey = sha256(entropyBytes);

  const compressedPubKey = secp256k1.getPublicKey(privateKey, true);

  return { privateKey, compressedPubKey };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
