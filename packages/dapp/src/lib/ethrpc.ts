let _rpcId = 0;

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function padAddress(address: string): string {
  return "0x000000000000000000000000" + address.replace(/^0x/i, "").toLowerCase();
}

function encodeBalanceOf(address: string): string {
  return "0x70a08231" + address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to, data }, "latest"],
      id: ++_rpcId,
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message as string);
  return json.result as string;
}

export async function getTokenBalance(
  rpcUrl: string,
  tokenAddress: string,
  holderAddress: string,
): Promise<bigint> {
  const result = await ethCall(rpcUrl, tokenAddress, encodeBalanceOf(holderAddress));
  if (!result || result === "0x") return 0n;
  return BigInt(result);
}

export function encodeTransfer(to: string, amount: bigint): string {
  const toEncoded = to.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  const amountEncoded = amount.toString(16).padStart(64, "0");
  return "0xa9059cbb" + toEncoded + amountEncoded;
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const [whole, frac = ""] = value.trim().split(".");
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export async function ethChainId(rpcUrl: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: ++_rpcId }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message as string);
  return json.result as string;
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockTimestamp: string; // added by canton-middleware PR #241
  transactionHash: string;
  logIndex: string;
}

export interface TransferLog {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: number;
  direction: "sent" | "received";
  tokenAddress: string;
  amount: bigint;
  from: string;
  to: string;
}

async function ethGetLogs(rpcUrl: string, filter: unknown): Promise<RawLog[]> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [filter],
      id: ++_rpcId,
    }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return (json.result as RawLog[]) ?? [];
}

async function ethBlockNumber(rpcUrl: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: ++_rpcId,
    }),
  });
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result ?? "0x0";
}

export async function getTransferLogs(
  rpcUrl: string,
  tokenAddresses: string[],
  userAddress: string,
): Promise<TransferLog[]> {
  if (tokenAddresses.length === 0) return [];

  const paddedUser = padAddress(userAddress);
  // TODO: replace fromBlock "0x0" with block-range pagination once chain history grows
  const toBlock = await ethBlockNumber(rpcUrl);

  const [sentRaw, receivedRaw] = await Promise.all([
    ethGetLogs(rpcUrl, {
      fromBlock: "0x0",
      toBlock,
      address: tokenAddresses,
      topics: [ERC20_TRANSFER_TOPIC, paddedUser],
    }),
    ethGetLogs(rpcUrl, {
      fromBlock: "0x0",
      toBlock,
      address: tokenAddresses,
      topics: [ERC20_TRANSFER_TOPIC, null, paddedUser],
    }),
  ]);

  // self-transfers appear in both queries — keep them under "sent" only
  const sentKeys = new Set(sentRaw.map((l) => `${l.transactionHash}-${l.logIndex}`));
  const uniqueReceived = receivedRaw.filter(
    (l) => !sentKeys.has(`${l.transactionHash}-${l.logIndex}`),
  );

  const allLogs = [
    ...sentRaw.map((l) => ({ ...l, direction: "sent" as const })),
    ...uniqueReceived.map((l) => ({ ...l, direction: "received" as const })),
  ];

  return allLogs
    .filter((l) => l.topics.length >= 3)
    .map((l) => ({
      txHash: l.transactionHash,
      blockNumber: parseInt(l.blockNumber, 16),
      logIndex: parseInt(l.logIndex, 16),
      timestamp: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : 0,
      direction: l.direction,
      tokenAddress: l.address.toLowerCase(),
      amount: l.data && l.data !== "0x" ? BigInt(l.data) : 0n,
      from: "0x" + l.topics[1].slice(26),
      to: "0x" + l.topics[2].slice(26),
    }))
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr =
    frac === 0n ? "" : "." + frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return whole.toLocaleString() + fracStr;
}
