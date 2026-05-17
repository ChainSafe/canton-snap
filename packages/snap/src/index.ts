/**
 * Canton Snap — MetaMask Snap for non-custodial Canton Network signing.
 */

import type { OnRpcRequestHandler } from "@metamask/snaps-sdk";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
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
import {
  validateKeyIndex,
  parseSignHash,
  parseTopologyHash,
  validateMetadata,
} from "./validation";
import { allowFingerprint, isFingerprintAllowed } from "./state";
import type {
  GetPublicKeyParams,
  GetPublicKeyResponse,
  SignHashParams,
  SignTopologyParams,
  GetFingerprintParams,
  SignResponse,
  GetFingerprintResponse,
} from "./types";

interface KeyDerivation {
  privateKey: Uint8Array;
  compressedPubKey: Uint8Array;
  spkiDer: Uint8Array;
  fingerprint: string;
}

async function deriveFull(keyIndex: number): Promise<KeyDerivation> {
  const { privateKey, compressedPubKey } = await deriveCantonKey(keyIndex);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);
  return { privateKey, compressedPubKey, spkiDer, fingerprint };
}

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
  const { compressedPubKey, spkiDer, fingerprint } = await deriveFull(keyIndex);

  const approved = await snap.request({
    method: "snap_dialog",
    params: {
      type: "confirmation",
      content: exportPublicKeyDialog(origin, keyIndex, fingerprint),
    },
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
  const metadata = validateMetadata(params.metadata);
  const hashHex = bytesToHex(hashBytes);

  const { privateKey, fingerprint } = await deriveFull(keyIndex);

  const approved = await snap.request({
    method: "snap_dialog",
    params: {
      type: "confirmation",
      content: signTransactionDialog(origin, keyIndex, fingerprint, hashHex, metadata),
    },
  });
  if (!approved) throw new Error("User rejected signing");

  const derSig = signHashDER(privateKey, hashBytes);
  return { derSignature: "0x" + bytesToHex(derSig), fingerprint };
}

async function handleSignTopology(
  origin: string,
  params: SignTopologyParams,
): Promise<SignResponse> {
  const multiHashBytes = parseTopologyHash(params.hash);
  const keyIndex = validateKeyIndex(params.keyIndex);
  const hashHex = bytesToHex(multiHashBytes);

  // Canton's EC_DSA_SHA_256 algorithm: sign sha256(multiHash) — matches
  // CantonKeyPair.SignDER() in the Go SDK.
  const digest = sha256(multiHashBytes);

  const { privateKey, fingerprint } = await deriveFull(keyIndex);

  const approved = await snap.request({
    method: "snap_dialog",
    params: {
      type: "confirmation",
      content: signTopologyDialog(origin, keyIndex, fingerprint, hashHex),
    },
  });
  if (!approved) throw new Error("User rejected topology signing");

  const derSig = signHashDER(privateKey, digest);
  return { derSignature: "0x" + bytesToHex(derSig), fingerprint };
}

async function handleGetFingerprint(
  origin: string,
  params: GetFingerprintParams,
): Promise<GetFingerprintResponse> {
  const keyIndex = validateKeyIndex(params.keyIndex);
  const { fingerprint } = await deriveFull(keyIndex);

  if (!(await isFingerprintAllowed(origin, keyIndex))) {
    const approved = await snap.request({
      method: "snap_dialog",
      params: {
        type: "confirmation",
        content: getFingerprintDialog(origin, keyIndex, fingerprint),
      },
    });
    if (!approved) throw new Error("User rejected fingerprint disclosure");
    await allowFingerprint(origin, keyIndex);
  }

  return { fingerprint };
}
