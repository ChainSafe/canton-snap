// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useMemo } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { PageCard } from "../components/PageCard";
import { Spinner } from "../components/Spinner";
import { NETWORK } from "../lib/config";
import { OFFERS_SAMPLE_ENABLED } from "../lib/features";
import { formatTokenAmount } from "../lib/ethrpc";
import { TOKEN_COLORS } from "../lib/tokens";
import { listOutgoingTransfers, type OutgoingTransfer } from "../lib/transfer";
import { cn } from "../lib/cn";
import styles from "./DashboardOffersPage.module.css";

interface Props {
  address: string;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  keyMode: "custodial" | "external";
}

type Filter = "all" | "pending" | "expired";

interface OffersState {
  url: string;
  address: string;
  items: OutgoingTransfer[] | null;
  error: string | null;
  sample: boolean;
}

function TokenIcon({ symbol }: { symbol: string }) {
  const colors = TOKEN_COLORS[symbol.toUpperCase()] ?? { bg: "#656a8a", text: "#ffffff" };
  return (
    <div className={styles.tokenIconCircle} style={{ background: colors.bg, color: colors.text }}>
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4V7L9 8.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ExpiredIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 4.2V7.6M7 9.6H7.01"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OffersGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 8L12 3L21 8V16L12 21L3 16V8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M3 8L12 13L21 8M12 13V21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Illustrative offers shown only when VITE_OFFERS_SAMPLE=true and the live
// endpoint returns nothing — lets the design be reviewed before the outgoing
// endpoint is deployed. Timestamps are relative to "now" so the countdown /
// "expired N ago" labels render sensibly.
function buildSampleOffers(): OutgoingTransfer[] {
  const now = Date.now();
  const hours = (h: number) => new Date(now + h * 3600_000).toISOString();
  return [
    {
      contractId: "sample-pending-1",
      senderPartyId: "me_7a3f::1220ab00…b21e",
      receiverPartyId: "bob_9fK::1220c1d2…77a0",
      amount: "500",
      instrumentAdmin: "admin::1220…",
      instrumentId: "USDCX",
      symbol: "USDCX",
      decimals: 6,
      status: "pending",
      expiresAt: hours(14),
    },
    {
      contractId: "sample-expired-1",
      senderPartyId: "me_7a3f::1220ab00…b21e",
      receiverPartyId: "carol_3pQ::1220ee01…91bd",
      amount: "120",
      instrumentAdmin: "admin::1220…",
      instrumentId: "USDCX",
      symbol: "USDCX",
      decimals: 6,
      status: "expired",
      expiresAt: hours(-48),
    },
    {
      contractId: "sample-expired-2",
      senderPartyId: "me_7a3f::1220ab00…b21e",
      receiverPartyId: "dave_8mR::1220ab77…04ce",
      amount: "75.5",
      instrumentAdmin: "admin::1220…",
      instrumentId: "USDCX",
      symbol: "USDCX",
      decimals: 6,
      status: "expired",
      expiresAt: hours(-120),
    },
  ];
}

export function DashboardOffersPage({
  address,
  activeTab,
  onTabChange,
  onDisconnect,
  keyMode,
}: Props) {
  const [offers, setOffers] = useState<OffersState | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const isNonCustodial = keyMode === "external";
  const loading =
    isNonCustodial && (offers?.url !== NETWORK.middlewareUrl || offers?.address !== address);

  // Outgoing offers are surfaced for non-custodial users: custodial sends settle
  // directly server-side, so there's no pending/expired offer to track here.
  // (The custodial branch renders its own explainer independently of `offers`.)
  useEffect(() => {
    if (!isNonCustodial) return;
    let cancelled = false;

    const withSample = (): OffersState => ({
      url: NETWORK.middlewareUrl,
      address,
      items: buildSampleOffers(),
      error: null,
      sample: true,
    });

    listOutgoingTransfers(NETWORK.middlewareUrl, address)
      .then((items) => {
        if (cancelled) return;
        if (items.length === 0 && OFFERS_SAMPLE_ENABLED) {
          setOffers(withSample());
        } else {
          setOffers({ url: NETWORK.middlewareUrl, address, items, error: null, sample: false });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Endpoint missing / unreachable: fall back to sample data when the
        // preview flag is on so the design stays reviewable.
        if (OFFERS_SAMPLE_ENABLED) {
          setOffers(withSample());
        } else {
          setOffers({
            url: NETWORK.middlewareUrl,
            address,
            items: null,
            error: (e as Error).message,
            sample: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, isNonCustodial]);

  const items = useMemo(() => offers?.items ?? [], [offers]);
  const { pending, expired } = useMemo(() => splitByStatus(items), [items]);

  const visiblePending = filter === "expired" ? [] : pending;
  const visibleExpired = filter === "pending" ? [] : expired;
  const hasAny = items.length > 0;

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
          <h1 className={styles.pageTitle}>Offers</h1>
          {isNonCustodial && <span className={styles.modePill}>NON-CUSTODIAL</span>}
        </div>
        <p className={styles.pageSubtitle}>
          Transfers you&apos;ve offered to another Canton party, and which of them have expired.
        </p>

        <div className={styles.column}>
          {/* Custodial — offers settle server-side */}
          {!isNonCustodial && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <OffersGlyph />
              </div>
              <p className={styles.emptyTitle}>Nothing to track here</p>
              <p className={styles.emptyText}>
                In custodial mode the middleware settles your transfers directly, so there are no
                pending offers to manage.
              </p>
            </div>
          )}

          {isNonCustodial && loading && (
            <div className={styles.centred}>
              <Spinner />
            </div>
          )}

          {isNonCustodial && !loading && offers?.error && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <OffersGlyph />
              </div>
              <p className={styles.emptyTitle}>Couldn&apos;t load your offers</p>
              <p className={styles.emptyText}>{offers.error}</p>
            </div>
          )}

          {isNonCustodial && !loading && offers && !offers.error && (
            <>
              {offers.sample && (
                <div className={styles.sampleBadge}>
                  <span className={styles.sampleDot} />
                  SAMPLE DATA — preview only
                </div>
              )}

              {!hasAny ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <OffersGlyph />
                  </div>
                  <p className={styles.emptyTitle}>No offered transfers</p>
                  <p className={styles.emptyText}>
                    Transfers you offer to another Canton party appear here while they await
                    acceptance, and stay listed if they expire unaccepted.
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.filters}>
                    <FilterChip
                      label="All"
                      count={items.length}
                      active={filter === "all"}
                      onClick={() => setFilter("all")}
                    />
                    <FilterChip
                      label="Pending"
                      count={pending.length}
                      active={filter === "pending"}
                      onClick={() => setFilter("pending")}
                    />
                    <FilterChip
                      label="Expired"
                      count={expired.length}
                      active={filter === "expired"}
                      onClick={() => setFilter("expired")}
                    />
                  </div>

                  {visiblePending.length > 0 && (
                    <>
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                          <span className={cn(styles.statePill, styles.statePillLive)}>
                            PENDING
                          </span>
                          Awaiting acceptance
                        </h2>
                        <span className={styles.sectionMeta}>The recipient can still accept</span>
                      </div>
                      <PageCard className={styles.offersCard}>
                        <OffersTable rows={visiblePending} />
                      </PageCard>
                    </>
                  )}

                  {visibleExpired.length > 0 && (
                    <>
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                          <span className={cn(styles.statePill, styles.statePillExp)}>EXPIRED</span>
                          Not accepted in time
                        </h2>
                        <span className={styles.sectionMeta}>Expired before acceptance</span>
                      </div>
                      <PageCard className={cn(styles.offersCard, styles.offersCardExp)}>
                        <OffersTable rows={visibleExpired} />
                      </PageCard>
                    </>
                  )}

                  {visiblePending.length === 0 && visibleExpired.length === 0 && (
                    <div className={styles.empty}>
                      <p className={styles.emptyTitle}>Nothing in this view</p>
                      <p className={styles.emptyText}>No offers match the selected filter.</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(styles.filterChip, active && styles.filterChipActive)}
      onClick={onClick}
    >
      {label} <span className={styles.filterCount}>{count}</span>
    </button>
  );
}

function OffersTable({ rows }: { rows: OutgoingTransfer[] }) {
  return (
    <>
      <div className={styles.colHeaders}>
        <span>Token · To</span>
        <span className={styles.colAmount}>Amount</span>
        <span className={styles.colStatus}>Status</span>
      </div>
      {rows.map((offer, i) => {
        const symbol = offer.symbol ?? offer.instrumentId;
        const decimals = offer.decimals ?? 0;
        const expired = isExpired(offer);
        return (
          <div key={offer.contractId}>
            {i > 0 && <div className={styles.rowDivider} />}
            <div className={styles.offerRow}>
              <div className={styles.offerInfo}>
                <TokenIcon symbol={symbol} />
                <div className={styles.offerText}>
                  <p className={styles.offerSymbol}>{symbol}</p>
                  <p className={styles.offerTo}>to {shortenPartyId(offer.receiverPartyId)}</p>
                </div>
              </div>

              <div className={styles.amountInfo}>
                <p className={styles.amount}>
                  {offer.decimals !== undefined
                    ? formatTokenAmount(parseAmountToBigInt(offer.amount, decimals), decimals)
                    : offer.amount}
                </p>
                <p className={styles.amountLabel}>{symbol}</p>
              </div>

              <div className={styles.offerStatus}>
                <span
                  className={cn(
                    styles.statusChip,
                    expired ? styles.statusChipExpired : styles.statusChipPending,
                  )}
                >
                  {expired ? <ExpiredIcon /> : <ClockIcon />}
                  {formatRelativeExpiry(offer.expiresAt)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── helpers ──

function isExpired(offer: OutgoingTransfer): boolean {
  if (offer.status) return offer.status === "expired";
  if (!offer.expiresAt) return false;
  return new Date(offer.expiresAt).getTime() <= Date.now();
}

function splitByStatus(items: OutgoingTransfer[]): {
  pending: OutgoingTransfer[];
  expired: OutgoingTransfer[];
} {
  const pending: OutgoingTransfer[] = [];
  const expired: OutgoingTransfer[] = [];
  // Completed transfers belong on the Activity tab, not here — keep this view
  // to the two actionable states.
  for (const o of items) {
    if (o.status === "completed") continue;
    (isExpired(o) ? expired : pending).push(o);
  }
  return { pending, expired };
}

// "expires in 14h 22m" for a future time, "expired 2d ago" for a past one.
function formatRelativeExpiry(iso?: string): string {
  if (!iso) return "no expiry";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const diffMs = target - Date.now();
  const future = diffMs > 0;
  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  let span: string;
  if (days >= 1) {
    span = `${days}d`;
  } else if (hrs >= 1) {
    span = `${hrs}h ${mins % 60}m`;
  } else {
    span = `${Math.max(mins, 1)}m`;
  }
  return future ? `expires in ${span}` : `expired ${span} ago`;
}

function shortenPartyId(partyId: string): string {
  const sep = partyId.indexOf("::");
  if (sep < 0) return partyId.length > 18 ? `${partyId.slice(0, 9)}…${partyId.slice(-6)}` : partyId;
  const head = partyId.slice(0, sep);
  const fp = partyId.slice(sep + 2);
  const fpShort = fp.length > 12 ? `${fp.slice(0, 6)}…${fp.slice(-4)}` : fp;
  return `${head}::${fpShort}`;
}

// Parse a decimal string ("12.5") into the smallest-unit bigint for `decimals`.
// Mirrors the helper on the Balances page so amount rendering stays consistent.
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
