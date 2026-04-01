/**
 * Canton Snap — MetaMask Snap for non-custodial Canton Network signing.
 *
 * Derives secp256k1 keys from the user's seed phrase and signs
 * Canton transactions with SHA-256 + DER encoding.
 */

import type { OnRpcRequestHandler } from "@metamask/snaps-sdk";
import { deriveCantonKey } from "./keyDerivation";
import { compressedPubKeyToSPKIDer } from "./spki";
import { fingerprintFromSPKI } from "./fingerprint";
import { signHashDER } from "./sign";
import { exportPublicKeyDialog, signTransactionDialog, signTopologyDialog } from "./dialogs";
import type {
  GetPublicKeyParams,
  GetPublicKeyResponse,
  SignHashParams,
  SignTopologyParams,
  GetFingerprintParams,
  SignResponse,
  GetFingerprintResponse,
} from "./types";

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case "canton_getPublicKey":
      return handleGetPublicKey((request.params as GetPublicKeyParams) ?? {});
    case "canton_signHash":
      return handleSignHash(request.params as SignHashParams);
    case "canton_signTopology":
      return handleSignTopology(request.params as SignTopologyParams);
    case "canton_getFingerprint":
      return handleGetFingerprint((request.params as GetFingerprintParams) ?? {});
    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
};

async function handleGetPublicKey(params: GetPublicKeyParams): Promise<GetPublicKeyResponse> {
  const { privateKey: _, compressedPubKey } = await deriveCantonKey(params.keyIndex ?? 0);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  const approved = await snap.request({
    method: "snap_dialog",
    params: { type: "confirmation", content: exportPublicKeyDialog(fingerprint) },
  });

  if (!approved) {
    throw new Error("User rejected public key export");
  }

  return {
    compressedPubKey: bytesToHex(compressedPubKey),
    spkiDer: bytesToHex(spkiDer),
    fingerprint,
  };
}

async function handleSignHash(params: SignHashParams): Promise<SignResponse> {
  if (!params?.hash) {
    throw new Error("hash is required");
  }

  const hash = stripHexPrefix(params.hash);
  const hashBytes = hexToBytes(hash);
  if (hashBytes.length === 0) {
    throw new Error("hash must not be empty");
  }

  const { privateKey, compressedPubKey } = await deriveCantonKey(params.keyIndex ?? 0);

  const approved = await snap.request({
    method: "snap_dialog",
    params: { type: "confirmation", content: signTransactionDialog(hash, params.metadata) },
  });

  if (!approved) {
    throw new Error("User rejected signing");
  }

  const derSig = signHashDER(privateKey, hashBytes);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  return {
    derSignature: "0x" + bytesToHex(derSig),
    fingerprint,
  };
}

async function handleSignTopology(params: SignTopologyParams): Promise<SignResponse> {
  if (!params?.hash) {
    throw new Error("hash is required");
  }

  const hash = stripHexPrefix(params.hash);
  const hashBytes = hexToBytes(hash);
  if (hashBytes.length === 0) {
    throw new Error("hash must not be empty");
  }

  const { privateKey, compressedPubKey } = await deriveCantonKey(params.keyIndex ?? 0);

  const approved = await snap.request({
    method: "snap_dialog",
    params: { type: "confirmation", content: signTopologyDialog(hash) },
  });

  if (!approved) {
    throw new Error("User rejected topology signing");
  }

  const derSig = signHashDER(privateKey, hashBytes);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  return {
    derSignature: "0x" + bytesToHex(derSig),
    fingerprint,
  };
}

async function handleGetFingerprint(params: GetFingerprintParams): Promise<GetFingerprintResponse> {
  const { privateKey: _, compressedPubKey } = await deriveCantonKey(params.keyIndex ?? 0);
  const spkiDer = compressedPubKeyToSPKIDer(compressedPubKey);
  const fingerprint = fingerprintFromSPKI(spkiDer);

  return { fingerprint };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}
