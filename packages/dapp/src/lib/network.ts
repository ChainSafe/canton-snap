import { addEthChain, getEthereum } from "./ethereum";
import { ethChainId } from "./ethrpc";
import type { NetworkConfig } from "./config";

// Per-middleware cache of the target chainId. Avoids re-hitting the /eth RPC
// on every re-render or every token import — the chainId of a deployed
// Canton network does not change at runtime.
const chainIdCache = new Map<string, string>();

async function targetChainId(network: NetworkConfig): Promise<string> {
  const cached = chainIdCache.get(network.middlewareUrl);
  if (cached) return cached;
  const fetched = (await ethChainId(`${network.middlewareUrl}/eth`)).toLowerCase();
  chainIdCache.set(network.middlewareUrl, fetched);
  return fetched;
}

// Ensures MetaMask is on `network`'s chain, prompting the wallet_addEthereumChain
// flow when it isn't. Returns the target chainId. Callers that need to dedupe
// repeated prompts (e.g. after user rejection) should do so at the call site —
// this helper is intentionally stateless beyond the chainId cache.
export async function ensureChainAdded(network: NetworkConfig): Promise<string> {
  const target = await targetChainId(network);
  const current = (
    (await getEthereum().request({ method: "eth_chainId" })) as string
  ).toLowerCase();
  if (current === target) return target;
  await addEthChain({
    chainId: target,
    chainName: network.name,
    rpcUrls: [`${network.middlewareUrl}/eth`],
    nativeCurrency: network.nativeCurrency,
  });
  return target;
}
