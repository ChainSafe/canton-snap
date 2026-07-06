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
import { useSnap } from "../hooks/useSnap";
import {
  listIncomingTransfers,
  prepareAcceptTransfer,
  executeAcceptTransfer,
  type IncomingTransfer,
} from "../lib/transfer";
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
  keyMode: "custodial" | "external";
  /** Open the Transfer tab with this token pre-selected. */
  onSendToken: (tokenAddress: string) => void;
}

type OfferRowState = "idle" | "preparing" | "signing" | "executing";

interface OffersState {
  url: string;
  address: string;
  items: IncomingTransfer[] | null;
  error: string | null;
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
  keyMode,
  onSendToken,
}: Props) {
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const [offers, setOffers] = useState<OffersState | null>(null);
  const [acceptState, setAcceptState] = useState<Record<string, OfferRowState>>({});
  const [acceptError, setAcceptError] = useState<Record<string, string>>({});

  const loading = fetchState?.url !== NETWORK.middlewareUrl || fetchState?.address !== address;
  const isNonCustodial = keyMode === "external";

  const mmImport = useMetaMaskImport(NETWORK, address);
  const snap = useSnap();

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
    void fetchBalances(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchBalances]);

  // Pending offers — non-custodial only. Custodial accepts are handled
  // server-side by the auto-accept worker, so the list is meaningful only
  // for users who hold their own Canton signing key.
  useEffect(() => {
    if (!isNonCustodial) {
      setOffers(null);
      return;
    }
    let cancelled = false;
    listIncomingTransfers(NETWORK.middlewareUrl, address)
      .then((page) => {
        if (!cancelled)
          setOffers({ url: NETWORK.middlewareUrl, address, items: page.items, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setOffers({
            url: NETWORK.middlewareUrl,
            address,
            items: null,
            error: (e as Error).message,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [address, isNonCustodial]);

  const handleAccept = useCallback(
    async (offer: IncomingTransfer) => {
      const cid = offer.contractId;
      setAcceptError((s) => {
        const next = { ...s };
        delete next[cid];
        return next;
      });
      setAcceptState((s) => ({ ...s, [cid]: "preparing" }));
      try {
        const prep = await prepareAcceptTransfer(
          NETWORK.middlewareUrl,
          address,
          cid,
          offer.instrumentAdmin,
        );
        setAcceptState((s) => ({ ...s, [cid]: "signing" }));
        const { derSignature, fingerprint } = await snap.signHash(prep.transactionHash, {
          operation: "Accept transfer",
          tokenSymbol: offer.symbol ?? offer.instrumentId,
          amount: offer.amount,
          recipient: offer.receiverPartyId,
          sender: offer.senderPartyId,
        });
        setAcceptState((s) => ({ ...s, [cid]: "executing" }));
        await executeAcceptTransfer(
          NETWORK.middlewareUrl,
          address,
          cid,
          prep.transferId,
          derSignature,
          fingerprint,
        );
        // Optimistically remove from the list; the indexer will catch up shortly.
        setOffers((prev) =>
          prev && prev.items
            ? { ...prev, items: prev.items.filter((o) => o.contractId !== cid) }
            : prev,
        );
        // Refresh balances so the accepted amount shows up. We do NOT refetch
        // the offers list here — the indexer can lag a beat after execute and
        // would briefly re-include the just-accepted offer, flickering it back
        // into the UI. The optimistic filter above is enough; next mount will
        // pick up the reconciled list.
        void fetchBalances();
      } catch (e) {
        setAcceptError((s) => ({ ...s, [cid]: (e as Error).message }));
      } finally {
        setAcceptState((s) => {
          const next = { ...s };
          delete next[cid];
          return next;
        });
      }
    },
    [address, snap, fetchBalances],
  );

  const offerItems = offers?.items ?? null;
  const hasOffers = !!offerItems && offerItems.length > 0;

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

        {/* ── Pending offers (non-custodial, only when present) ── */}
        {isNonCustodial && hasOffers && offerItems && (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Pending offers</h2>
              <p className={styles.sectionSubtitle}>
                Inbound transfers waiting for your acceptance.
              </p>
            </div>

            <PageCard className={styles.offersCard}>
              <div className={styles.colHeaders}>
                <span>TOKEN</span>
                <span className={styles.colBalance}>AMOUNT</span>
                <span />
              </div>

              {offerItems.map((offer, i) => {
                const state = acceptState[offer.contractId];
                const inFlight = state !== undefined;
                const err = acceptError[offer.contractId];
                const symbol = offer.symbol ?? offer.instrumentId;
                const decimals = offer.decimals ?? 0;
                // The middleware already truncates senderPartyId for privacy
                // (unauthenticated endpoint), so we render it as-is. Run it
                // through shortenPartyId anyway so the dapp's display rules
                // also cover the local devstack short-party case.
                const fromShort = shortenPartyId(offer.senderPartyId);
                return (
                  <div key={offer.contractId}>
                    {i > 0 && <div className={styles.rowDivider} />}
                    <div className={styles.tokenRow}>
                      <div className={styles.tokenInfo}>
                        <TokenIcon symbol={symbol} />
                        <div className={styles.tokenText}>
                          <p className={styles.tokenSymbol}>{symbol}</p>
                          <p className={styles.tokenName}>From {fromShort}</p>
                        </div>
                      </div>
                      <div className={styles.balanceInfo}>
                        <p className={styles.amount}>
                          {offer.decimals !== undefined
                            ? formatTokenAmount(
                                parseAmountToBigInt(offer.amount, decimals),
                                decimals,
                              )
                            : offer.amount}
                        </p>
                        <p className={styles.amountLabel}>{symbol}</p>
                      </div>
                      {inFlight ? (
                        <div className={styles.acceptSpinnerWrap} aria-busy="true">
                          <Spinner size={24} />
                        </div>
                      ) : (
                        <button
                          className={styles.acceptBtn}
                          onClick={() => void handleAccept(offer)}
                        >
                          Accept
                        </button>
                      )}
                    </div>
                    {err && <p className={styles.rowError}>{err}</p>}
                  </div>
                );
              })}
            </PageCard>
          </>
        )}

        {/* Balances heading */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Balances</h2>
          <p className={styles.sectionSubtitle}>Canton Network tokens held by this party.</p>
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

function shortenPartyId(partyId: string): string {
  const sep = partyId.indexOf("::");
  if (sep < 0) return partyId.length > 16 ? `${partyId.slice(0, 8)}…${partyId.slice(-6)}` : partyId;
  const head = partyId.slice(0, sep);
  const fp = partyId.slice(sep + 2);
  const fpShort = fp.length > 12 ? `${fp.slice(0, 6)}…${fp.slice(-4)}` : fp;
  return `${head}::${fpShort}`;
}

// Parse a decimal string ("12.5") into the smallest-unit bigint for `decimals`.
// Permissive: ignores anything beyond `decimals` digits past the dot so formatting
// stays consistent with whatever precision the indexer reported.
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
