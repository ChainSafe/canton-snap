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
import {
  listIncomingTransfers,
  listOutgoingTransfers,
  type IncomingTransfer,
  type OutgoingTransfer,
} from "../lib/transfer";
import { cn } from "../lib/cn";
import styles from "./DashboardOffersPage.module.css";

interface Props {
  address: string;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  keyMode: "custodial" | "external";
}

type Filter = "all" | "incoming" | "outgoing";

interface OffersState {
  url: string;
  address: string;
  incoming: IncomingTransfer[];
  outgoing: OutgoingTransfer[];
  error: string | null;
  sample: boolean;
}

// A normalized row so incoming and outgoing offers render through one table.
type ChipKind = "incoming" | "pending" | "expired";
interface OfferRow {
  key: string;
  symbol: string;
  decimals?: number;
  amount: string;
  counterparty: string;
  chipKind: ChipKind;
  chipText: string;
}

function TokenIcon({ symbol }: { symbol: string }) {
  const colors = TOKEN_COLORS[symbol.toUpperCase()] ?? { bg: "#656a8a", text: "#ffffff" };
  return (
    <div className={styles.tokenIconCircle} style={{ background: colors.bg, color: colors.text }}>
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

function IncomingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 2V9M7 9L4 6M7 9L10 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2.5 10.5H11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
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
// endpoints return nothing — lets the design be reviewed before they're
// deployed. Timestamps are relative to "now" so the labels render sensibly.
function buildSampleIncoming(): IncomingTransfer[] {
  return [
    {
      contractId: "sample-incoming-1",
      senderPartyId: "erin_5kT::1220fa31…0c4d",
      receiverPartyId: "me_7a3f::1220ab00…b21e",
      amount: "250",
      instrumentAdmin: "admin::1220…",
      instrumentId: "USDCX",
      symbol: "USDCX",
      decimals: 6,
    },
  ];
}

function buildSampleOutgoing(): OutgoingTransfer[] {
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
  ];
}

export function DashboardOffersPage({ address, activeTab, onTabChange, onDisconnect }: Props) {
  const [offers, setOffers] = useState<OffersState | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Ticks every 30s so the relative countdowns stay live and outgoing offers
  // flip from pending to expired on their own, without a refetch.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loading = offers?.url !== NETWORK.middlewareUrl || offers?.address !== address;

  // Offers in both directions are shown for every user, custodial or not — the
  // read endpoints are unauthenticated and resolve by EVM address.
  useEffect(() => {
    let cancelled = false;
    const url = NETWORK.middlewareUrl;

    const sampleState = (): OffersState => ({
      url,
      address,
      incoming: buildSampleIncoming(),
      outgoing: buildSampleOutgoing(),
      error: null,
      sample: true,
    });

    Promise.allSettled([
      listIncomingTransfers(url, address),
      listOutgoingTransfers(url, address),
    ]).then(([inc, out]) => {
      if (cancelled) return;
      const incoming = inc.status === "fulfilled" ? inc.value : [];
      const outgoing = out.status === "fulfilled" ? out.value : [];

      // Surface an error only when nothing could be loaded at all.
      if (inc.status === "rejected" && out.status === "rejected") {
        if (OFFERS_SAMPLE_ENABLED) {
          setOffers(sampleState());
        } else {
          setOffers({
            url,
            address,
            incoming: [],
            outgoing: [],
            error: (inc.reason as Error).message,
            sample: false,
          });
        }
        return;
      }

      if (incoming.length === 0 && outgoing.length === 0 && OFFERS_SAMPLE_ENABLED) {
        setOffers(sampleState());
      } else {
        setOffers({ url, address, incoming, outgoing, error: null, sample: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const incoming = useMemo(() => offers?.incoming ?? [], [offers]);
  const outgoing = useMemo(() => offers?.outgoing ?? [], [offers]);
  const { pending, expired } = useMemo(() => splitOutgoing(outgoing, now), [outgoing, now]);

  const incomingRows = useMemo(() => incoming.map(toIncomingRow), [incoming]);
  const pendingRows = useMemo(() => pending.map((o) => toOutgoingRow(o, now)), [pending, now]);
  const expiredRows = useMemo(() => expired.map((o) => toOutgoingRow(o, now)), [expired, now]);

  const showIncoming = filter !== "outgoing";
  const showOutgoing = filter !== "incoming";
  const total = incoming.length + outgoing.length;
  const hasAny = total > 0;

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
        </div>
        <p className={styles.pageSubtitle}>
          Transfer offers waiting on you to accept, and the ones you&apos;ve sent.
        </p>

        <div className={styles.column}>
          {loading && (
            <div className={styles.centred}>
              <Spinner />
            </div>
          )}

          {!loading && offers?.error && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <OffersGlyph />
              </div>
              <p className={styles.emptyTitle}>Couldn&apos;t load your offers</p>
              <p className={styles.emptyText}>{offers.error}</p>
            </div>
          )}

          {!loading && offers && !offers.error && (
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
                  <p className={styles.emptyTitle}>No offers</p>
                  <p className={styles.emptyText}>
                    Offers sent to you and transfers you&apos;ve offered to another Canton party
                    will appear here.
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.filters}>
                    <FilterChip
                      label="All"
                      count={total}
                      active={filter === "all"}
                      onClick={() => setFilter("all")}
                    />
                    <FilterChip
                      label="Incoming"
                      count={incoming.length}
                      active={filter === "incoming"}
                      onClick={() => setFilter("incoming")}
                    />
                    <FilterChip
                      label="Outgoing"
                      count={outgoing.length}
                      active={filter === "outgoing"}
                      onClick={() => setFilter("outgoing")}
                    />
                  </div>

                  {showIncoming && incomingRows.length > 0 && (
                    <>
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                          <span className={cn(styles.statePill, styles.statePillIncoming)}>
                            INCOMING
                          </span>
                          Awaiting your acceptance
                        </h2>
                        <span className={styles.sectionMeta}>Sent to you by another party</span>
                      </div>
                      <PageCard className={styles.offersCard}>
                        <OffersTable rows={incomingRows} />
                      </PageCard>
                    </>
                  )}

                  {showOutgoing && pendingRows.length > 0 && (
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
                        <OffersTable rows={pendingRows} />
                      </PageCard>
                    </>
                  )}

                  {showOutgoing && expiredRows.length > 0 && (
                    <>
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                          <span className={cn(styles.statePill, styles.statePillExp)}>EXPIRED</span>
                          Not accepted in time
                        </h2>
                        <span className={styles.sectionMeta}>Expired before acceptance</span>
                      </div>
                      <PageCard className={cn(styles.offersCard, styles.offersCardExp)}>
                        <OffersTable rows={expiredRows} />
                      </PageCard>
                    </>
                  )}

                  {((showIncoming && incomingRows.length === 0) || !showIncoming) &&
                    (!showOutgoing || (pendingRows.length === 0 && expiredRows.length === 0)) && (
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

function ChipIcon({ kind }: { kind: ChipKind }) {
  if (kind === "incoming") return <IncomingIcon />;
  if (kind === "expired") return <ExpiredIcon />;
  return <ClockIcon />;
}

function OffersTable({ rows }: { rows: OfferRow[] }) {
  return (
    <>
      <div className={styles.colHeaders}>
        <span>Token · Party</span>
        <span className={styles.colAmount}>Amount</span>
        <span className={styles.colStatus}>Status</span>
      </div>
      {rows.map((row, i) => (
        <div key={row.key}>
          {i > 0 && <div className={styles.rowDivider} />}
          <div className={styles.offerRow}>
            <div className={styles.offerInfo}>
              <TokenIcon symbol={row.symbol} />
              <div className={styles.offerText}>
                <p className={styles.offerSymbol}>{row.symbol}</p>
                <p className={styles.offerTo}>{row.counterparty}</p>
              </div>
            </div>

            <div className={styles.amountInfo}>
              <p className={styles.amount}>{row.amount}</p>
              <p className={styles.amountLabel}>{row.symbol}</p>
            </div>

            <div className={styles.offerStatus}>
              <span
                className={cn(
                  styles.statusChip,
                  row.chipKind === "incoming" && styles.statusChipIncoming,
                  row.chipKind === "pending" && styles.statusChipPending,
                  row.chipKind === "expired" && styles.statusChipExpired,
                )}
              >
                <ChipIcon kind={row.chipKind} />
                {row.chipText}
              </span>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ── row mapping ──

function formatAmount(amount: string, decimals?: number): string {
  if (decimals === undefined) return amount;
  return formatTokenAmount(parseAmountToBigInt(amount, decimals), decimals);
}

function toIncomingRow(o: IncomingTransfer): OfferRow {
  const symbol = o.symbol ?? o.instrumentId;
  return {
    key: o.contractId,
    symbol,
    decimals: o.decimals,
    amount: formatAmount(o.amount, o.decimals),
    counterparty: `from ${shortenPartyId(o.senderPartyId)}`,
    chipKind: "incoming",
    chipText: "awaiting your acceptance",
  };
}

function toOutgoingRow(o: OutgoingTransfer, now: number): OfferRow {
  const symbol = o.symbol ?? o.instrumentId;
  const expired = isExpired(o, now);
  return {
    key: o.contractId,
    symbol,
    decimals: o.decimals,
    amount: formatAmount(o.amount, o.decimals),
    counterparty: `to ${shortenPartyId(o.receiverPartyId)}`,
    chipKind: expired ? "expired" : "pending",
    chipText: formatRelativeExpiry(o.expiresAt, now),
  };
}

// ── helpers ──

function isExpired(offer: OutgoingTransfer, now: number): boolean {
  if (offer.status) return offer.status === "expired";
  if (!offer.expiresAt) return false;
  return new Date(offer.expiresAt).getTime() <= now;
}

function splitOutgoing(
  items: OutgoingTransfer[],
  now: number,
): {
  pending: OutgoingTransfer[];
  expired: OutgoingTransfer[];
} {
  const pending: OutgoingTransfer[] = [];
  const expired: OutgoingTransfer[] = [];
  // Completed transfers belong on the Activity tab, not here — keep this view
  // to the two actionable states.
  for (const o of items) {
    if (o.status === "completed") continue;
    (isExpired(o, now) ? expired : pending).push(o);
  }
  return { pending, expired };
}

// "expires in 14h 22m" for a future time, "expired 2d ago" for a past one.
function formatRelativeExpiry(iso: string | undefined, now: number): string {
  if (!iso) return "no expiry";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const diffMs = target - now;
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
