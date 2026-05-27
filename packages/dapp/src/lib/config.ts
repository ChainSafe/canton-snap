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
