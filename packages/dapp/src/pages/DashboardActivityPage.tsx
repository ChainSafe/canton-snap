import { useState, useEffect, useMemo } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { Spinner } from "../components/Spinner";
import { getNetwork, type NetworkId } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import { getTransferLogs, formatTokenAmount, type TransferLog } from "../lib/ethrpc";
import { TOKEN_COLORS } from "../lib/tokens";
import { toChecksumAddress, shortenAddress } from "../lib/ethereum";
import { CopyButton } from "../components/CopyButton";
import styles from "./DashboardActivityPage.module.css";

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
}

interface ActivityRow extends TransferLog {
  token: TokenConfig;
}

type FilterTab = "transfers" | "bridge";

type FetchState =
  | { url: string; address: string; rows: ActivityRow[]; error: null }
  | { url: string; address: string; rows: null; error: string };

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

function timeUTC(ts: number): string {
  if (!ts || ts < MIN_REAL_TIMESTAMP) return "";
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
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

export function DashboardActivityPage({
  address,
  network,
  onNetworkChange,
  activeTab,
  onTabChange,
  onDisconnect,
}: Props) {
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("transfers");
  const [search, setSearch] = useState("");

  const currentNet = getNetwork(network);
  const loading = fetchState?.url !== currentNet.middlewareUrl || fetchState?.address !== address;

  useEffect(() => {
    let cancelled = false;
    const rpcUrl = `${currentNet.middlewareUrl}/eth`;

    async function load() {
      try {
        const tokens = await getTokens(currentNet.middlewareUrl);
        const tokenByAddress = new Map(tokens.map((t) => [t.address.toLowerCase(), t]));
        const logs = await getTransferLogs(
          rpcUrl,
          tokens.map((t) => t.address),
          address,
        );
        const rows: ActivityRow[] = logs
          .map((log) => {
            const token = tokenByAddress.get(log.tokenAddress);
            if (!token) return null;
            return { ...log, token };
          })
          .filter((r): r is ActivityRow => r !== null);

        if (!cancelled)
          setFetchState({ url: currentNet.middlewareUrl, address, rows, error: null });
      } catch (e: unknown) {
        if (!cancelled)
          setFetchState({
            url: currentNet.middlewareUrl,
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
  }, [currentNet.middlewareUrl, address]);

  const filtered = useMemo(() => {
    const rows = fetchState?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.txHash.toLowerCase().includes(q) ||
        r.from.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q) ||
        r.token.symbol.toLowerCase().includes(q),
    );
  }, [fetchState, search]);

  // Group rows by calendar day
  const groups = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const row of filtered) {
      const key = dayKey(row.timestamp);
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
        network={network}
        onNetworkChange={onNetworkChange}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onDisconnect={onDisconnect}
      >
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageTitles}>
            <h1 className={styles.pageTitle}>Activity</h1>
            <p className={styles.pageSubtitle}>
              Token transfers and bridge events for this wallet.
            </p>
          </div>
          <label
            className={`${styles.searchBar} ${filterTab === "bridge" ? styles.searchBarDisabled : ""}`}
          >
            <SearchIcon />
            <input
              className={styles.searchInput}
              placeholder="Search by tx hash, address, or token…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={filterTab === "bridge"}
            />
          </label>
        </div>

        {/* Filter tabs */}
        <div className={styles.filters}>
          <div className={styles.filterTabs}>
            {(["transfers", "bridge"] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                className={`${styles.filterTab} ${filterTab === tab ? styles.filterTabActive : ""}`}
                onClick={() => setFilterTab(tab)}
              >
                {tab === "transfers" ? "Transfers" : "Bridge"}
                {!loading && fetchState?.rows && tab === "transfers" && (
                  <span className={styles.filterTabCount}>{filtered.length}</span>
                )}
              </button>
            ))}
          </div>
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

          {!loading && filterTab === "transfers" && fetchState?.error && (
            <div className={styles.centred}>
              <p className={styles.errorText}>{fetchState.error}</p>
            </div>
          )}

          {!loading && filterTab === "bridge" && (
            <div className={styles.centred}>
              <p className={styles.hint}>Bridge activity coming soon.</p>
            </div>
          )}

          {!loading && filterTab === "transfers" && fetchState?.rows && filtered.length === 0 && (
            <div className={styles.centred}>
              <p className={styles.hint}>
                {search.trim()
                  ? "No transfers match your search."
                  : "No transfers found for this address."}
              </p>
            </div>
          )}

          {!loading &&
            filterTab === "transfers" &&
            fetchState?.rows &&
            filtered.length > 0 &&
            groups.map(({ key, rows }) => (
              <div key={key}>
                <div className={styles.dayGroup}>{dayLabel(rows[0].timestamp)}</div>
                {rows.map((row, i) => {
                  const isSent = row.direction === "sent";
                  const counterparty = toChecksumAddress(isSent ? row.to : row.from);
                  const shortTx = `${row.txHash.slice(0, 10)}…${row.txHash.slice(-8)}`;

                  return (
                    <div key={`${row.txHash}-${row.direction}`}>
                      {i > 0 && <div className={styles.rowDivider} />}
                      <div className={styles.activityRow}>
                        {/* Type */}
                        <div className={styles.typeCell}>
                          <div
                            className={`${styles.typeIcon} ${isSent ? styles.iconSent : styles.iconReceived}`}
                          >
                            {isSent ? <ArrowUpIcon /> : <ArrowDownIcon />}
                          </div>
                          <span className={styles.typeLabel}>{isSent ? "Sent" : "Received"}</span>
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
                            {row.timestamp >= MIN_REAL_TIMESTAMP
                              ? timeUTC(row.timestamp)
                              : `Block #${row.blockNumber}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {!loading && filterTab === "transfers" && fetchState?.rows && filtered.length > 0 && (
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
