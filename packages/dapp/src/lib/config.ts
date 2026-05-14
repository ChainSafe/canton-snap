export interface NetworkConfig {
  id: string;
  name: string;
  color: string;
  /** Human-readable host shown in the switcher */
  host: string;
  /** Base URL for the Canton middleware REST API */
  middlewareUrl: string;
}

export type NetworkId = "mainnet" | "devnet" | "local";

function hostFromUrl(url: string, fallback: string): string {
  try {
    return new URL(url).host;
  } catch {
    return fallback;
  }
}

const DEVNET_MIDDLEWARE_URL = import.meta.env.VITE_DEVNET_MIDDLEWARE_URL ?? "";
const LOCAL_MIDDLEWARE_URL =
  import.meta.env.VITE_LOCAL_MIDDLEWARE_URL ?? "http://localhost:8081";

export const NETWORKS: NetworkConfig[] = [
  ...(DEVNET_MIDDLEWARE_URL
    ? [
        {
          id: "devnet",
          name: "Canton Devnet",
          color: "#a78bfa",
          host:
            import.meta.env.VITE_DEVNET_HOST ??
            hostFromUrl(DEVNET_MIDDLEWARE_URL, "devnet"),
          middlewareUrl: DEVNET_MIDDLEWARE_URL,
        },
      ]
    : []),
  {
    id: "local",
    name: "Canton Local",
    color: "#60a5fa",
    host: import.meta.env.VITE_LOCAL_HOST ?? hostFromUrl(LOCAL_MIDDLEWARE_URL, "localhost:8081"),
    middlewareUrl: LOCAL_MIDDLEWARE_URL,
  },
];

export const DEFAULT_NETWORK: NetworkId =
  (import.meta.env.VITE_DEFAULT_NETWORK as NetworkId | undefined) ?? "local";

export function getNetwork(id: NetworkId): NetworkConfig {
  return NETWORKS.find((n) => n.id === id) ?? NETWORKS[0];
}
