// SPDX-License-Identifier: Apache-2.0

import { authorizedFetch } from "./auth";

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

const TOKENS_MAX_PAGES = 100;

export async function getTokens(baseUrl: string): Promise<TokenConfig[]> {
  const all: TokenConfig[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < TOKENS_MAX_PAGES; page++) {
    const url = new URL(`${baseUrl}/tokens`);
    url.searchParams.set("limit", String(TOKENS_PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));

    const data = (await res.json()) as {
      items: unknown[];
      next_cursor?: string;
      has_more: boolean;
    };
    if (!Array.isArray(data.items)) throw new Error("Unexpected tokens response shape");

    all.push(...data.items.filter(isTokenConfig));

    if (!data.has_more) break;
    if (!data.next_cursor)
      throw new Error("Unexpected tokens response: has_more is true but next_cursor is missing");
    cursor = data.next_cursor;
  }

  return all;
}

export interface UserProfile {
  cantonPartyId: string;
  fingerprint: string;
  keyMode: "custodial" | "external";
}

// GET /profile as `address`. Authenticated with a SIWE-issued bearer token via
// authorizedFetch, which runs the sign-in flow when no live token is cached
// (pass `interactive: false` to fail with SessionExpiredError instead of
// prompting). Returns null when the address is not registered.
export async function getUser(
  baseUrl: string,
  address: string,
  opts?: { interactive?: boolean },
): Promise<UserProfile | null> {
  const res = await authorizedFetch(baseUrl, address, new URL(`${baseUrl}/profile`), opts);
  if (res.status === 404) return null;
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

// The form input a middleware error is about, when it maps to one. Pages use
// this to anchor the message to that field (red ring + inline text) instead
// of showing a generic banner.
export type ApiErrorField = "recipient" | "amount";

export class ApiError extends Error {
  readonly field?: ApiErrorField;
  /** Optional secondary "how to fix it" line, rendered dimmer than the message. */
  readonly hint?: string;
  constructor(message: string, field?: ApiErrorField, hint?: string) {
    super(message);
    this.name = "ApiError";
    this.field = field;
    this.hint = hint;
  }
}

// Known middleware error strings mapped to user-facing copy, covering every
// client-facing message the transfer endpoints emit (canton-middleware
// pkg/transfer/{http,service}.go — all responses there use fixed strings; the
// only dynamic part is the token symbol below). Matched as lowercase
// substrings of the server's `error` field so minor upstream wording changes
// (punctuation, casing) don't break the mapping; first matching entry wins,
// so keep more specific strings above general ones. Unmatched messages fall
// through to apiError's cleaned-up default.
const KNOWN_ERRORS: {
  match: string[];
  message: (raw: string) => string;
  field?: ApiErrorField;
  hint?: string;
}[] = [
  // ── Registration ──
  {
    match: ["not whitelisted"],
    message: () =>
      "Your address is not whitelisted for registration. Ask your Canton administrator to whitelist this address on the middleware.",
  },

  // ── Recipient (anchored to the recipient field) ──
  {
    // canton-middleware#362 — "recipient party is not registered with this
    // service and <TOKEN> does not support transfers to external parties".
    match: ["recipient party is not registered", "external parties"],
    message: (raw) => {
      const token = raw.match(/and (\S+) does not support/)?.[1];
      return `Transfers to external parties aren't supported for ${token ?? "this token"}.`;
    },
    field: "recipient",
  },
  {
    match: ["recipient party id is not known on the network"],
    message: () => "This party ID isn't known on the Canton network.",
    field: "recipient",
    hint: "Double-check the party ID with the recipient.",
  },
  {
    match: ["could not verify recipient party id"],
    message: () => "Couldn't verify the recipient party ID — please try again in a moment.",
    field: "recipient",
  },
  {
    match: ["recipient not found"],
    message: () => "This address isn't registered with this service.",
    field: "recipient",
    hint: "Double-check the address, or ask the recipient to register first.",
  },
  {
    match: ["invalid recipient party id"],
    message: () => "Enter a valid Canton party ID (name::fingerprint).",
    field: "recipient",
  },
  {
    match: ["invalid recipient address"],
    message: () => "Enter a valid 0x EVM address.",
    field: "recipient",
  },
  {
    match: ["cannot transfer to self"],
    message: () => "You can't send a transfer to yourself.",
    field: "recipient",
  },

  // ── Amount (anchored to the amount field) ──
  {
    match: ["insufficient balance"],
    message: () => "Amount exceeds your available balance.",
    field: "amount",
    hint: "Funds locked in pending outgoing offers can't be spent until the offer completes or is claimed back.",
  },
  {
    match: ["invalid amount"],
    message: () => "Enter a positive amount.",
    field: "amount",
  },

  // ── Form / request validation (banner) ──
  {
    match: ["unsupported token"],
    message: () => "This token isn't supported for transfers.",
  },
  {
    match: ["validity_seconds must be a positive"],
    message: () => "Enter a valid offer expiry.",
  },
  {
    match: ["validity_seconds is too large"],
    message: () => "Offer expiry is too long — pick a shorter one.",
  },

  // ── Auth / account state ──
  {
    match: ["message expired or invalid format"],
    message: () => "Your authentication signature expired — please try again.",
  },
  {
    match: ["authentication required"],
    message: () => "Authentication failed — please reconnect your wallet and try again.",
  },
  {
    match: ["user not found"],
    message: () => "Your wallet isn't registered with this service — register before transferring.",
  },
  {
    match: ["requires key_mode"],
    message: () =>
      "This action isn't available for your account type — try disconnecting and reconnecting your wallet.",
  },

  // ── Signing / prepared-transfer lifecycle ──
  {
    match: ["signature fingerprint does not match"],
    message: () =>
      "Your signing key doesn't match the key registered for this account — reconnect the Canton Snap and try again.",
  },
  {
    match: ["signature verification failed"],
    message: () => "Signature verification failed on the ledger — please try signing again.",
  },
  {
    match: ["invalid der signature"],
    message: () => "The signature couldn't be processed — please try signing again.",
  },
  // Auth-header signature check — distinct from the two above. Keep below
  // them so their more specific strings match first.
  {
    match: ["invalid signature"],
    message: () => "Wallet signature verification failed — please try again.",
  },
  {
    match: ["transfer not found"],
    message: () => "This transfer session has expired — please start again.",
  },
  {
    match: ["transfer expired"],
    message: () => "The prepared transfer expired — please start again.",
  },

  // ── Ledger / server side ──
  {
    match: ["transfer rejected by the ledger"],
    message: () =>
      "The ledger rejected this transfer — verify the recipient party ID and amount, then try again.",
  },
  {
    match: ["conflicted with a concurrent operation"],
    message: () => "The transfer conflicted with another operation — please try again.",
  },
  {
    match: ["ledger temporarily unavailable"],
    message: () => "The Canton ledger is temporarily unavailable — please try again in a moment.",
  },
  {
    match: ["unexpected service error"],
    message: () => "Something went wrong on the server — please try again in a moment.",
  },
  {
    match: ["internal server error"],
    message: () => "Something went wrong on the server — please try again in a moment.",
  },

  // ── Malformed requests (dapp bugs — users can't fix these by editing the
  // form, so show a generic retry). Kept LAST: "required" would otherwise
  // shadow more specific messages like "authentication required". ──
  {
    match: ["invalid json"],
    message: () => "The request was malformed — please refresh the page and try again.",
  },
  {
    match: ["required"],
    message: () => "The request was malformed — please refresh the page and try again.",
  },
];

export function apiError(status: number, body: string): ApiError {
  // Middleware errors are `{"error": "...", "code": 400}` — pull out the
  // message so the user never sees the raw JSON envelope.
  let raw: string | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof parsed.error === "string"
    )
      raw = parsed.error;
  } catch {
    // body wasn't JSON — handled below
  }

  if (raw !== null) {
    const lower = raw.toLowerCase();
    for (const { match, message, field, hint } of KNOWN_ERRORS) {
      if (match.every((m) => lower.includes(m))) return new ApiError(message(raw), field, hint);
    }
    const msg = raw.trim();
    if (msg) return new ApiError(msg.charAt(0).toUpperCase() + msg.slice(1));
  }

  // Empty or non-JSON body — a proxy/gateway response, not the middleware.
  // Never show it raw (it can be a whole HTML page); the status code is the
  // one useful datum for a support report, so keep it.
  return new ApiError(`The request failed (HTTP ${status}). Please try again.`);
}

export function friendlyError(status: number, body: string): string {
  return apiError(status, body).message;
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
