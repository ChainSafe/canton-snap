const SESSION_PREFIX = "canton_session_";

export interface Session {
  message: string;
  signature: string;
}

export function storeSession(address: string, message: string, signature: string): void {
  sessionStorage.setItem(
    SESSION_PREFIX + address.toLowerCase(),
    JSON.stringify({ message, signature }),
  );
}

export function getSession(address: string): Session | null {
  const raw = sessionStorage.getItem(SESSION_PREFIX + address.toLowerCase());
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
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
