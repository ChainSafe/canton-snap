/**
 * Strict hex codec shared by every input/output path in the snap.
 *
 * The forgiving "parseInt with NaN" pattern silently substitutes 0x00 for
 * invalid hex characters and truncates odd-length strings, which is
 * unacceptable for a signing oracle — those silent corruptions become
 * signatures over digests the user never saw.
 */

const HEX_RE = /^[0-9a-fA-F]*$/;

export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== "string") throw new Error("hex must be a string");
  if (!HEX_RE.test(hex)) throw new Error("hex contains non-hex characters");
  if (hex.length % 2 !== 0) throw new Error("hex must have even length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
