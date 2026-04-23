export interface UserProfile {
  cantonPartyId: string;
  fingerprint: string;
  keyMode: "custodial" | "external";
}

export async function getUser(
  baseUrl: string,
  address: string,
  signature: string,
  message: string,
): Promise<UserProfile | null> {
  try {
    const params = new URLSearchParams({ address, signature, message });
    const res = await fetch(`${baseUrl}/user?${params.toString()}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return {
      cantonPartyId: data.canton_party ?? data.party,
      fingerprint: data.fingerprint,
      keyMode: data.key_mode === "external" ? "external" : "custodial",
    };
  } catch {
    return null;
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
