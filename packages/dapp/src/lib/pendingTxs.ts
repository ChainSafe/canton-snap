// Tracks locally-submitted outgoing transfers whose receipt hasn't arrived yet.
// canton-middleware PR #281 made `eth_sendRawTransaction` async — the API
// returns a tx hash immediately and the Canton transfer is run by a background
// submitter. Until the miner seals the entry, eth_getLogs has no Transfer log
// for it, so the Activity tab would otherwise show nothing. We persist enough
// metadata in localStorage to render a "pending" row in the meantime.

const STORAGE_PREFIX = "canton-pending-txs:";

export interface PendingTx {
  txHash: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  // ERC-20 raw amount as decimal string (bigint doesn't survive JSON)
  amount: string;
  from: string;
  to: string;
  // Unix seconds; when the entry was submitted from this client
  submittedAt: number;
  status: "pending" | "failed";
  revertReason?: string;
}

function storageKey(address: string): string {
  return STORAGE_PREFIX + address.toLowerCase();
}

function readAll(address: string): PendingTx[] {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PendingTx =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as PendingTx).txHash === "string" &&
        typeof (e as PendingTx).tokenAddress === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(address: string, entries: PendingTx[]): void {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(entries));
  } catch {
    // localStorage quota / disabled — silently drop; pending UI is best-effort
  }
}

export function getPendingTxs(address: string): PendingTx[] {
  return readAll(address);
}

export function recordPendingTx(address: string, entry: Omit<PendingTx, "status">): void {
  const existing = readAll(address);
  if (existing.some((e) => e.txHash.toLowerCase() === entry.txHash.toLowerCase())) return;
  const next = [...existing, { ...entry, status: "pending" as const }];
  writeAll(address, next);
}

export function markPendingFailed(address: string, txHash: string, revertReason?: string): void {
  const existing = readAll(address);
  const next = existing.map((e) =>
    e.txHash.toLowerCase() === txHash.toLowerCase()
      ? { ...e, status: "failed" as const, revertReason }
      : e,
  );
  writeAll(address, next);
}

export function removePendingTx(address: string, txHash: string): void {
  const existing = readAll(address);
  const next = existing.filter((e) => e.txHash.toLowerCase() !== txHash.toLowerCase());
  writeAll(address, next);
}
