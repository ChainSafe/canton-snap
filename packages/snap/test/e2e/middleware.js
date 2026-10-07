// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal client for the canton-middleware HTTP API, covering only what the
 * end-to-end Snap test needs. Dependency-free so the test adds nothing to the
 * Snap workspace.
 *
 * Shapes follow pkg/transfer/types.go and pkg/user/user.go in canton-middleware.
 *
 * Authentication: the transfer endpoints authenticate per-request with
 * X-Signature and X-Message headers (pkg/transfer/http.go authenticateEVM),
 * not a bearer token. The message must be `<prefix>:<unix seconds>` and no more
 * than five minutes old (pkg/auth/evm.go ValidateTimedMessage).
 */

import { eip191Sign } from "./register.js";

const BASE = process.env.MIDDLEWARE_URL;

export function requireEnv(names = ["MIDDLEWARE_URL"]) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(
      `Missing required environment: ${missing.join(", ")}. See test/e2e/README.md.`,
    );
  }
}

/** Build the timed-message auth headers the transfer endpoints require. */
export function authHeaders(evmPrivKey, prefix) {
  const message = `${prefix}:${Math.floor(Date.now() / 1000)}`;
  return {
    "X-Signature": eip191Sign(evmPrivKey, message),
    "X-Message": message,
  };
}

async function request(method, path, { body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // fetch loses the path, which is the first thing you want at 2am.
    throw new Error(`${method} ${BASE}${path} failed: ${err.cause?.code ?? err.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

export const post = (path, body, headers) => request("POST", path, { body, headers });

/**
 * POST /api/v2/transfer/prepare
 *
 * Exactly one of toPartyID or to may be set; the middleware rejects both and
 * neither (pkg/transfer/http.go).
 *
 * @returns {Promise<{transfer_id, transaction_hash, party_id, expires_at}>}
 */
export function prepareTransfer({ evmPrivKey, toPartyID, to, amount, token, validitySeconds = 3600 }) {
  if (Boolean(toPartyID) === Boolean(to)) {
    throw new Error("prepareTransfer needs exactly one of toPartyID or to");
  }
  const body = { amount, token, validity_seconds: validitySeconds };
  if (toPartyID) body.to_party_id = toPartyID;
  if (to) body.to = to;
  return post("/api/v2/transfer/prepare", body, authHeaders(evmPrivKey, "transfer"));
}

/**
 * POST /api/v2/transfer/execute
 *
 * signature and signedBy come straight from the Snap's canton_signHash response.
 */
export function executeTransfer({ evmPrivKey, transferID, signature, signedBy }) {
  return post(
    "/api/v2/transfer/execute",
    { transfer_id: transferID, signature, signed_by: signedBy },
    authHeaders(evmPrivKey, "execute"),
  );
}

/** ERC-20 balanceOf through the eth_call facade, as a BigInt. */
export async function balanceOf({ tokenAddress, evmAddress }) {
  const data = `0x70a08231${evmAddress.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
  const json = await post("/eth", {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: tokenAddress, data }, "latest"],
  });
  if (json.error) throw new Error(`eth_call balanceOf: ${JSON.stringify(json.error)}`);
  if (typeof json.result !== "string") {
    throw new Error(`eth_call balanceOf returned no result: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return BigInt(json.result);
}

/**
 * Poll until predicate(value) holds. Transient errors are retried rather than
 * aborting the poll; the last one is reported if the budget runs out.
 */
export async function waitFor(fn, predicate, { timeoutMs = 60000, intervalMs = 2000, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last, lastErr;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      lastErr = undefined;
      if (predicate(last)) return last;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${label}. ` +
      (lastErr ? `Last error: ${lastErr.message}` : `Last value: ${String(last)}`),
  );
}
