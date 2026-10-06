// SPDX-License-Identifier: Apache-2.0

/**
 * External (non-custodial) registration for the end-to-end test.
 *
 * Mirrors pkg/user/service/http.go:
 *
 *   1. POST /register/prepare-topology { canton_public_key, signature, message }
 *        -> { topology_hash, public_key_fingerprint, registration_token }
 *   2. the Snap signs topology_hash via canton_signTopology
 *   3. POST /register { key_mode: "external", canton_public_key,
 *                       registration_token, topology_signature, signature, message }
 *        -> { party, fingerprint, mapping_cid, evm_address, key_mode }
 *
 * Two different fingerprints are in play and conflating them hides bugs:
 *   - public_key_fingerprint, from step 1, is the server's own derivation from
 *     the Snap's public key. Comparing it to the Snap's own value proves both
 *     sides agree on the Canton identity.
 *   - RegisterResponse.fingerprint is keccak256(evmAddress), a mapping id. It is
 *     not a Canton key fingerprint.
 *
 * On the EIP-191 signature: the middleware needs proof of control over an EVM
 * address, which MetaMask supplies in production via personal_sign. The Snap
 * does not expose that and it is not what this test proves. The Canton
 * signatures, the ones that reach the ledger, come from the Snap.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { post } from "./middleware.js";
import { approve, FINGERPRINT } from "./snaps.js";

const hex = (b) => Buffer.from(b).toString("hex");

/** Derive an EVM address from a secp256k1 private key. */
export function evmAddressFrom(privKey) {
  const pub = secp256k1.getPublicKey(privKey, false).slice(1); // drop the 0x04 tag
  return `0x${hex(keccak_256(pub).slice(-20))}`;
}

/**
 * Produce an EIP-191 personal_sign signature.
 *
 * Byte length, not UTF-16 length: pkg/auth/evm.go uses Go's len() on bytes.
 */
export function eip191Sign(privKey, message) {
  const byteLen = Buffer.byteLength(message, "utf8");
  const prefixed = Buffer.concat([
    Buffer.from(`\x19Ethereum Signed Message:\n${byteLen}`, "utf8"),
    Buffer.from(message, "utf8"),
  ]);
  const sig = secp256k1.sign(keccak_256(prefixed), privKey);
  return `0x${sig.toCompactHex()}${(sig.recovery + 27).toString(16).padStart(2, "0")}`;
}

/**
 * Register a party whose Canton key lives in the Snap.
 *
 * @returns {Promise<{party, cantonFingerprint, mappingFingerprint, evmAddress}>}
 */
export async function registerExternal({ request, evmPrivKey, keyIndex = 0 }) {
  const pub = await approve(request({ method: "canton_getPublicKey", params: { keyIndex } }));

  const evmAddress = evmAddressFrom(evmPrivKey);
  // <prefix>:<unix seconds>, the repo convention, so the same helper works for
  // the transfer headers which are timestamp-validated.
  const message = `register:${Math.floor(Date.now() / 1000)}`;
  const signature = eip191Sign(evmPrivKey, message);

  const prepared = await post("/register/prepare-topology", {
    canton_public_key: pub.compressedPubKey,
    signature,
    message,
  });
  if (!prepared.topology_hash || !prepared.registration_token) {
    throw new Error(`prepare-topology returned an unexpected shape: ${JSON.stringify(prepared)}`);
  }
  // The server derived the Canton identity independently from the public key
  // the Snap handed over. If these disagree, the party is not the Snap's.
  if (prepared.public_key_fingerprint !== pub.fingerprint) {
    throw new Error(
      `Canton fingerprint mismatch: snap ${pub.fingerprint}, server ${prepared.public_key_fingerprint}`,
    );
  }

  const topoSig = await approve(
    request({ method: "canton_signTopology", params: { hash: prepared.topology_hash, keyIndex } }),
  );

  const registered = await post("/register", {
    key_mode: "external",
    canton_public_key: pub.compressedPubKey,
    registration_token: prepared.registration_token,
    topology_signature: topoSig.derSignature,
    signature,
    message,
  });

  // Absence must fail: the custodial path omits key_mode entirely, so a server
  // that ignored our request and generated its own key would look successful.
  if (registered.key_mode !== "external") {
    throw new Error(
      `expected key_mode "external", got ${JSON.stringify(registered.key_mode)}. ` +
        `A missing value means the server registered this user custodially.`,
    );
  }
  if (!FINGERPRINT.test(prepared.public_key_fingerprint)) {
    throw new Error(`Canton fingerprint is malformed: ${prepared.public_key_fingerprint}`);
  }

  return {
    party: registered.party,
    cantonFingerprint: prepared.public_key_fingerprint,
    mappingFingerprint: registered.fingerprint,
    evmAddress,
  };
}
