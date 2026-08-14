// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const BASE = "http://mw.test";
const ADDRESS = "0x000000000000000000000000000000000000dead";
const CHECKSUMMED = "0x000000000000000000000000000000000000dEaD";
const READ_URL = () => new URL(`${BASE}/api/v2/transfer/incoming`);

// Minimal Storage stub — session.ts only uses get/set/removeItem here.
function makeStorage() {
  const items: Record<string, string> = {};
  return {
    items,
    getItem: (k: string) => (k in items ? items[k] : null),
    setItem: (k: string, v: string) => {
      items[k] = v;
    },
    removeItem: (k: string) => {
      delete items[k];
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Routes {
  eth?: () => Response;
  nonce?: () => Response;
  login?: () => Response;
  read?: (req: { auth: string | null; url: string }) => Response;
}

// Wires up fetch/window/sessionStorage stubs and returns a freshly-imported
// auth module (vi.resetModules clears its per-middleware caches) plus spies.
async function setup(routes: Routes = {}) {
  vi.resetModules();

  // Vitest loads the workspace .env like vite does; pin the SIWE overrides to
  // empty (= "use window.location") so a developer's local values (e.g. the
  // devnet-testing ones) can't leak into these tests.
  vi.stubEnv("VITE_SIWE_DOMAIN", "");
  vi.stubEnv("VITE_SIWE_URI", "");

  const storage = makeStorage();
  vi.stubGlobal("sessionStorage", storage);

  const personalSignCalls: string[] = [];
  const ethereumRequest = vi.fn(async (args: { method: string; params?: unknown }) => {
    if (args.method === "personal_sign") {
      const [hexMessage] = args.params as [string, string];
      const bytes = hexMessage
        .slice(2)
        .match(/.{2}/g)!
        .map((b) => parseInt(b, 16));
      personalSignCalls.push(new TextDecoder().decode(new Uint8Array(bytes)));
      return "0xsignature";
    }
    throw new Error(`unexpected ethereum request: ${args.method}`);
  });
  vi.stubGlobal("window", {
    location: { host: "dapp.test", origin: "https://dapp.test" },
    ethereum: { request: ethereumRequest },
  });

  const readCalls: { auth: string | null; url: string }[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url === `${BASE}/eth`) {
      return routes.eth ? routes.eth() : json({ jsonrpc: "2.0", id: 1, result: "0x7a69" }); // 31337
    }
    if (url.startsWith(`${BASE}/auth/nonce`)) {
      return routes.nonce ? routes.nonce() : json({ nonce: "abcdef12" });
    }
    if (url === `${BASE}/auth/login`) {
      return routes.login
        ? routes.login()
        : json({ token: "jwt-1", expires_at: Math.floor(Date.now() / 1000) + 21600 });
    }
    if (url.startsWith(`${BASE}/api/`) || url.startsWith(`${BASE}/profile`)) {
      const headers = new Headers(init?.headers);
      const call = { auth: headers.get("Authorization"), url };
      readCalls.push(call);
      return routes.read ? routes.read(call) : json({ items: [] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  const auth = await import("./auth");
  return { auth, storage, personalSignCalls, readCalls, fetchMock };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildSiweMessage", () => {
  it("produces the EIP-4361 layout siwe-go parses", async () => {
    const { auth } = await setup();
    const msg = auth.buildSiweMessage({
      domain: "dapp.test",
      address: CHECKSUMMED,
      uri: "https://dapp.test",
      chainId: 31337,
      nonce: "abcdef12",
      issuedAt: "2026-07-13T00:00:00.000Z",
    });
    expect(msg).toBe(
      "dapp.test wants you to sign in with your Ethereum account:\n" +
        `${CHECKSUMMED}\n` +
        "\n" +
        "Sign in to the Canton dapp\n" +
        "\n" +
        "URI: https://dapp.test\n" +
        "Version: 1\n" +
        "Chain ID: 31337\n" +
        "Nonce: abcdef12\n" +
        "Issued At: 2026-07-13T00:00:00.000Z",
    );
  });
});

describe("authorizedFetch", () => {
  it("logs in via SIWE once and sends the JWT as a bearer token", async () => {
    const { auth, personalSignCalls, readCalls } = await setup();

    await auth.authorizedFetch(BASE, ADDRESS, READ_URL());
    await auth.authorizedFetch(BASE, ADDRESS, READ_URL());

    expect(personalSignCalls).toHaveLength(1);
    const signed = personalSignCalls[0];
    expect(signed).toContain("dapp.test wants you to sign in");
    expect(signed).toContain(CHECKSUMMED); // EIP-55, not the lowercase input
    expect(signed).toContain("Chain ID: 31337");
    expect(signed).toContain("Nonce: abcdef12");

    expect(readCalls).toHaveLength(2);
    for (const call of readCalls) {
      expect(call.auth).toBe("Bearer jwt-1");
      expect(call.url).not.toContain("address=");
    }
  });

  it("shares one login across concurrent reads", async () => {
    const { auth, personalSignCalls } = await setup();

    await Promise.all([
      auth.authorizedFetch(BASE, ADDRESS, READ_URL()),
      auth.authorizedFetch(BASE, ADDRESS, READ_URL()),
      auth.authorizedFetch(BASE, ADDRESS, READ_URL()),
    ]);

    expect(personalSignCalls).toHaveLength(1);
  });

  it("falls back to ?address= when the middleware has no auth routes", async () => {
    const { auth, personalSignCalls, readCalls } = await setup({
      nonce: () => new Response("not found", { status: 404 }),
    });

    await auth.authorizedFetch(BASE, ADDRESS, READ_URL());

    expect(personalSignCalls).toHaveLength(0);
    expect(readCalls).toHaveLength(1);
    expect(readCalls[0].auth).toBeNull();
    expect(readCalls[0].url).toContain(`address=${ADDRESS}`);
  });

  it("still falls back to ?address= when the parallel chain-id fetch fails", async () => {
    const { auth, readCalls } = await setup({
      eth: () => {
        throw new Error("connection refused");
      },
      nonce: () => new Response("not found", { status: 404 }),
    });

    await auth.authorizedFetch(BASE, ADDRESS, READ_URL());

    expect(readCalls).toHaveLength(1);
    expect(readCalls[0].url).toContain(`address=${ADDRESS}`);
  });

  it("re-stores the auth-disabled marker session after a disconnect", async () => {
    const { auth, storage } = await setup({
      nonce: () => new Response("not found", { status: 404 }),
    });
    const sessionKey = `canton_session_${ADDRESS}`;

    await auth.authorizedFetch(BASE, ADDRESS, READ_URL());
    expect(storage.getItem(sessionKey)).not.toBeNull();

    // Disconnect clears sessions but not auth.ts's in-memory auth-disabled
    // map; the next connect must re-store the marker or auto-reconnect breaks.
    const { clearAllSessions } = await import("./session");
    clearAllSessions();
    await expect(auth.ensureAuthToken(BASE, ADDRESS)).resolves.toBeNull();
    expect(storage.getItem(sessionKey)).toBe(JSON.stringify({ token: null, expiresAt: null }));
  });

  it("keeps a token stored by a concurrent re-login instead of clearing it on 401", async () => {
    let onStaleRejected: (() => void) | undefined = undefined;
    const { auth, personalSignCalls, readCalls } = await setup({
      read: (call) =>
        call.auth === "Bearer stale"
          ? (onStaleRejected?.(), json({ error: "expired" }, 401))
          : json({ items: [] }),
    });
    const { storeSession } = await import("./session");
    storeSession(ADDRESS, { token: "stale", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    // Another request's 401 finished its re-login while our 401 was in flight.
    onStaleRejected = () =>
      storeSession(ADDRESS, { token: "fresh", expiresAt: Math.floor(Date.now() / 1000) + 3600 });

    const res = await auth.authorizedFetch(BASE, ADDRESS, READ_URL());

    expect(res.status).toBe(200);
    expect(personalSignCalls).toHaveLength(0); // reused the fresh token, no new prompt
    expect(readCalls.map((c) => c.auth)).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  it("re-logins once when the server rejects the token", async () => {
    let reads = 0;
    const { auth, personalSignCalls, readCalls } = await setup({
      read: () => (++reads === 1 ? json({ error: "expired" }, 401) : json({ items: [] })),
    });
    // Seed a stale (but unexpired) token so no login precedes the first read.
    const { storeSession } = await import("./session");
    storeSession(ADDRESS, { token: "stale", expiresAt: Math.floor(Date.now() / 1000) + 3600 });

    const res = await auth.authorizedFetch(BASE, ADDRESS, READ_URL());

    expect(res.status).toBe(200);
    expect(personalSignCalls).toHaveLength(1); // the re-login
    expect(readCalls.map((c) => c.auth)).toEqual(["Bearer stale", "Bearer jwt-1"]);
  });

  it("re-logins when the cached token is past its expiry margin", async () => {
    const { auth, personalSignCalls } = await setup();
    const { storeSession } = await import("./session");
    storeSession(ADDRESS, { token: "old", expiresAt: Math.floor(Date.now() / 1000) + 10 });

    await auth.authorizedFetch(BASE, ADDRESS, READ_URL());

    expect(personalSignCalls).toHaveLength(1);
  });
});

describe("ensureAuthToken", () => {
  it("throws SessionExpiredError instead of prompting when non-interactive", async () => {
    const { auth, personalSignCalls } = await setup();

    await expect(auth.ensureAuthToken(BASE, ADDRESS, { interactive: false })).rejects.toThrow(
      auth.SessionExpiredError,
    );
    expect(personalSignCalls).toHaveLength(0);
  });

  it("throws NotRegisteredError when login rejects the address", async () => {
    const { auth } = await setup({
      login: () => json({ error: "address is not registered" }, 401),
    });

    await expect(auth.ensureAuthToken(BASE, ADDRESS)).rejects.toThrow(auth.NotRegisteredError);
  });

  it("matches the not-registered rejection case-insensitively", async () => {
    const { auth } = await setup({
      login: () => json({ error: "Address is Not Registered" }, 401),
    });

    await expect(auth.ensureAuthToken(BASE, ADDRESS)).rejects.toThrow(auth.NotRegisteredError);
  });

  it("allows a retry after a failed login (single-flight entry is cleared)", async () => {
    let logins = 0;
    const { auth } = await setup({
      login: () =>
        ++logins === 1
          ? json({ error: "nonce is unknown, expired, or already used" }, 401)
          : json({ token: "jwt-2", expires_at: Math.floor(Date.now() / 1000) + 21600 }),
    });

    await expect(auth.ensureAuthToken(BASE, ADDRESS)).rejects.toThrow(/Sign-in failed/);
    await expect(auth.ensureAuthToken(BASE, ADDRESS)).resolves.toBe("jwt-2");
  });
});
