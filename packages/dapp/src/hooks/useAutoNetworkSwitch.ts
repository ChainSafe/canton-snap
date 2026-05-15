import { useEffect, useRef } from "react";
import { ensureChainAdded } from "../lib/network";
import type { NetworkConfig } from "../lib/config";

/**
 * Prompts MetaMask to add/switch to `network`'s chain when the selected
 * network changes and MM's current chainId differs from the target. Once a
 * target chain has been prompted for in this session it is not re-prompted —
 * a rejection shouldn't loop on every re-render.
 */
export function useAutoNetworkSwitch(network: NetworkConfig, address: string | null) {
  const prompted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!address) return;
    const key = `${network.id}:${network.middlewareUrl}`;
    if (prompted.current.has(key)) return;
    prompted.current.add(key);

    let cancelled = false;
    (async () => {
      try {
        await ensureChainAdded(network);
        if (cancelled) return;
      } catch {
        // ignore: user may have rejected, MM unreachable, or the target RPC unreachable.
        // The per-token import flow will re-attempt the chain add if needed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [network, address]);
}
