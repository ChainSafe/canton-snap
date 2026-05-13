import { useEffect, useRef } from "react";
import { addEthChain, getEthereum } from "../lib/ethereum";
import { ethChainId } from "../lib/ethrpc";
import type { NetworkConfig } from "../lib/config";

/**
 * Prompts MetaMask to add/switch to `network`'s chain whenever the selected
 * network changes and MM's current chainId differs from the target. Once a
 * target chain has been prompted for in this session it is not re-prompted —
 * a rejection shouldn't loop on every re-render.
 */
export function useAutoNetworkSwitch(network: NetworkConfig, address: string | null) {
  const prompted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    (async () => {
      try {
        const rpcUrl = `${network.middlewareUrl}/eth`;
        const targetChainId = (await ethChainId(rpcUrl)).toLowerCase();
        if (cancelled) return;

        const currentChainId = (
          (await getEthereum().request({ method: "eth_chainId" })) as string
        ).toLowerCase();
        if (cancelled) return;

        if (currentChainId === targetChainId) return;

        const key = `${network.id}:${targetChainId}`;
        if (prompted.current.has(key)) return;
        prompted.current.add(key);

        await addEthChain({
          chainId: targetChainId,
          chainName: network.name,
          rpcUrls: [rpcUrl],
          nativeCurrency: { name: "Canton", symbol: "CANTON", decimals: 18 },
        });
      } catch {
        // ignore: user may have rejected, MM unreachable, or the target RPC unreachable.
        // The per-token import flow will re-attempt the chain add if needed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [network.id, network.middlewareUrl, network.name, address]);
}
