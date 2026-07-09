// SPDX-License-Identifier: Apache-2.0

export interface NetworkConfig {
  id: string;
  name: string;
  color: string;
  /** Base URL for the Canton middleware REST API */
  middlewareUrl: string;
}

const NETWORK_PRESETS: Record<string, { name: string; color: string }> = {
  mainnet: { name: "Canton Mainnet", color: "#10b981" },
  devnet: { name: "Canton Devnet", color: "#a78bfa" },
  local: { name: "Canton Local", color: "#60a5fa" },
};

const id = import.meta.env.VITE_NETWORK ?? "local";
const middlewareUrl = import.meta.env.VITE_MIDDLEWARE_URL ?? "http://localhost:8081";
const preset = NETWORK_PRESETS[id] ?? { name: `Canton ${id}`, color: "#60a5fa" };

export const NETWORK: NetworkConfig = {
  id,
  name: preset.name,
  color: preset.color,
  middlewareUrl,
};
