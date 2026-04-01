/**
 * BIP-44 key derivation for Canton signing keys.
 *
 * Derives secp256k1 keys from the user's MetaMask seed phrase
 * at path m/44'/60'/1'/0/{keyIndex}.
 *
 * - Coin type 60 (Ethereum) — only option via snap_getBip44Entropy
 * - Account 1' — Canton namespace, avoids collision with ETH account at 0'
 * - Keys are re-derived on every invocation, never persisted
 */

import { SLIP10Node } from "@metamask/key-tree";
import { secp256k1 } from "@noble/curves/secp256k1";

export interface DerivedKey {
  privateKey: Uint8Array;
  compressedPubKey: Uint8Array;
}

/**
 * Derive a Canton signing key from the MetaMask seed.
 *
 * @param keyIndex - Address index in the BIP-44 path (default 0)
 * @returns 32-byte private key and 33-byte compressed public key
 */
export async function deriveCantonKey(keyIndex: number = 0): Promise<DerivedKey> {
  // Step 1: Get BIP-44 entropy from MetaMask (node at m/44'/60')
  const bip44Node = await snap.request({
    method: "snap_getBip44Entropy",
    params: { coinType: 60 },
  });

  // Step 2: Reconstitute as SLIP-10 node
  const parentNode = await SLIP10Node.fromJSON(bip44Node);

  // Step 3: Derive m/44'/60'/1'/0/{keyIndex}
  const accountNode = await parentNode.derive(["bip32:1'"]);
  const changeNode = await accountNode.derive(["bip32:0"]);
  const addressNode = await changeNode.derive([`bip32:${keyIndex}`]);

  // Step 4: Extract key material
  const privateKeyHex = addressNode.privateKey;
  if (!privateKeyHex) {
    throw new Error("Failed to derive private key");
  }

  const privateKey = hexToBytes(privateKeyHex);
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
