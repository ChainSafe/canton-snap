/**
 * Origin gating for signing methods.
 *
 * Refuses any caller that is not served over HTTPS or one of the
 * IANA-reserved loopback hosts. This is a defense-in-depth check on
 * top of MetaMask's own origin handling: in production MetaMask only
 * accepts snaps over HTTPS, but a local dev setup with mixed content
 * shouldn't be able to wander into the signing path with a plain-HTTP
 * snap origin.
 */

// WHATWG URL keeps the brackets in `hostname` for IPv6 (`[::1]`).
// Accept both forms because Node and some older browsers historically
// differ here, and there is no cost to permissive matching for these
// hard-coded loopback values.
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function assertSigningOrigin(origin: string): void {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`Unsupported signing origin: ${origin}`);
  }

  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname)) return;

  throw new Error("Signing is only allowed from HTTPS origins or local development origins");
}
