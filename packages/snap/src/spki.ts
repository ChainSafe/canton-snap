/**
 * SPKI DER encoding for secp256k1 public keys.
 *
 * Produces X.509 SubjectPublicKeyInfo DER bytes identical to Go's
 * keys.CantonKeyPair.SPKIPublicKey() — required for Canton party registration.
 */

import { secp256k1 } from "@noble/curves/secp256k1";

// ASN.1 OIDs (DER-encoded)
// SEQUENCE { OID 1.2.840.10045.2.1, OID 1.3.132.0.10 }
const ALGORITHM_IDENTIFIER = new Uint8Array([
  0x30,
  0x10, // SEQUENCE, 16 bytes
  0x06,
  0x07, // OID, 7 bytes
  0x2a,
  0x86,
  0x48,
  0xce,
  0x3d,
  0x02,
  0x01, // 1.2.840.10045.2.1 (ecPublicKey)
  0x06,
  0x05, // OID, 5 bytes
  0x2b,
  0x81,
  0x04,
  0x00,
  0x0a, // 1.3.132.0.10 (secp256k1)
]);

/**
 * Encode a compressed secp256k1 public key as X.509 SubjectPublicKeyInfo DER.
 *
 * @param compressedPubKey - 33-byte compressed public key
 * @returns DER-encoded SPKI bytes (88 bytes for secp256k1)
 */
export function compressedPubKeyToSPKIDer(compressedPubKey: Uint8Array): Uint8Array {
  if (compressedPubKey.length !== 33) {
    throw new Error(`expected 33-byte compressed public key, got ${compressedPubKey.length}`);
  }

  // Decompress to uncompressed form (65 bytes: 0x04 || x || y)
  const point = secp256k1.ProjectivePoint.fromHex(compressedPubKey);
  const uncompressed = point.toRawBytes(false); // false = uncompressed

  // BIT STRING wrapper: 0x03 + length + 0x00 (no unused bits) + uncompressed key
  const bitStringContent = new Uint8Array(1 + uncompressed.length);
  bitStringContent[0] = 0x00; // no unused bits
  bitStringContent.set(uncompressed, 1);

  const bitString = new Uint8Array(2 + bitStringContent.length);
  bitString[0] = 0x03; // BIT STRING tag
  bitString[1] = bitStringContent.length;
  bitString.set(bitStringContent, 2);

  // Outer SEQUENCE: algorithmIdentifier + bitString
  const innerLength = ALGORITHM_IDENTIFIER.length + bitString.length;
  const result = new Uint8Array(2 + innerLength);
  result[0] = 0x30; // SEQUENCE tag
  result[1] = innerLength;
  result.set(ALGORITHM_IDENTIFIER, 2);
  result.set(bitString, 2 + ALGORITHM_IDENTIFIER.length);

  return result;
}
