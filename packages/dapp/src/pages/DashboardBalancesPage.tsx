import { useState, useEffect } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { Spinner } from "../components/Spinner";
import { getNetwork, type NetworkId } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import { getTokenBalance, formatTokenAmount } from "../lib/ethrpc";
import { TOKEN_COLORS } from "../lib/tokens";
import styles from "./DashboardBalancesPage.module.css";

interface TokenRow {
  token: TokenConfig;
  balance: bigint;
}

type FetchState =
  | { url: string; address: string; rows: TokenRow[]; error: null }
  | { url: string; address: string; rows: null; error: string };

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
}

function TokenIcon({ symbol }: { symbol: string }) {
  const colors = TOKEN_COLORS[symbol.toUpperCase()] ?? { bg: "#656a8a", text: "#ffffff" };
  return (
    <div className={styles.tokenIconCircle} style={{ background: colors.bg, color: colors.text }}>
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

export function DashboardBalancesPage({
  address,
  network,
  onNetworkChange,
  activeTab,
  onTabChange,
  onDisconnect,
}: Props) {
  const [fetchState, setFetchState] = useState<FetchState | null>(null);

  const currentNet = getNetwork(network);
  const loading = fetchState?.url !== currentNet.middlewareUrl || fetchState?.address !== address;

  useEffect(() => {
    let cancelled = false;
    const rpcUrl = `${currentNet.middlewareUrl}/eth`;

    getTokens(currentNet.middlewareUrl)
      .then((tokens) =>
        Promise.all(
          tokens.map(async (token) => ({
            token,
            balance: await getTokenBalance(rpcUrl, token.address, address),
          })),
        ),
      )
      .then((rows) => {
        if (!cancelled)
          setFetchState({ url: currentNet.middlewareUrl, address, rows, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setFetchState({
            url: currentNet.middlewareUrl,
            address,
            rows: null,
            error: (e as Error).message,
          });
      });

    return () => {
      cancelled = true;
    };
  }, [currentNet.middlewareUrl, address]);

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
        {/* Page heading + CTA */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Balances</h1>
            <p className={styles.pageSubtitle}>Canton Network tokens held by this party.</p>
          </div>
          <button className={styles.sendBtn} disabled>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8H13M9 4L13 8L9 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Send tokens
          </button>
        </div>

        {/* Token card */}
        <div className={styles.card}>
          {/* Column headers */}
          <div className={styles.colHeaders}>
            <span>TOKEN</span>
            <span className={styles.colBalance}>BALANCE</span>
            <span />
          </div>

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

          {!loading && fetchState?.rows && fetchState.rows.length === 0 && (
            <div className={styles.centred}>
              <p className={styles.hint}>No tokens configured on this network.</p>
            </div>
          )}

          {!loading && fetchState?.rows && fetchState.rows.length > 0 && (
            <>
              {fetchState.rows.map(({ token, balance }, i) => (
                <div key={token.address}>
                  {i > 0 && <div className={styles.rowDivider} />}
                  <div className={styles.tokenRow}>
                    <div className={styles.tokenInfo}>
                      <TokenIcon symbol={token.symbol} />
                      <div className={styles.tokenText}>
                        <p className={styles.tokenSymbol}>{token.symbol}</p>
                        <p className={styles.tokenName}>{token.name}</p>
                      </div>
                    </div>
                    <div className={styles.balanceInfo}>
                      <p className={styles.amount}>{formatTokenAmount(balance, token.decimals)}</p>
                      <p className={styles.amountLabel}>{token.symbol}</p>
                    </div>
                    <button className={styles.sendRowBtn} disabled>
                      Send →
                    </button>
                  </div>
                </div>
              ))}

              <div className={styles.rowDivider} />
              <p className={styles.hint}>
                More tokens supported by the middleware will appear here as they're added.
              </p>
            </>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}
