export interface UserProfile {
  cantonPartyId: string;
  fingerprint: string;
  keyMode: "custodial" | "external";
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired — please reconnect");
  }
}

export async function getUser(
  baseUrl: string,
  address: string,
  signature: string,
  message: string,
): Promise<UserProfile | null> {
  const res = await fetch(`${baseUrl}/user?address=${encodeURIComponent(address)}`, {
    headers: { "X-Signature": signature, "X-Message": message },
  });
  if (res.status === 404) return null;
  if (res.status === 401) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`Middleware error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    cantonPartyId: data.canton_party,
    fingerprint: data.fingerprint,
    keyMode: data.key_mode === "external" ? "external" : "custodial",
  };
}

export async function checkMiddlewareHealth(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(id);
    return true; // any HTTP response means the server is reachable
  } catch {
    return false;
  }
}

export class AlreadyRegisteredError extends Error {
  readonly details: string;
  constructor(details: string) {
    super("already_registered");
    this.details = details;
  }
}

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 409) throw new AlreadyRegisteredError(text);
  if (!res.ok) throw new Error(friendlyError(res.status, text));
  return JSON.parse(text);
}

function friendlyError(status: number, body: string): string {
  if (status === 403) {
    try {
      const parsed = JSON.parse(body);
      if (
        typeof parsed.error === "string" &&
        parsed.error.toLowerCase().includes("not whitelisted")
      ) {
        return "Your address is not whitelisted for registration. Ask your Canton administrator to whitelist this address on the middleware.";
      }
    } catch {
      // body wasn't JSON — fall through
    }
  }
  return `${status}: ${body}`;
}

export interface RegisterResult {
  party: string;
  fingerprint: string;
}

export async function registerCustodial(
  baseUrl: string,
  signature: string,
  message: string,
): Promise<RegisterResult> {
  return post(baseUrl, "/register", { signature, message });
}

export interface PrepareTopologyResult {
  topology_hash: string;
  registration_token: string;
}

export async function prepareTopology(
  baseUrl: string,
  signature: string,
  message: string,
  canton_public_key: string,
): Promise<PrepareTopologyResult> {
  return post(baseUrl, "/register/prepare-topology", { signature, message, canton_public_key });
}

export async function registerNonCustodial(
  baseUrl: string,
  body: {
    signature: string;
    message: string;
    canton_public_key: string;
    registration_token: string;
    topology_signature: string;
  },
): Promise<RegisterResult> {
  return post(baseUrl, "/register", { ...body, key_mode: "external" });
}
