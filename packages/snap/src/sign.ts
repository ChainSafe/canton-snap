/**
 * DER-encoded ECDSA signing for Canton Interactive Submission.
 *
 * Produces ASN.1 DER signatures identical to Go's
 * keys.CantonKeyPair.SignHashDER() — required for Canton transaction execution.
 *
 * IMPORTANT: The snap receives a pre-hashed 32-byte digest from Canton's
 * PrepareSubmission. It signs the hash directly — it must NOT re-hash.
 */

import { secp256k1 } from "@noble/curves/secp256k1";

/**
 * Sign a 32-byte hash and return an ASN.1 DER-encoded ECDSA signature.
 *
 * Uses RFC 6979 deterministic k-value and low-S normalization (BIP-62),
 * matching go-ethereum's crypto.Sign behavior.
 *
 * @param privateKey - 32-byte secp256k1 private key
 * @param hash - 32-byte digest (from Canton PrepareSubmission)
 * @returns DER-encoded signature bytes
 */
export function signHashDER(privateKey: Uint8Array, hash: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error(`private key must be 32 bytes, got ${privateKey.length}`);
  }
  if (hash.length !== 32) {
    throw new Error(`hash must be 32 bytes, got ${hash.length}`);
  }

  // Sign with low-S normalization (default in @noble/curves)
  const sig = secp256k1.sign(hash, privateKey, { lowS: true });

  return encodeDER(sig.r, sig.s);
}

/**
 * Encode (r, s) as ASN.1 DER:
 *   SEQUENCE { INTEGER r, INTEGER s }
 *
 * DER INTEGERs are signed — a leading 0x00 is prepended if the high bit is set.
 */
function encodeDER(r: bigint, s: bigint): Uint8Array {
  const rBytes = encodeDERInteger(r);
  const sBytes = encodeDERInteger(s);

  // SEQUENCE tag (0x30) + length + rBytes + sBytes
  const seqLength = rBytes.length + sBytes.length;
  const result = new Uint8Array(2 + seqLength);
  result[0] = 0x30; // SEQUENCE tag
  result[1] = seqLength;
  result.set(rBytes, 2);
  result.set(sBytes, 2 + rBytes.length);

  return result;
}

/**
 * Encode a bigint as a DER INTEGER (tag 0x02 + length + value).
 * Prepends 0x00 if the high bit is set (DER integers are signed).
 * Strips leading zeros except when needed for sign bit.
 */
function encodeDERInteger(value: bigint): Uint8Array {
  // Convert bigint to big-endian bytes
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = "0" + hex;
  }
  const bytes = hexToBytes(hex);

  // Prepend 0x00 if high bit is set (DER integers are signed)
  const needsPadding = bytes[0] >= 0x80;
  const intBytes = needsPadding ? new Uint8Array([0x00, ...bytes]) : bytes;

  // tag (0x02) + length + value
  const result = new Uint8Array(2 + intBytes.length);
  result[0] = 0x02; // INTEGER tag
  result[1] = intBytes.length;
  result.set(intBytes, 2);

  return result;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
