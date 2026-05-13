import { useState, useEffect } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { PageCard } from "../components/PageCard";
import { Spinner } from "../components/Spinner";
import { getNetwork, type NetworkId } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import { getTokenBalance, formatTokenAmount } from "../lib/ethrpc";
import { TOKEN_COLORS } from "../lib/tokens";
import { useMetaMaskImport, type ImportStatus } from "../hooks/useMetaMaskImport";
import { cn } from "../lib/cn";
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

/** Wallet outline with a "+" — signals "add token". */
function WalletPlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="5"
        width="15"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2.5 9H17.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M14 11.5V14M12.75 12.75H15.25"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.5L5.5 10.5L11.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M11.5 6.5C11.5 9 9.5 11 7 11C4.5 11 2.5 9 2.5 6.5C2.5 4 4.5 2 7 2C8.7 2 10.2 3 10.9 4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M11 1.5V4.5H8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AddTokenIconButton({
  status,
  symbol,
  error,
  onClick,
}: {
  status: ImportStatus;
  symbol: string;
  error?: string;
  onClick: () => void;
}) {
  if (status === "pending") {
    return (
      <button
        className={styles.addRowBtn}
        disabled
        aria-label={`Adding ${symbol} to MetaMask`}
        title={`Adding ${symbol} to MetaMask…`}
      >
        <span className={styles.addRowSpinner} />
      </button>
    );
  }
  if (status === "success") {
    return (
      <button
        className={cn(styles.addRowBtn, styles.addRowBtnSuccess)}
        onClick={onClick}
        aria-label={`${symbol} added to MetaMask. Click to add again.`}
        title={`${symbol} added to MetaMask`}
      >
        <CheckIcon />
      </button>
    );
  }
  if (status === "error") {
    return (
      <button
        className={cn(styles.addRowBtn, styles.addRowBtnError)}
        onClick={onClick}
        aria-label={`Retry adding ${symbol} to MetaMask`}
        title={error ? `Retry — ${error}` : "Retry"}
      >
        <RetryIcon />
      </button>
    );
  }
  return (
    <button
      className={styles.addRowBtn}
      onClick={onClick}
      aria-label={`Add ${symbol} to MetaMask`}
      title={`Add ${symbol} to MetaMask`}
    >
      <WalletPlusIcon />
    </button>
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

  const mmImport = useMetaMaskImport(currentNet, address);

  useEffect(() => {
    let cancelled = false;
    const rpcUrl = `${currentNet.middlewareUrl}/eth`;

    getTokens(currentNet.middlewareUrl)
      .then((tokens) =>
        Promise.all(
          tokens.map(async (token) => ({
            token,
            balance: await getTokenBalance(rpcUrl, token.address, address).catch(() => 0n),
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
          <button className={styles.sendBtn} onClick={() => onTabChange("transfer")}>
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
        <PageCard className={styles.card}>
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
              {fetchState.rows.map(({ token, balance }, i) => {
                const tokenState = mmImport.tokenStates[token.address];
                return (
                  <div key={token.address}>
                    {i > 0 && <div className={styles.rowDivider} />}
                    <div className={styles.tokenRow}>
                      <div className={styles.tokenInfo}>
                        <TokenIcon symbol={token.symbol} />
                        <div className={styles.tokenText}>
                          <p className={styles.tokenSymbol}>{token.symbol}</p>
                          <p className={styles.tokenName}>{token.name}</p>
                        </div>
                        <AddTokenIconButton
                          status={tokenState?.status ?? "idle"}
                          symbol={token.symbol}
                          error={tokenState?.error}
                          onClick={() => void mmImport.importToken(token)}
                        />
                      </div>
                      <div className={styles.balanceInfo}>
                        <p className={styles.amount}>
                          {formatTokenAmount(balance, token.decimals)}
                        </p>
                        <p className={styles.amountLabel}>{token.symbol}</p>
                      </div>
                      <button
                        className={styles.sendRowBtn}
                        onClick={() => onTabChange("transfer")}
                      >
                        Send →
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className={styles.rowDivider} />
              <p className={styles.hint}>
                More tokens supported by the middleware will appear here as they're added.
              </p>
            </>
          )}
        </PageCard>
      </DashboardLayout>
    </>
  );
}
