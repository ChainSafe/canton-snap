let _rpcId = 0;

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

export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr =
    frac === 0n ? "" : "." + frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return whole.toLocaleString() + fracStr;
}
