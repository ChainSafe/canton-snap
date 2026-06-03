// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useMemo } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { Spinner } from "../components/Spinner";
import { NETWORK } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import {
  getTransferLogs,
  getTransactionReceipt,
  formatTokenAmount,
  type TransferLog,
} from "../lib/ethrpc";
import {
  getPendingTxs,
  removePendingTx,
  markPendingFailed,
  type PendingTx,
} from "../lib/pendingTxs";
import { TOKEN_COLORS } from "../lib/tokens";
import { toChecksumAddress, shortenAddress } from "../lib/ethereum";
import { CopyButton } from "../components/CopyButton";
import styles from "./DashboardActivityPage.module.css";

interface Props {
  address: string;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
}

type RowStatus = "confirmed" | "pending" | "failed";

interface ActivityRow extends TransferLog {
  token: TokenConfig;
  status: RowStatus;
  revertReason?: string;
}

type FetchState =
  | { url: string; address: string; rows: ActivityRow[]; error: null }
  | { url: string; address: string; rows: null; error: string };

const RECEIPT_POLL_INTERVAL_MS = 4000;

function pendingToRow(p: PendingTx): ActivityRow {
  return {
    txHash: p.txHash,
    // Pending entries have no block yet; sentinel keeps sort order (newest first).
    blockNumber: Number.MAX_SAFE_INTEGER,
    logIndex: 0,
    timestamp: p.submittedAt,
    direction: "sent",
    tokenAddress: p.tokenAddress,
    amount: BigInt(p.amount),
    from: p.from,
    to: p.to,
    token: {
      address: p.tokenAddress,
      name: p.tokenSymbol,
      symbol: p.tokenSymbol,
      decimals: p.tokenDecimals,
    },
    status: p.status === "failed" ? "failed" : "pending",
    revertReason: p.revertReason,
  };
}

// Jan 1 2020 in Unix seconds — anything before this is a synthetic/bogus timestamp
const MIN_REAL_TIMESTAMP = 1577836800;

function relativeTime(ts: number): string {
  if (!ts || ts < MIN_REAL_TIMESTAMP) return "—";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

function timeLocal(ts: number): string {
  if (!ts || ts < MIN_REAL_TIMESTAMP) return "";
  // Render in the viewer's local timezone (timeZoneName shows the local
  // abbreviation, e.g. EDT/GMT+1). Day grouping below also uses local time,
  // so the time shown stays consistent with its day label.
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function dayKey(ts: number): string {
  if (!ts) return "unknown";
  return new Date(ts * 1000).toDateString();
}

function dayLabel(ts: number): string {
  if (!ts) return "UNKNOWN";
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const month = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  if (d.toDateString() === today.toDateString()) return `TODAY · ${month}`;
  if (d.toDateString() === yesterday.toDateString()) return `YESTERDAY · ${month}`;
  return d
    .toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    .toUpperCase();
}

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 15V5M5 10L10 5L15 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 5V15M5 10L10 15L15 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TokenIcon({ symbol }: { symbol: string }) {
  const colors = TOKEN_COLORS[symbol.toUpperCase()] ?? { bg: "#656a8a", text: "#ffffff" };
  return (
    <div className={styles.tokenIcon} style={{ background: colors.bg, color: colors.text }}>
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DashboardActivityPage({ address, activeTab, onTabChange, onDisconnect }: Props) {
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const [search, setSearch] = useState("");

  // Bump to re-read the pending store (localStorage) or re-fetch confirmed logs.
  // Pending is derived state, not local state — the source of truth is
  // localStorage. Components that mutate the store (TransferPage, the polling
  // callback below) write to localStorage, then we read it back here.
  const [pendingTick, setPendingTick] = useState(0);
  const [logsTick, setLogsTick] = useState(0);

  const pending = useMemo(
    () => getPendingTxs(address),
    // pendingTick re-runs the read when the store mutates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, pendingTick],
  );

  const loading = fetchState?.url !== NETWORK.middlewareUrl || fetchState?.address !== address;

  useEffect(() => {
    let cancelled = false;
    const rpcUrl = `${NETWORK.middlewareUrl}/eth`;

    async function load() {
      try {
        const tokens = await getTokens(NETWORK.middlewareUrl);
        const tokenByAddress = new Map(tokens.map((t) => [t.address.toLowerCase(), t]));
        const logs = await getTransferLogs(
          rpcUrl,
          tokens.map((t) => t.address),
          address,
        );
        const rows: ActivityRow[] = logs
          .map((log): ActivityRow | null => {
            const token = tokenByAddress.get(log.tokenAddress);
            if (!token) return null;
            return { ...log, token, status: "confirmed" };
          })
          .filter((r): r is ActivityRow => r !== null);

        if (cancelled) return;

        // Drop pending entries whose confirmed Transfer log just arrived —
        // covers reloads after the receipt landed and any poll the user
        // missed because the tab was hidden.
        const confirmedHashes = new Set(rows.map((r) => r.txHash.toLowerCase()));
        let removed = false;
        for (const p of getPendingTxs(address)) {
          if (confirmedHashes.has(p.txHash.toLowerCase())) {
            removePendingTx(address, p.txHash);
            removed = true;
          }
        }

        setFetchState({ url: NETWORK.middlewareUrl, address, rows, error: null });
        if (removed) setPendingTick((t) => t + 1);
      } catch (e: unknown) {
        if (!cancelled)
          setFetchState({
            url: NETWORK.middlewareUrl,
            address,
            rows: null,
            error: (e as Error).message,
          });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, logsTick]);

  // Poll receipts for entries still in "pending" status. Once a receipt arrives:
  //   status=1 → remove (a confirmed log will appear on next refresh)
  //   status=0 → mark failed and keep so the user sees the outcome
  const hasUnresolved = pending.some((p) => p.status === "pending");

  useEffect(() => {
    if (!hasUnresolved) return;

    const rpcUrl = `${NETWORK.middlewareUrl}/eth`;
    let cancelled = false;

    async function poll() {
      const snapshot = getPendingTxs(address).filter((p) => p.status === "pending");
      if (snapshot.length === 0) return;
      const results = await Promise.all(
        snapshot.map(async (p) => {
          try {
            return [p, await getTransactionReceipt(rpcUrl, p.txHash)] as const;
          } catch {
            return [p, null] as const;
          }
        }),
      );
      if (cancelled) return;

      let resolvedAny = false;
      for (const [p, receipt] of results) {
        if (!receipt) continue;
        resolvedAny = true;
        if (receipt.status === "success") {
          removePendingTx(address, p.txHash);
        } else {
          markPendingFailed(address, p.txHash, receipt.revertReason);
        }
      }
      if (resolvedAny) {
        setPendingTick((t) => t + 1);
        setLogsTick((t) => t + 1);
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), RECEIPT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [hasUnresolved, address]);

  const merged = useMemo(() => {
    const confirmed = fetchState?.rows ?? [];
    const confirmedHashes = new Set(confirmed.map((r) => r.txHash.toLowerCase()));
    const pendingRows = pending
      .filter((p) => !confirmedHashes.has(p.txHash.toLowerCase()))
      .map(pendingToRow);
    // Sort by timestamp (newest first) so failed entries fall into their
    // historical day group rather than always sorting to the top. Within the
    // same block, logIndex breaks ties. blockNumber is a tertiary key for the
    // rare case of two confirmed blocks sharing a timestamp.
    return [...pendingRows, ...confirmed].sort(
      (a, b) =>
        b.timestamp - a.timestamp || b.blockNumber - a.blockNumber || b.logIndex - a.logIndex,
    );
  }, [fetchState, pending]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(
      (r) =>
        r.txHash.toLowerCase().includes(q) ||
        r.from.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q) ||
        r.token.symbol.toLowerCase().includes(q),
    );
  }, [merged, search]);

  // Group rows by calendar day. Only in-flight pending entries land in the
  // dedicated PENDING group; failed entries fall into their submission-day
  // group so the resolved-but-unsuccessful history stays chronological.
  const groups = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const row of filtered) {
      const key = row.status === "pending" ? "__pending__" : dayKey(row.timestamp);
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
  }, [filtered]);

  return (
    <>
      <AmbientOrb opacity={0.1} size={880} x="80%" y="33%" />
      <DashboardLayout
        address={address}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onDisconnect={onDisconnect}
      >
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageTitles}>
            <h1 className={styles.pageTitle}>Activity</h1>
            <p className={styles.pageSubtitle}>Token transfers for this wallet.</p>
          </div>
          <label className={styles.searchBar}>
            <SearchIcon />
            <input
              className={styles.searchInput}
              placeholder="Search by tx hash, address, or token…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {/* Column headers */}
        <div className={styles.colHeaders}>
          <span>TYPE</span>
          <span>TOKEN</span>
          <span>AMOUNT</span>
          <span>TO / FROM</span>
          <span>TX HASH</span>
          <span className={styles.colRight}>DATE</span>
        </div>

        {/* Card */}
        <div className={styles.card}>
          {loading && (
            <div className={styles.centred}>
              <Spinner />
            </div>
          )}

          {!loading && fetchState?.error && (
            <div className={styles.centred}>
              <p className={styles.errorText}>{fetchState.error}</p>
            </div>
          )}

          {!loading && fetchState?.rows && filtered.length === 0 && (
            <div className={styles.centred}>
              <p className={styles.hint}>
                {search.trim()
                  ? "No transfers match your search."
                  : "No transfers found for this address."}
              </p>
            </div>
          )}

          {!loading &&
            fetchState?.rows &&
            filtered.length > 0 &&
            groups.map(({ key, rows }) => (
              <div key={key}>
                <div className={styles.dayGroup}>
                  {key === "__pending__" ? "PENDING" : dayLabel(rows[0].timestamp)}
                </div>
                {rows.map((row, i) => {
                  const isSent = row.direction === "sent";
                  const counterparty = toChecksumAddress(isSent ? row.to : row.from);
                  const shortTx = `${row.txHash.slice(0, 10)}…${row.txHash.slice(-8)}`;
                  const isPending = row.status === "pending";
                  const isFailed = row.status === "failed";

                  return (
                    <div key={`${row.txHash}-${row.logIndex}`}>
                      {i > 0 && <div className={styles.rowDivider} />}
                      <div
                        className={`${styles.activityRow} ${isPending ? styles.rowPending : ""} ${isFailed ? styles.rowFailed : ""}`}
                      >
                        {/* Type */}
                        <div className={styles.typeCell}>
                          <div
                            className={`${styles.typeIcon} ${isSent ? styles.iconSent : styles.iconReceived}`}
                          >
                            {isSent ? <ArrowUpIcon /> : <ArrowDownIcon />}
                          </div>
                          <div className={styles.typeStack}>
                            <span className={styles.typeLabel}>{isSent ? "Sent" : "Received"}</span>
                            {isPending && (
                              <span className={`${styles.statusPill} ${styles.statusPillPending}`}>
                                <span className={styles.statusDot} />
                                Pending
                              </span>
                            )}
                            {isFailed && (
                              <span
                                className={`${styles.statusPill} ${styles.statusPillFailed}`}
                                title={row.revertReason}
                              >
                                Failed
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Token */}
                        <div className={styles.tokenCell}>
                          <TokenIcon symbol={row.token.symbol} />
                          <span className={styles.tokenSymbol}>{row.token.symbol}</span>
                        </div>

                        {/* Amount */}
                        <div className={styles.amountCell}>
                          <span
                            className={`${styles.amountValue} ${isSent ? styles.amountSent : styles.amountReceived}`}
                          >
                            {isSent ? "−" : "+"}
                            {formatTokenAmount(row.amount, row.token.decimals)}
                          </span>
                        </div>

                        {/* To / From */}
                        <div className={styles.addrCell}>
                          <span className={styles.addrLabel}>{isSent ? "To" : "From"}</span>
                          <div className={styles.addrRow}>
                            <span className={styles.addrValue}>
                              {shortenAddress(counterparty, 5)}
                            </span>
                            <CopyButton text={counterparty} />
                          </div>
                        </div>

                        {/* Tx hash */}
                        <div className={styles.addrCell}>
                          <span className={styles.addrLabel}>Tx</span>
                          <div className={styles.addrRow}>
                            <span className={styles.addrValue}>{shortTx}</span>
                            <CopyButton text={row.txHash} />
                          </div>
                        </div>

                        {/* Date */}
                        <div className={styles.whenCell}>
                          <span className={styles.whenRelative}>{relativeTime(row.timestamp)}</span>
                          <span className={styles.whenAbsolute}>
                            {isPending
                              ? "Awaiting receipt"
                              : isFailed
                                ? "Reverted"
                                : row.timestamp >= MIN_REAL_TIMESTAMP
                                  ? timeLocal(row.timestamp)
                                  : `Block #${row.blockNumber}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {!loading && fetchState?.rows && filtered.length > 0 && (
            <div className={styles.footer}>
              <span className={styles.footerCount}>
                Showing {filtered.length} transfer{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}
