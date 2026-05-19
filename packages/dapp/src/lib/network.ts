import { addEthChain, getEthereum, switchEthChain } from "./ethereum";
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

// MetaMask error code for "chain has not been added to the wallet" (EIP-3326).
const CHAIN_NOT_ADDED = 4902;

function errorCode(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const c = (err as { code: unknown }).code;
    return typeof c === "number" ? c : undefined;
  }
  return undefined;
}

// Ensures MetaMask is on `network`'s chain. Uses the EIP-3326 switch-first
// pattern: switch_chain succeeds when the chain is already added (regardless
// of whether MM was using it before this call), and only falls back to
// wallet_addEthereumChain when MM doesn't yet know the chain. Without this,
// re-adding a chain whose nativeCurrency.symbol has drifted between dApp
// versions surfaces as `-32602 nativeCurrency.symbol does not match ...`,
// because wallet_addEthereumChain refuses to overwrite an existing chain's
// metadata.
export async function ensureChainAdded(network: NetworkConfig): Promise<string> {
  const target = await targetChainId(network);
  const current = (
    (await getEthereum().request({ method: "eth_chainId" })) as string
  ).toLowerCase();
  if (current === target) return target;

  try {
    await switchEthChain(target);
    return target;
  } catch (err) {
    if (errorCode(err) !== CHAIN_NOT_ADDED) throw err;
  }

  await addEthChain({
    chainId: target,
    chainName: network.name,
    rpcUrls: [`${network.middlewareUrl}/eth`],
    nativeCurrency: network.nativeCurrency,
  });
  return target;
}
