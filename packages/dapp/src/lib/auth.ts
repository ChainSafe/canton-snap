// SPDX-License-Identifier: Apache-2.0
//
// Sign-In with Ethereum (EIP-4361) against the middleware's read-endpoint auth
// (canton-middleware#352–354): fetch a nonce, personal_sign the SIWE message,
// exchange it at /auth/login for a short-lived JWT, and attach it as a bearer
// token on the read endpoints (/profile and the transfer listings). When the
// middleware runs without an `auth` config block the /auth routes are absent
// (404) and the read endpoints fall back to the legacy ?address= query
// parameter, which this module mirrors.

import { personalSign, toChecksumAddress } from "./ethereum";
import { ethChainId } from "./ethrpc";
import { getSession, storeSession, clearSession } from "./session";

/** Thrown when a non-interactive call would need a fresh sign-in. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired — please reconnect");
  }
}

/** Thrown when /auth/login rejects the address as not registered. */
export class NotRegisteredError extends Error {
  constructor() {
    super("Address is not registered");
  }
}

// The signed message's domain/uri/chain id must match the middleware's `auth`
// config or /auth/login rejects it. Domain and uri default to the dapp's own
// origin — what the deployed middleware configs expect — and can be pinned via
// env where the two differ (e.g. the local docker stack expects domain
// "localhost" / uri "http://localhost" while vite serves on localhost:3000).
// The chain id is fetched from the middleware's own /eth RPC, which the auth
// config mirrors on every deployed network.
// `||` not `??`: the docker entrypoint substitutes unset vars with an empty
// string, which must also fall back to the dapp origin.
function siweDomain(): string {
  return import.meta.env.VITE_SIWE_DOMAIN || window.location.host;
}

function siweUri(): string {
  return import.meta.env.VITE_SIWE_URI || window.location.origin;
}

const SIWE_STATEMENT = "Sign in to the Canton dapp";

// EIP-4361 plain-text message. Field order and blank lines are prescribed by
// the spec; the server parses it with spruceid/siwe-go, which also requires the
// address in EIP-55 checksum form.
export function buildSiweMessage(p: {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    `${p.domain} wants you to sign in with your Ethereum account:`,
    p.address,
    "",
    SIWE_STATEMENT,
    "",
    `URI: ${p.uri}`,
    "Version: 1",
    `Chain ID: ${p.chainId}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
  ].join("\n");
}

// Refresh this long before the token's expiry so a request never departs with a
// token that dies in flight.
const EXPIRY_MARGIN_SECONDS = 60;

// Per-middleware caches. Both reset on reload, so a middleware that toggles
// auth is picked up by a refresh (and the 401-retry path below self-heals
// without one).
const chainIdCache = new Map<string, number>();
const authDisabled = new Map<string, boolean>();

// Single-flight per (middleware, address): dashboard pages fire several read
// calls at once, and a shared login promise keeps that to one MetaMask prompt.
const loginInFlight = new Map<string, Promise<string | null>>();

async function middlewareChainId(baseUrl: string): Promise<number> {
  const cached = chainIdCache.get(baseUrl);
  if (cached !== undefined) return cached;
  const id = parseInt(await ethChainId(`${baseUrl}/eth`), 16);
  if (!Number.isFinite(id)) throw new Error("Could not determine middleware chain id");
  chainIdCache.set(baseUrl, id);
  return id;
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    // body wasn't JSON — fall through to the raw text
  }
  return text;
}

async function login(baseUrl: string, address: string): Promise<string | null> {
  // Start the chain-id lookup in parallel with the nonce fetch (neither depends
  // on the other) so the nonce spends as little of its server-side TTL as
  // possible before the user signs. The rejection guard keeps a failed /eth
  // call from surfacing as unhandled when the nonce 404 path returns early.
  const chainIdPromise = middlewareChainId(baseUrl);
  chainIdPromise.catch(() => {});

  const nonceRes = await fetch(`${baseUrl}/auth/nonce?address=${encodeURIComponent(address)}`);
  if (nonceRes.status === 404) {
    // No /auth routes: the middleware runs without read auth. Store a marker
    // session so a refresh still auto-reconnects.
    authDisabled.set(baseUrl, true);
    storeSession(address, { token: null, expiresAt: null });
    return null;
  }
  if (!nonceRes.ok) {
    throw new Error(`Sign-in failed (${nonceRes.status}): ${await errorMessage(nonceRes)}`);
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const message = buildSiweMessage({
    domain: siweDomain(),
    address: toChecksumAddress(address),
    uri: siweUri(),
    chainId: await chainIdPromise,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const signature = await personalSign(message, address);

  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!res.ok) {
    const msg = await errorMessage(res);
    // Matches the login service's 401 "address is not registered"
    // (canton-middleware pkg/auth/service/login.go); case-insensitive so a
    // phrasing tweak on the server is less likely to break new-user routing.
    if (res.status === 401 && msg.toLowerCase().includes("not registered"))
      throw new NotRegisteredError();
    throw new Error(`Sign-in failed (${res.status}): ${msg}`);
  }

  const data = (await res.json()) as { token: string; expires_at: number };
  authDisabled.set(baseUrl, false);
  storeSession(address, { token: data.token, expiresAt: data.expires_at });
  return data.token;
}

function liveSession(address: string): { token: string | null } | null {
  const session = getSession(address);
  if (!session) return null;
  if (session.token === null) return { token: null }; // auth-disabled marker
  if (session.expiresAt !== null && session.expiresAt - EXPIRY_MARGIN_SECONDS <= Date.now() / 1000)
    return null;
  return { token: session.token };
}

// Returns a live JWT for the address, running the SIWE login flow (one
// MetaMask signature prompt) when none is cached. Returns null when the
// middleware has read auth disabled. With `interactive: false` it never
// prompts: a missing or expired token throws SessionExpiredError instead.
export async function ensureAuthToken(
  baseUrl: string,
  address: string,
  opts?: { interactive?: boolean },
): Promise<string | null> {
  const live = liveSession(address);
  if (live) return live.token;
  if (authDisabled.get(baseUrl)) {
    // Re-store the marker: a disconnect clears sessions but not this in-memory
    // map, and without a session the auto-reconnect effect never runs.
    storeSession(address, { token: null, expiresAt: null });
    return null;
  }
  if (opts?.interactive === false) throw new SessionExpiredError();

  const key = `${baseUrl}|${address.toLowerCase()}`;
  let pending = loginInFlight.get(key);
  if (!pending) {
    pending = login(baseUrl, address).finally(() => loginInFlight.delete(key));
    loginInFlight.set(key, pending);
  }
  return pending;
}

function fetchAsCaller(url: URL, token: string | null, address: string): Promise<Response> {
  if (token === null) {
    // Legacy mode: the caller is resolved from the query parameter. Copy the
    // URL so a retry after re-login doesn't inherit the parameter.
    const legacy = new URL(url);
    legacy.searchParams.set("address", address);
    return fetch(legacy.toString());
  }
  return fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
}

// GET a read endpoint as `address`: bearer token when auth is enabled, legacy
// ?address= when it isn't. A 401 (token rejected early, or auth newly enabled
// behind a stale legacy session) drops the session and retries once with a
// fresh login.
export async function authorizedFetch(
  baseUrl: string,
  address: string,
  url: URL,
  opts?: { interactive?: boolean },
): Promise<Response> {
  const token = await ensureAuthToken(baseUrl, address, opts);
  const res = await fetchAsCaller(url, token, address);
  if (res.status !== 401) return res;

  // Drop the session only if it still holds the credentials this request used:
  // a concurrent 401 may already have re-logged-in and stored a fresh token,
  // which the retry should reuse rather than discard (and re-prompt for).
  if (getSession(address)?.token === token) {
    clearSession(address);
    authDisabled.delete(baseUrl);
  }
  const fresh = await ensureAuthToken(baseUrl, address, opts);
  return fetchAsCaller(url, fresh, address);
}
