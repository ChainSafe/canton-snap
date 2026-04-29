export interface TokenConfig {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

function isTokenConfig(t: unknown): t is TokenConfig {
  if (t === null || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    typeof r.address === "string" &&
    typeof r.name === "string" &&
    typeof r.symbol === "string" &&
    typeof r.decimals === "number"
  );
}

const TOKENS_PAGE_LIMIT = 50;

export async function getTokens(baseUrl: string): Promise<TokenConfig[]> {
  const all: TokenConfig[] = [];
  let cursor: string | undefined;

  while (true) {
    const url = new URL(`${baseUrl}/tokens`);
    url.searchParams.set("limit", String(TOKENS_PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));

    const data = (await res.json()) as { items: unknown[]; next_cursor?: string; has_more: boolean };
    if (!Array.isArray(data.items)) throw new Error("Unexpected tokens response shape");

    all.push(...data.items.filter(isTokenConfig));

    if (!data.has_more) break;
    cursor = data.next_cursor;
  }

  return all;
}

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
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const msg = typeof body.error === "string" ? body.error : "";
    if (msg.includes("expired")) throw new SessionExpiredError();
    throw new Error(msg || "Unauthorized");
  }
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
