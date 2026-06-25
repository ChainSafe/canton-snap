// SPDX-License-Identifier: Apache-2.0

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface NetworkConfig {
  id: string;
  name: string;
  color: string;
  /** Human-readable host shown in the network pill */
  host: string;
  /** Base URL for the Canton middleware REST API */
  middlewareUrl: string;
  /** Native currency metadata used for wallet_addEthereumChain */
  nativeCurrency: NativeCurrency;
}

function hostFromUrl(url: string, fallback: string): string {
  try {
    return new URL(url).host;
  } catch {
    return fallback;
  }
}

const NETWORK_PRESETS: Record<string, { name: string; color: string }> = {
  mainnet: { name: "Canton Mainnet", color: "#10b981" },
  devnet: { name: "Canton Devnet", color: "#a78bfa" },
  local: { name: "Canton Local", color: "#60a5fa" },
};

const CANTON_NATIVE_CURRENCY: NativeCurrency = {
  name: "Canton",
  symbol: "CANTON",
  decimals: 18,
};

const id = import.meta.env.VITE_NETWORK ?? "local";
const middlewareUrl = import.meta.env.VITE_MIDDLEWARE_URL ?? "http://localhost:8081";
const preset = NETWORK_PRESETS[id] ?? { name: `Canton ${id}`, color: "#60a5fa" };

export const NETWORK: NetworkConfig = {
  id,
  name: preset.name,
  color: preset.color,
  host: hostFromUrl(middlewareUrl, id),
  middlewareUrl,
  nativeCurrency: CANTON_NATIVE_CURRENCY,
};

// Tokens whose transfers are offer-based: the recipient must accept, so the
// sender sets an offer validity (expiry) and can reclaim it if it lapses.
// Everything else settles directly, so the Transfer UI hides the expiry field
// for those. USDCx is the only offer-based token today — add symbols here as
// more are introduced.
const OFFER_BASED_TOKENS: readonly string[] = ["USDCX"];

const OFFER_BASED_TOKEN_SET: ReadonlySet<string> = new Set(
  OFFER_BASED_TOKENS.map((s) => s.toUpperCase()),
);

export function isOfferBasedToken(symbol: string | undefined): boolean {
  return symbol !== undefined && OFFER_BASED_TOKEN_SET.has(symbol.toUpperCase());
}
