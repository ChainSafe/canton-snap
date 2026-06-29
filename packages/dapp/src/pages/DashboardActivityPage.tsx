// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useMemo } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { Spinner } from "../components/Spinner";
import { CopyButton } from "../components/CopyButton";
import { NETWORK } from "../lib/config";
import { formatTokenAmount } from "../lib/ethrpc";
import { listCompletedTransfers, type CompletedTransfer } from "../lib/transfer";
import { TOKEN_COLORS } from "../lib/tokens";
import { cn } from "../lib/cn";
import styles from "./DashboardActivityPage.module.css";

interface Props {
  address: string;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  /** The signed-in user's Canton party id — used to label rows Sent vs Received. */
  cantonPartyId: string;
}

interface ActivityState {
  url: string;
  address: string;
  rows: CompletedTransfer[];
  total: number;
  page: number;
  hasMore: boolean;
  error: string | null;
}

function ArrowUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
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
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
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

export function DashboardActivityPage({
  address,
  activeTab,
  onTabChange,
  onDisconnect,
  cantonPartyId,
}: Props) {
  const [state, setState] = useState<ActivityState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loading = state?.url !== NETWORK.middlewareUrl || state?.address !== address;

  // Load the first page of settled history for this address. Refetches from
  // scratch when the address (or network) changes.
  useEffect(() => {
    let cancelled = false;
    const url = NETWORK.middlewareUrl;
    listCompletedTransfers(url, address, 1)
      .then((p) => {
        if (cancelled) return;
        setState({
          url,
          address,
          rows: p.items,
          total: p.total,
          page: p.page,
          hasMore: p.hasMore,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          url,
          address,
          rows: [],
          total: 0,
          page: 1,
          hasMore: false,
          error: (e as Error).message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function loadMore() {
    if (!state || loadingMore || !state.hasMore) return;
    setLoadingMore(true);
    try {
      const next = await listCompletedTransfers(NETWORK.middlewareUrl, address, state.page + 1);
      setState((s) =>
        s
          ? {
              ...s,
              rows: [...s.rows, ...next.items],
              page: next.page,
              hasMore: next.hasMore,
              total: next.total,
            }
          : s,
      );
    } catch {
      // Leave the existing list in place; the user can retry Load more.
    } finally {
      setLoadingMore(false);
    }
  }

  const me = useMemo(() => truncateParty(cantonPartyId), [cantonPartyId]);
  const rows = useMemo(() => state?.rows ?? [], [state]);

  // Group rows by calendar day, preserving the server's newest-first order.
  const groups = useMemo(() => {
    const map = new Map<string, CompletedTransfer[]>();
    for (const row of rows) {
      const key = dayKey(row.timestamp);
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [rows]);

  return (
    <>
      <AmbientOrb opacity={0.1} size={880} x="80%" y="33%" />
      <DashboardLayout
        address={address}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onDisconnect={onDisconnect}
      >
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Activity</h1>
          <p className={styles.pageSubtitle}>Settled transfer history on Canton Network.</p>
        </div>

        <div className={styles.colHeaders}>
          <span>TYPE</span>
          <span>TOKEN</span>
          <span>AMOUNT</span>
          <span>PARTY</span>
          <span>LEDGER TX</span>
          <span className={styles.colRight}>DATE</span>
        </div>

        <div className={styles.card}>
          {loading && (
            <div className={styles.centred}>
              <Spinner />
            </div>
          )}

          {!loading && state?.error && (
            <div className={styles.centred}>
              <p className={styles.errorText}>{state.error}</p>
            </div>
          )}

          {!loading && state && !state.error && rows.length === 0 && (
            <div className={styles.centred}>
              <p className={styles.hint}>No transfers yet for this party.</p>
            </div>
          )}

          {!loading &&
            state &&
            !state.error &&
            rows.length > 0 &&
            groups.map(({ key, items }) => (
              <div key={key}>
                <div className={styles.dayGroup}>{dayLabel(items[0].timestamp)}</div>
                {items.map((row, i) => {
                  const sent = row.fromPartyId === me;
                  const counterparty = sent ? row.toPartyId : row.fromPartyId;
                  const symbol = row.symbol ?? row.instrumentId;
                  const amount =
                    row.decimals !== undefined
                      ? formatTokenAmount(
                          parseAmountToBigInt(row.amount, row.decimals),
                          row.decimals,
                        )
                      : row.amount;
                  return (
                    <div key={row.contractId}>
                      {i > 0 && <div className={styles.rowDivider} />}
                      <div className={styles.activityRow}>
                        {/* Type */}
                        <div className={styles.typeCell}>
                          <div
                            className={cn(
                              styles.typeIcon,
                              sent ? styles.iconSent : styles.iconReceived,
                            )}
                          >
                            {sent ? <ArrowUpIcon /> : <ArrowDownIcon />}
                          </div>
                          <span className={styles.typeLabel}>{sent ? "Sent" : "Received"}</span>
                        </div>

                        {/* Token */}
                        <div className={styles.tokenCell}>
                          <TokenIcon symbol={symbol} />
                          <span className={styles.tokenSymbol}>{symbol}</span>
                        </div>

                        {/* Amount */}
                        <div
                          className={cn(
                            styles.amountValue,
                            sent ? styles.amountSent : styles.amountReceived,
                          )}
                        >
                          {sent ? "−" : "+"}
                          {amount}
                        </div>

                        {/* Party */}
                        <div className={cn(styles.inlineCell, styles.partyCell)}>
                          <span className={styles.prefix}>{sent ? "To" : "From"}</span>
                          <span className={styles.monoValue}>{counterparty}</span>
                          <CopyButton text={counterparty} />
                        </div>

                        {/* Ledger tx */}
                        <div className={cn(styles.inlineCell, styles.txCell)}>
                          <span className={cn(styles.prefix, styles.txPrefix)}>Tx</span>
                          {row.txId ? (
                            <>
                              {/* Display is clipped by CSS ellipsis; the copy
                                  button still puts the full id on the clipboard. */}
                              <span className={styles.monoValue}>{row.txId}</span>
                              <CopyButton text={row.txId} />
                            </>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </div>

                        {/* Date */}
                        <div className={styles.whenCell}>
                          {relativeTime(row.timestamp)} ·{" "}
                          <span className={styles.whenAbs}>{timeLocal(row.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {!loading && state && !state.error && rows.length > 0 && (
            <div className={styles.footer}>
              <span className={styles.footerCount}>
                Showing {rows.length} of {state.total} transfer{state.total !== 1 ? "s" : ""}
              </span>
              {state.hasMore && (
                <button
                  className={styles.loadMore}
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}

// ── helpers ──

// Mirrors the middleware's party-id truncation (head 8 + "…" + tail 8) so the
// signed-in party matches the truncated `from`/`to` the API returns.
function truncateParty(partyId: string): string {
  const head = 8;
  const tail = 8;
  if (partyId.length <= head + tail + 1) return partyId;
  return partyId.slice(0, head) + "…" + partyId.slice(-tail);
}

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

function timeLocal(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayKey(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "unknown";
  return new Date(ts).toDateString();
}

function dayLabel(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "UNKNOWN";
  const d = new Date(ts);
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

// Parse a decimal string ("12.5") into the smallest-unit bigint for `decimals`.
function parseAmountToBigInt(amount: string, decimals: number): bigint {
  const [whole, fracRaw = ""] = amount.split(".");
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const digits = (whole + frac).replace(/^0+(?=\d)/, "") || "0";
  try {
    return BigInt(digits);
  } catch {
    return 0n;
  }
}
