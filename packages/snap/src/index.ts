/**
 * Canton Snap — MetaMask Snap for non-custodial Canton Network signing.
 *
 * Derives secp256k1 keys from the user's seed phrase and signs
 * Canton transactions with SHA-256 + DER encoding.
 */

import type { OnRpcRequestHandler } from "@metamask/snaps-sdk";
import { sha256 } from "@noble/hashes/sha256";
import { deriveCantonKey } from "./keyDerivation";
import { compressedPubKeyToSPKIDer } from "./spki";
import { fingerprintFromSPKI } from "./fingerprint";
import { signHashDER } from "./sign";
import {
  exportPublicKeyDialog,
  signTransactionDialog,
  signTopologyDialog,
  getFingerprintDialog,
} from "./dialogs";
import { bytesToHex } from "./hex";
import { validateKeyIndex, parseSignHash, parseTopologyHash } from "./validation";
import { allowFingerprintOrigin, isFingerprintOriginAllowed } from "./state";
import type {
  GetPublicKeyParams,
  GetPublicKeyResponse,
  SignHashParams,
  SignTopologyParams,
  GetFingerprintParams,
  SignResponse,
  GetFingerprintResponse,
} from "./types";

export const onRpcRequest: OnRpcRequestHandler = async ({ origin, request }) => {
  switch (request.method) {
    case "canton_getPublicKey":
      return handleGetPublicKey(origin, (request.params as GetPublicKeyParams) ?? {});
    case "canton_signHash":
      return handleSignHash(origin, (request.params as SignHashParams) ?? {});
    case "canton_signTopology":
      return handleSignTopology(origin, (request.params as SignTopologyParams) ?? {});
    case "canton_getFingerprint":
      return handleGetFingerprint(origin, (request.params as GetFingerprintParams) ?? {});
    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
};

async function handleGetPublicKey(
  origin: string,
  params: GetPublicKeyParams,
): Promise<GetPublicKeyResponse> {
  const keyIndex = validateKeyIndex(params.keyIndex);

  const { compressedPubKey } = await deriveCantonKey(keyIndex);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  const approved = await snap.request({
    method: "snap_dialog",
    params: { type: "confirmation", content: exportPublicKeyDialog(origin, fingerprint) },
  });
  if (!approved) throw new Error("User rejected public key export");

  return {
    compressedPubKey: bytesToHex(compressedPubKey),
    spkiDer: bytesToHex(spkiDer),
    fingerprint,
  };
}

async function handleSignHash(origin: string, params: SignHashParams): Promise<SignResponse> {
  const hashBytes = parseSignHash(params.hash);
  const keyIndex = validateKeyIndex(params.keyIndex);
  const hashHex = bytesToHex(hashBytes);

  const approved = await snap.request({
    method: "snap_dialog",
    params: {
      type: "confirmation",
      content: signTransactionDialog(origin, hashHex, params.metadata),
    },
  });
  if (!approved) throw new Error("User rejected signing");

  const { privateKey, compressedPubKey } = await deriveCantonKey(keyIndex);
  const derSig = signHashDER(privateKey, hashBytes);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  return { derSignature: "0x" + bytesToHex(derSig), fingerprint };
}

async function handleSignTopology(
  origin: string,
  params: SignTopologyParams,
): Promise<SignResponse> {
  const multiHashBytes = parseTopologyHash(params.hash);
  const keyIndex = validateKeyIndex(params.keyIndex);
  const hashHex = bytesToHex(multiHashBytes);

  // Canton's EC_DSA_SHA_256 algorithm: the signer hashes the raw MultiHash
  // before signing, matching CantonKeyPair.SignDER() in the Go SDK.
  const digest = sha256(multiHashBytes);

  const approved = await snap.request({
    method: "snap_dialog",
    params: { type: "confirmation", content: signTopologyDialog(origin, hashHex) },
  });
  if (!approved) throw new Error("User rejected topology signing");

  const { privateKey, compressedPubKey } = await deriveCantonKey(keyIndex);
  const derSig = signHashDER(privateKey, digest);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  return { derSignature: "0x" + bytesToHex(derSig), fingerprint };
}

async function handleGetFingerprint(
  origin: string,
  params: GetFingerprintParams,
): Promise<GetFingerprintResponse> {
  const keyIndex = validateKeyIndex(params.keyIndex);
  const { compressedPubKey } = await deriveCantonKey(keyIndex);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  if (!(await isFingerprintOriginAllowed(origin))) {
    const approved = await snap.request({
      method: "snap_dialog",
      params: { type: "confirmation", content: getFingerprintDialog(origin, fingerprint) },
    });
    if (!approved) throw new Error("User rejected fingerprint disclosure");
    await allowFingerprintOrigin(origin);
  }

  return { fingerprint };
}
