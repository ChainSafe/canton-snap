// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { PageCard } from "../components/PageCard";
import { Spinner } from "../components/Spinner";
import { NETWORK } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import { getTokenBalance, formatTokenAmount } from "../lib/ethrpc";
import { TOKEN_COLORS } from "../lib/tokens";
import { useMetaMaskImport, type ImportStatus } from "../hooks/useMetaMaskImport";
import { ImportTokensBanner } from "../components/ImportTokensBanner";
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
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  /** Open the Transfer tab with this token pre-selected. */
  onSendToken: (tokenAddress: string) => void;
}

function TokenIcon({ symbol }: { symbol: string }) {
  const colors = TOKEN_COLORS[symbol.toUpperCase()] ?? { bg: "#656a8a", text: "#ffffff" };
  return (
    <div className={styles.tokenIconCircle} style={{ background: colors.bg, color: colors.text }}>
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

/** MetaMask fox — signals "add this token to MetaMask". */
function MetaMaskFoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* ears */}
      <path d="M4 2.5 L10 6.5 L7.5 8 Z" fill="#E2761B" />
      <path d="M20 2.5 L14 6.5 L16.5 8 Z" fill="#E2761B" />
      {/* head */}
      <path
        d="M7.5 8 L10 6.5 H14 L16.5 8 L18 13.5 L15.5 17 L12 18.5 L8.5 17 L6 13.5 Z"
        fill="#F6851B"
      />
      {/* muzzle */}
      <path d="M8.5 17 L12 18.5 L15.5 17 L14 14.6 H10 Z" fill="#F8E4D0" />
      {/* eyes */}
      <circle cx="10" cy="11.8" r="1.05" fill="#23262E" />
      <circle cx="14" cy="11.8" r="1.05" fill="#23262E" />
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
      <MetaMaskFoxIcon />
    </button>
  );
}

export function DashboardBalancesPage({
  address,
  activeTab,
  onTabChange,
  onDisconnect,
  onSendToken,
}: Props) {
  const [fetchState, setFetchState] = useState<FetchState | null>(null);

  const loading = fetchState?.url !== NETWORK.middlewareUrl || fetchState?.address !== address;

  const mmImport = useMetaMaskImport(NETWORK, address);

  // Fetches the token list + each token's balance and writes the result into
  // `fetchState`. Used by the initial mount effect and again after accepting an
  // offer (so the newly-credited amount is reflected without a page refresh).
  // `isCancelled` lets the caller cancel a stale fetch on unmount/dep change.
  const fetchBalances = useCallback(
    async (isCancelled?: () => boolean) => {
      const url = NETWORK.middlewareUrl;
      const rpcUrl = `${url}/eth`;
      try {
        const tokens = await getTokens(url);
        const rows = await Promise.all(
          tokens.map(async (token) => ({
            token,
            balance: await getTokenBalance(rpcUrl, token.address, address).catch(() => 0n),
          })),
        );
        if (isCancelled?.()) return;
        setFetchState({ url, address, rows, error: null });
      } catch (e) {
        if (isCancelled?.()) return;
        setFetchState({ url, address, rows: null, error: (e as Error).message });
      }
    },
    [address],
  );

  useEffect(() => {
    let cancelled = false;
    // fetchBalances only calls setState after awaited network fetches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchBalances(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchBalances]);

  // "Add to MetaMask" banner — shown until every listed token is marked
  // imported. MetaMask exposes no way to query already-watched assets, so this
  // relies on the hook's best-effort localStorage mirror; if nothing is known
  // yet, the banner stays visible.
  const tokenList = fetchState?.rows?.map((r) => r.token) ?? [];
  const allImported =
    tokenList.length > 0 &&
    tokenList.every((t) => mmImport.tokenStates[t.address]?.status === "success");

  return (
    <>
      <AmbientOrb opacity={0.1} size={880} x="80%" y="33%" />
      <DashboardLayout
        address={address}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onDisconnect={onDisconnect}
        title="Balances"
        subtitle="Canton Network tokens held by this party."
      >
        {/* ── Add tokens to MetaMask (until all imported) ── */}
        {!loading && !allImported && tokenList.length > 0 && (
          <ImportTokensBanner
            variant="banner"
            tokens={tokenList}
            tokenStates={mmImport.tokenStates}
            importingAll={mmImport.importingAll}
            onImportAll={() => void mmImport.importAll(tokenList)}
          />
        )}

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
                        onClick={() => onSendToken(token.address)}
                      >
                        Send →
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </PageCard>
      </DashboardLayout>
    </>
  );
}
