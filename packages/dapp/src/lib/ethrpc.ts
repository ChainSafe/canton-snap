// SPDX-License-Identifier: Apache-2.0

let _rpcId = 0;

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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
  if (!res.ok) throw new Error(`RPC error ${res.status}: ${await res.text()}`);
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
  const parts = value.trim().split(".");
  if (parts.length > 2) throw new Error("Invalid amount format");
  const whole = (parts[0] ?? "").replace(/,/g, "");
  const frac = parts[1] ?? "";
  if (frac.length > decimals) throw new Error("Too many decimal places");
  const fracPadded = frac.padEnd(decimals, "0");
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

export interface TxReceipt {
  status: "success" | "failed";
  blockNumber: number;
  revertReason?: string;
}

// Returns null while the tx is still pending in the mempool. canton-middleware
// PR #281 made `eth_sendRawTransaction` async, so a hash is returned before the
// receipt exists. `revertReason` is a non-standard field surfaced for
// status=0 receipts so we can show the Canton-side error.
export async function getTransactionReceipt(
  rpcUrl: string,
  txHash: string,
): Promise<TxReceipt | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txHash],
      id: ++_rpcId,
    }),
  });
  if (!res.ok) throw new Error(`RPC error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    result?: {
      status?: string;
      blockNumber?: string;
      revertReason?: string;
    } | null;
    error?: { message: string };
  } | null;
  if (!json || typeof json !== "object") throw new Error("Invalid RPC response");
  if (json.error) throw new Error(json.error.message);
  if (!json.result) return null;
  const status = json.result.status === "0x1" ? "success" : "failed";
  return {
    status,
    blockNumber: json.result.blockNumber ? parseInt(json.result.blockNumber, 16) : 0,
    revertReason: json.result.revertReason,
  };
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

export async function getTransferLogs(
  rpcUrl: string,
  tokenAddresses: string[],
  userAddress: string,
): Promise<TransferLog[]> {
  if (tokenAddresses.length === 0) return [];

  const userAddrLower = userAddress.toLowerCase();

  // Query one address at a time: the middleware address filter only accepts a
  // single string. fromBlock/toBlock are omitted so the middleware defaults to
  // the full range (0 → latest). topic1/topic2 filtering is not supported
  // server-side, so sent/received direction is determined client-side.
  const perToken = await Promise.all(
    tokenAddresses.map((addr) =>
      ethGetLogs(rpcUrl, {
        address: addr,
        topics: [ERC20_TRANSFER_TOPIC],
      }),
    ),
  );

  const logs: TransferLog[] = [];
  for (const raw of perToken.flat()) {
    if (raw.topics.length < 3) continue;
    const from = ("0x" + raw.topics[1].slice(26)).toLowerCase();
    const to = ("0x" + raw.topics[2].slice(26)).toLowerCase();
    if (from !== userAddrLower && to !== userAddrLower) continue;
    logs.push({
      txHash: raw.transactionHash,
      blockNumber: parseInt(raw.blockNumber, 16),
      logIndex: parseInt(raw.logIndex, 16),
      timestamp: raw.blockTimestamp ? parseInt(raw.blockTimestamp, 16) : 0,
      direction: from === userAddrLower ? "sent" : "received",
      tokenAddress: raw.address.toLowerCase(),
      amount: raw.data && raw.data !== "0x" ? BigInt(raw.data) : 0n,
      from,
      to,
    });
  }

  return logs.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
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
