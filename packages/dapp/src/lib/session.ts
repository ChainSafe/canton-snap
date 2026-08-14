// SPDX-License-Identifier: Apache-2.0

const SESSION_PREFIX = "canton_session_";

// A cached middleware session for one address. `token` is the SIWE-issued JWT
// used as a bearer token on the read endpoints; a null token marks a session
// against a middleware that runs without read auth (no /auth routes), where the
// read endpoints fall back to the ?address= query parameter.
export interface Session {
  token: string | null;
  /** Token expiry in unix seconds; null for the auth-disabled marker. */
  expiresAt: number | null;
}

export function storeSession(address: string, session: Session): void {
  sessionStorage.setItem(SESSION_PREFIX + address.toLowerCase(), JSON.stringify(session));
}

export function getSession(address: string): Session | null {
  const raw = sessionStorage.getItem(SESSION_PREFIX + address.toLowerCase());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Shape check also rejects pre-JWT sessions ({message, signature}) left over
    // from an older dapp version, which then read as "no session".
    const tokenOk = typeof parsed.token === "string" || parsed.token === null;
    const expiryOk = typeof parsed.expiresAt === "number" || parsed.expiresAt === null;
    if (!tokenOk || !expiryOk) return null;
    return { token: parsed.token as string | null, expiresAt: parsed.expiresAt as number | null };
  } catch {
    return null;
  }
}

export function clearSession(address: string): void {
  sessionStorage.removeItem(SESSION_PREFIX + address.toLowerCase());
}

export function clearAllSessions(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(key);
  }
}
