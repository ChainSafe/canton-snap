// SPDX-License-Identifier: Apache-2.0

// Client for the middleware faucet API (canton-middleware#350):
//   GET  /api/v2/faucet/tokens
//   POST /api/v2/faucet/drip
//   GET  /api/v2/faucet/status?address=<evm>
//   GET  /api/v2/faucet/drips/recent?limit=<n>

export type DripKind = "direct" | "offer";

export interface FaucetToken {
  symbol: string;
  name: string;
  dripAmount: string;
  cooldownSeconds: number;
  kind: DripKind;
  enabled: boolean;
}

export interface DripReceipt {
  kind: DripKind;
  amount: string;
  token: string;
  /** Canton ledger update id (direct drips) */
  txId?: string;
  /** Offer contract id (offer-based drips, e.g. USDCX) */
  contractId?: string;
  /** When the offer lapses if not accepted (offer-based drips) */
  expiresAt?: string;
  nextAvailableAt?: string;
}

export interface TokenAvailability {
  token: string;
  available: boolean;
  retryAfterSeconds?: number;
}

export interface RecentDrip {
  /** Truncated by the server (e.g. "0x91bD…44eC") */
  address: string;
  token: string;
  amount: string;
  kind: DripKind;
  createdAt: string;
}

/** The recipient address is not registered as a Canton party yet. */
export class NotRegisteredError extends Error {
  constructor() {
    super("address not registered");
  }
}

/** The per-address cooldown for this token has not elapsed yet. */
export class CooldownActiveError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("cooldown active");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The faucet party has run out of this token. */
export class FaucetDrainedError extends Error {
  constructor() {
    super("faucet empty");
  }
}

function isDripKind(v: unknown): v is DripKind {
  return v === "direct" || v === "offer";
}

function isFaucetToken(t: unknown): t is Record<string, unknown> {
  if (t === null || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    typeof r.symbol === "string" &&
    typeof r.name === "string" &&
    typeof r.drip_amount === "string" &&
    typeof r.cooldown_seconds === "number" &&
    isDripKind(r.kind) &&
    typeof r.enabled === "boolean"
  );
}

function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // body wasn't JSON — fall through
  }
  return body;
}

async function get<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${errorMessage(text)}`);
  return JSON.parse(text);
}

export async function getFaucetTokens(baseUrl: string): Promise<FaucetToken[]> {
  const data = await get<{ items: unknown[] }>(baseUrl, "/api/v2/faucet/tokens");
  if (!Array.isArray(data.items)) throw new Error("Unexpected faucet tokens response shape");
  return data.items.filter(isFaucetToken).map((r) => ({
    symbol: r.symbol as string,
    name: r.name as string,
    dripAmount: r.drip_amount as string,
    cooldownSeconds: r.cooldown_seconds as number,
    kind: r.kind as DripKind,
    enabled: r.enabled as boolean,
  }));
}

export async function getFaucetStatus(
  baseUrl: string,
  address: string,
): Promise<TokenAvailability[]> {
  const data = await get<{ items: unknown[] }>(
    baseUrl,
    `/api/v2/faucet/status?address=${encodeURIComponent(address)}`,
  );
  if (!Array.isArray(data.items)) throw new Error("Unexpected faucet status response shape");
  return data.items.flatMap((t) => {
    if (t === null || typeof t !== "object") return [];
    const r = t as Record<string, unknown>;
    if (typeof r.token !== "string" || typeof r.available !== "boolean") return [];
    return [
      {
        token: r.token,
        available: r.available,
        retryAfterSeconds:
          typeof r.retry_after_seconds === "number" ? r.retry_after_seconds : undefined,
      },
    ];
  });
}

export async function getRecentDrips(baseUrl: string, limit = 10): Promise<RecentDrip[]> {
  const data = await get<{ items: unknown[] }>(
    baseUrl,
    `/api/v2/faucet/drips/recent?limit=${limit}`,
  );
  if (!Array.isArray(data.items)) throw new Error("Unexpected recent drips response shape");
  return data.items.flatMap((t) => {
    if (t === null || typeof t !== "object") return [];
    const r = t as Record<string, unknown>;
    if (
      typeof r.address !== "string" ||
      typeof r.token !== "string" ||
      typeof r.amount !== "string" ||
      !isDripKind(r.kind) ||
      typeof r.created_at !== "string"
    ) {
      return [];
    }
    return [
      {
        address: r.address,
        token: r.token,
        amount: r.amount,
        kind: r.kind,
        createdAt: r.created_at,
      },
    ];
  });
}

export async function requestDrip(
  baseUrl: string,
  address: string,
  token: string,
): Promise<DripReceipt> {
  const res = await fetch(`${baseUrl}/api/v2/faucet/drip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, token }),
  });
  const text = await res.text();

  if (res.status === 404) throw new NotRegisteredError();
  if (res.status === 429) {
    let retryAfter = 0;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.retry_after_seconds === "number") retryAfter = parsed.retry_after_seconds;
    } catch {
      // body wasn't JSON — treat as unknown cooldown
    }
    throw new CooldownActiveError(retryAfter);
  }
  if (res.status === 503) throw new FaucetDrainedError();
  if (!res.ok) throw new Error(`${res.status}: ${errorMessage(text)}`);

  const data = JSON.parse(text) as Record<string, unknown>;
  if (!isDripKind(data.kind) || typeof data.amount !== "string" || typeof data.token !== "string") {
    throw new Error("Unexpected drip response shape");
  }
  return {
    kind: data.kind,
    amount: data.amount,
    token: data.token,
    txId: typeof data.tx_id === "string" ? data.tx_id : undefined,
    contractId: typeof data.contract_id === "string" ? data.contract_id : undefined,
    expiresAt: typeof data.expires_at === "string" ? data.expires_at : undefined,
    nextAvailableAt:
      typeof data.next_available_at === "string" ? data.next_available_at : undefined,
  };
}
