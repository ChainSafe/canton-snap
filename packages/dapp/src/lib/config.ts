export interface NetworkConfig {
  id: string;
  name: string;
  color: string;
  /** Human-readable host shown in the switcher */
  host: string;
  /** Base URL for the Canton middleware REST API */
  middlewareUrl: string;
}

export type NetworkId = 'mainnet' | 'devnet' | 'local';

export const NETWORKS: NetworkConfig[] = [
  {
    id: 'local',
    name: 'Canton Local',
    color: '#60a5fa',
    host: import.meta.env.VITE_LOCAL_HOST ?? 'localhost:8081',
    middlewareUrl: import.meta.env.VITE_LOCAL_MIDDLEWARE_URL ?? 'http://localhost:8081',
  },
];

export const DEFAULT_NETWORK: NetworkId =
  (import.meta.env.VITE_DEFAULT_NETWORK as NetworkId | undefined) ?? 'local';

export function getNetwork(id: NetworkId): NetworkConfig {
  return NETWORKS.find(n => n.id === id) ?? NETWORKS[0];
}
