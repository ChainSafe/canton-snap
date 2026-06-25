// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { PageCard } from "../components/PageCard";
import { Spinner } from "../components/Spinner";
import { NETWORK } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import {
  getTokenBalance,
  formatTokenAmount,
  encodeTransfer,
  getTransactionReceipt,
  parseTokenAmount,
} from "../lib/ethrpc";
import {
  prepareTransfer,
  executeTransfer,
  sendCustodialTransfer,
  VALIDITY_PRESETS,
  DEFAULT_VALIDITY_SECONDS,
  type PrepareResult,
  type RecipientType,
} from "../lib/transfer";
import { sendEthTransaction, shortenAddress, toChecksumAddress } from "../lib/ethereum";
import { ensureChainAdded } from "../lib/network";
import { TOKEN_COLORS } from "../lib/tokens";
import { recordPendingTx, removePendingTx, markPendingFailed } from "../lib/pendingTxs";
import { useSnap } from "../hooks/useSnap";
import { cn } from "../lib/cn";
import styles from "./TransferPage.module.css";

type ReceiptStatus = "pending" | "success" | "failed";
const RECEIPT_POLL_INTERVAL_MS = 3000;

type Step = "details" | "sign" | "done";
type SignPhase = "idle" | "preparing" | "awaiting-snap" | "signing" | "executing";

interface Receipt {
  // Absent for custodial party-id sends, which settle server-side in one call
  // and return no EVM transaction hash.
  txHash?: string;
  token: TokenConfig;
  amount: string;
  to: string;
}

interface Props {
  address: string;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  keyMode: "custodial" | "external";
  /** Token address to pre-select on mount (set when opened via a balances "Send →"). */
  preselectTokenAddress?: string | null;
}

function TokenAvatar({ symbol }: { symbol: string }) {
  const colors = TOKEN_COLORS[symbol.toUpperCase()] ?? { bg: "#656a8a", text: "#ffffff" };
  return (
    <div className={styles.tokenAvatar} style={{ background: colors.bg, color: colors.text }}>
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      className={styles.tokenDropdownChevron}
    >
      <path d="M1 1L5 5L9 1" stroke="#a1a6c4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 6V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="4" r="0.7" fill="currentColor" />
    </svg>
  );
}

// A Canton party id is `name::fingerprint`. Kept permissive (no whitespace, a
// `::` separator with non-empty halves) so truncated/devstack forms pass; the
// middleware does the authoritative resolution.
const PARTY_ID_RE = /^\S+::\S+$/;

// Compact a `name::fingerprint` party id for display (keeps the readable hint,
// truncates the long fingerprint). Mirrors the helper on the Balances page.
function shortenPartyId(partyId: string): string {
  const sep = partyId.indexOf("::");
  if (sep < 0) return partyId.length > 18 ? `${partyId.slice(0, 9)}…${partyId.slice(-6)}` : partyId;
  const head = partyId.slice(0, sep);
  const fp = partyId.slice(sep + 2);
  const fpShort = fp.length > 12 ? `${fp.slice(0, 6)}…${fp.slice(-4)}` : fp;
  return `${head}::${fpShort}`;
}

const CUSTOM_UNITS = [
  { id: "minutes", label: "minutes", seconds: 60 },
  { id: "hours", label: "hours", seconds: 3600 },
  { id: "days", label: "days", seconds: 86400 },
] as const;
type CustomUnit = (typeof CUSTOM_UNITS)[number]["id"];

const MAX_VALIDITY_SECONDS = 365 * 86400;

// Validity in seconds for a custom value/unit, or NaN when the input isn't a
// usable positive number (caught by validate() before prepare).
function customSeconds(value: string, unit: CustomUnit): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  const per = CUSTOM_UNITS.find((u) => u.id === unit)?.seconds ?? 1;
  return Math.floor(n * per);
}

function EvmAddressIcon({ active }: { active: boolean }) {
  const stroke = active ? "#00d4a4" : "#a1a6c4";
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3L18.5 12L12 16L5.5 12L12 3Z"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 13.3L12 21L18.5 13.3L12 17.4L5.5 13.3Z"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PartyIdIcon({ active }: { active: boolean }) {
  const stroke = active ? "#00d4a4" : "#a1a6c4";
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8.5" r="3" stroke={stroke} strokeWidth="1.5" />
      <path
        d="M3.5 19C3.5 15.7 6 13.5 9 13.5C12 13.5 14.5 15.7 14.5 19"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16 4L17 6L19 6.3L17.6 7.7L17.9 9.7L16 8.8L14.1 9.7L14.4 7.7L13 6.3L15 6L16 4Z"
        fill={stroke}
        opacity={0.85}
      />
    </svg>
  );
}

function RecipientTypeToggle({
  value,
  onChange,
}: {
  value: RecipientType;
  onChange: (t: RecipientType) => void;
}) {
  const options: { id: RecipientType; title: string; desc: string; Icon: typeof EvmAddressIcon }[] =
    [
      { id: "address", title: "EVM Address", desc: "0x… 40-hex address", Icon: EvmAddressIcon },
      { id: "party", title: "Canton Party ID", desc: "name::fingerprint", Icon: PartyIdIcon },
    ];
  return (
    <div className={styles.rtypeGrid} role="radiogroup" aria-label="Recipient type">
      {options.map(({ id, title, desc, Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(styles.rtypeOption, selected && styles.rtypeOptionSelected)}
            onClick={() => onChange(id)}
          >
            <span className={styles.rtypeIcon}>
              <Icon active={selected} />
            </span>
            <span className={styles.rtypeText}>
              <span className={styles.rtypeTitle}>{title}</span>
              <span className={styles.rtypeDesc}>{desc}</span>
            </span>
            <span className={cn(styles.rtypeRadio, selected && styles.rtypeRadioSelected)} />
          </button>
        );
      })}
    </div>
  );
}

function ExpiryPicker({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const [custom, setCustom] = useState(false);
  const [num, setNum] = useState("3");
  const [unit, setUnit] = useState<CustomUnit>("days");

  function selectPreset(seconds: number) {
    setCustom(false);
    onChange(seconds);
  }

  function selectCustom() {
    setCustom(true);
    onChange(customSeconds(num, unit));
  }

  function updateCustom(nextNum: string, nextUnit: CustomUnit) {
    setNum(nextNum);
    setUnit(nextUnit);
    onChange(customSeconds(nextNum, nextUnit));
  }

  return (
    <>
      <div className={styles.expiryRow} role="radiogroup" aria-label="Offer expiry">
        {VALIDITY_PRESETS.map(({ label, seconds }) => {
          const selected = !custom && value === seconds;
          return (
            <button
              key={seconds}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(styles.expiryChip, selected && styles.expiryChipSelected)}
              onClick={() => selectPreset(seconds)}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          className={cn(styles.expiryChip, custom && styles.expiryChipSelected)}
          onClick={selectCustom}
        >
          Custom
        </button>
      </div>

      {custom && (
        <div className={styles.expiryCustomRow}>
          <input
            className={styles.expiryCustomInput}
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={num}
            onChange={(e) => updateCustom(e.target.value.replace(/[^\d.]/g, ""), unit)}
            aria-label="Custom expiry amount"
          />
          <select
            className={styles.expiryCustomUnit}
            value={unit}
            onChange={(e) => updateCustom(num, e.target.value as CustomUnit)}
            aria-label="Custom expiry unit"
          >
            {CUSTOM_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

type StepState = "pending" | "active" | "done";

function StepsBar({ step }: { step: Step }) {
  const items: { id: Step; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "sign", label: "Sign" },
    { id: "done", label: "Done" },
  ];
  const order: Step[] = ["details", "sign", "done"];
  const current = order.indexOf(step);

  function state(s: Step): StepState {
    const i = order.indexOf(s);
    if (i < current) return "done";
    if (i === current) return "active";
    return "pending";
  }

  return (
    <div className={styles.stepsBar}>
      {items.map(({ id, label }, i) => {
        const st = state(id);
        const connectorDone = i < current;
        return (
          <div key={id} className={cn(styles.stepSegment, i === items.length - 1 ? "" : "")}>
            <div className={styles.stepItem}>
              <div
                className={cn(
                  styles.stepDot,
                  st === "done" && styles.stepDotDone,
                  st === "active" && styles.stepDotActive,
                  st === "pending" && styles.stepDotPending,
                )}
              >
                {st === "done" ? (
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                    <path
                      d="M1 5L5 9L13 1"
                      stroke="#00d4a4"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  styles.stepLabel,
                  st === "done" && styles.stepLabelDone,
                  st === "active" && styles.stepLabelActive,
                  st === "pending" && styles.stepLabelPending,
                )}
              >
                {label}
              </span>
            </div>
            {i < items.length - 1 && (
              <div
                className={cn(
                  styles.stepConnector,
                  connectorDone ? styles.stepConnectorDone : styles.stepConnectorPending,
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface TokenDropdownProps {
  tokens: TokenConfig[];
  selected: TokenConfig | null;
  balances: Map<string, bigint>;
  onSelect: (t: TokenConfig) => void;
}

function TokenDropdown({ tokens, selected, balances, onSelect }: TokenDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const bal = selected ? balances.get(selected.address) : undefined;

  return (
    <div className={styles.tokenDropdownWrapper} ref={ref}>
      <button
        type="button"
        className={styles.tokenDropdownTrigger}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <>
            <TokenAvatar symbol={selected.symbol} />
            <div className={styles.tokenDropdownInfo}>
              <span className={styles.tokenDropdownName}>{selected.symbol}</span>
              <span className={styles.tokenDropdownBalance}>
                {bal !== undefined
                  ? `Balance: ${formatTokenAmount(bal, selected.decimals)}`
                  : "Loading balance…"}
              </span>
            </div>
          </>
        ) : (
          <span className={styles.tokenDropdownName} style={{ color: "#656a8a" }}>
            Select token
          </span>
        )}
        <ChevronDown />
      </button>

      {open && (
        <div className={styles.tokenDropdownMenu}>
          {tokens.map((t) => {
            const b = balances.get(t.address);
            return (
              <button
                key={t.address}
                type="button"
                className={styles.tokenDropdownItem}
                onClick={() => {
                  onSelect(t);
                  setOpen(false);
                }}
              >
                <TokenAvatar symbol={t.symbol} />
                <div>
                  <span className={styles.tokenDropdownItemName}>{t.symbol}</span>
                  <span className={styles.tokenDropdownItemBalance}>
                    {b !== undefined ? `Balance: ${formatTokenAmount(b, t.decimals)}` : t.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TransferPage({
  address,
  activeTab,
  onTabChange,
  onDisconnect,
  keyMode,
  preselectTokenAddress,
}: Props) {
  const [step, setStep] = useState<Step>("details");
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TokenConfig | null>(null);
  const [balances, setBalances] = useState<Map<string, bigint>>(new Map());
  const [recipientType, setRecipientType] = useState<RecipientType>("address");
  const [recipient, setRecipient] = useState("");
  const [validitySeconds, setValiditySeconds] = useState<number>(DEFAULT_VALIDITY_SECONDS);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signPhase, setSignPhase] = useState<SignPhase>("idle");
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<ReceiptStatus>("pending");
  const [revertReason, setRevertReason] = useState<string | undefined>();

  const snap = useSnap();
  const isNonCustodial = keyMode === "external";

  // Pre-selection captured at mount — it's fixed for the lifetime of this
  // page (only set when navigating in from a balances "Send →"). Held in a
  // ref so the fetch effect can honour it without taking it as a dependency,
  // which would otherwise refetch the token list/balances on every change.
  const preselectRef = useRef(preselectTokenAddress);

  // Load token list then fetch all balances
  useEffect(() => {
    let cancelled = false;
    const rpcUrl = `${NETWORK.middlewareUrl}/eth`;

    async function load() {
      setTokensLoading(true);
      try {
        const list = await getTokens(NETWORK.middlewareUrl);
        if (cancelled) return;
        setTokens(list);
        if (list.length > 0) {
          const pre = preselectRef.current;
          const match = pre
            ? list.find((t) => t.address.toLowerCase() === pre.toLowerCase())
            : undefined;
          setSelectedToken(match ?? list[0]);
        }
        const entries = await Promise.all(
          list.map(async (t) => {
            try {
              const b = await getTokenBalance(rpcUrl, t.address, address);
              return [t.address, b] as [string, bigint];
            } catch {
              return [t.address, 0n] as [string, bigint];
            }
          }),
        );
        if (!cancelled) setBalances(new Map(entries));
      } catch {
        // token list fetch failed — leave empty state
      } finally {
        if (!cancelled) setTokensLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Auto-run prepare when entering sign step (non-custodial only).
  // Depends only on [step]: fires once on entry; form fields are captured via closure
  // and must not cause re-runs mid-flight.
  useEffect(() => {
    if (step !== "sign" || !isNonCustodial || !selectedToken) return;
    const token = selectedToken;
    let cancelled = false;

    async function prepare() {
      setSignPhase("preparing");
      setPending(true);
      setError(null);
      try {
        const result = await prepareTransfer(
          NETWORK.middlewareUrl,
          address,
          recipient,
          token.symbol,
          amount,
          recipientType,
          validitySeconds,
        );
        if (cancelled) return;
        setPrepared(result);
        setSignPhase("awaiting-snap");
      } catch (e: unknown) {
        if (cancelled) return;
        setError((e as Error).message);
        setStep("details");
        setSignPhase("idle");
      } finally {
        if (!cancelled) setPending(false);
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function validate(): string | null {
    if (!selectedToken) return "Select a token";
    if (recipientType === "party") {
      if (!PARTY_ID_RE.test(recipient)) return "Enter a valid Canton party id (name::fingerprint)";
    } else if (!recipient.match(/^0x[0-9a-fA-F]{40}$/)) {
      return "Enter a valid 0x EVM address";
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return "Enter a positive amount";
    if (usesValidity) {
      if (!Number.isFinite(validitySeconds) || validitySeconds <= 0)
        return "Enter a valid offer expiry";
      if (validitySeconds > MAX_VALIDITY_SECONDS) return "Offer expiry can be at most 365 days";
    }
    const bal = balances.get(selectedToken.address);
    if (bal !== undefined) {
      if (parseTokenAmount(amount, selectedToken.decimals) > bal)
        return "Amount exceeds your balance";
    }
    return null;
  }

  function handleContinue() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep("sign");
  }

  async function handleSnapSign() {
    if (!prepared || !selectedToken) return;

    if (new Date(prepared.expiresAt) <= new Date()) {
      setError("Transfer preparation expired — please go back and try again.");
      setPrepared(null);
      setStep("details");
      setSignPhase("idle");
      return;
    }

    setPending(true);
    setError(null);
    try {
      setSignPhase("signing");
      const { derSignature, fingerprint } = await snap.signHash(prepared.transactionHash, {
        operation: "Transfer",
        tokenSymbol: selectedToken.symbol,
        amount,
        recipient,
        sender: address,
      });

      setSignPhase("executing");
      await executeTransfer(
        NETWORK.middlewareUrl,
        address,
        prepared.transferId,
        derSignature,
        fingerprint,
      );

      recordPendingTx(address, {
        txHash: prepared.transactionHash,
        tokenAddress: selectedToken.address.toLowerCase(),
        tokenSymbol: selectedToken.symbol,
        tokenDecimals: selectedToken.decimals,
        amount: parseTokenAmount(amount, selectedToken.decimals).toString(),
        from: address.toLowerCase(),
        to: recipient.toLowerCase(),
        submittedAt: Math.floor(Date.now() / 1000),
      });
      setReceipt({ txHash: prepared.transactionHash, token: selectedToken, amount, to: recipient });
      setStep("done");
    } catch (e: unknown) {
      setError((e as Error).message);
      setPrepared(null);
      setStep("details");
      setSignPhase("idle");
    } finally {
      setPending(false);
    }
  }

  async function handleMetaMaskSign() {
    if (!selectedToken) return;
    setPending(true);
    setError(null);
    try {
      await ensureChainAdded(NETWORK);

      const amountBigInt = parseTokenAmount(amount, selectedToken.decimals);
      const data = encodeTransfer(recipient, amountBigInt);
      const txHash = await sendEthTransaction({ from: address, to: selectedToken.address, data });

      recordPendingTx(address, {
        txHash,
        tokenAddress: selectedToken.address.toLowerCase(),
        tokenSymbol: selectedToken.symbol,
        tokenDecimals: selectedToken.decimals,
        amount: amountBigInt.toString(),
        from: address.toLowerCase(),
        to: recipient.toLowerCase(),
        submittedAt: Math.floor(Date.now() / 1000),
      });
      setReceipt({ txHash, token: selectedToken, amount, to: recipient });
      setStep("done");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  // Custodial send to a Canton party id. The middleware signs server-side and
  // settles in one call, so there's no MetaMask tx and no eth hash to poll —
  // the receipt is "confirmed" immediately. (Custodial sends to a plain EVM
  // address still go through handleMetaMaskSign / the ERC-20 path above.)
  async function handleCustodialPartySend() {
    if (!selectedToken) return;
    setPending(true);
    setError(null);
    try {
      await sendCustodialTransfer(
        NETWORK.middlewareUrl,
        address,
        recipient,
        selectedToken.symbol,
        amount,
        validitySeconds,
      );
      setReceipt({ token: selectedToken, amount, to: recipient });
      setReceiptStatus("success");
      setStep("done");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  function handleReset() {
    setStep("details");
    setAmount("");
    setRecipient("");
    setPrepared(null);
    setSignPhase("idle");
    setError(null);
    setReceipt(null);
    setReceiptStatus("pending");
    setRevertReason(undefined);
  }

  // Poll eth_getTransactionReceipt while the Done step is showing a pending tx.
  // canton-middleware PR #281 made tx submission async, so the receipt arrives
  // a few seconds after the hash returns. Mirrors the polling on the Activity
  // tab so the pending entry there clears in lockstep with the UI here.
  useEffect(() => {
    if (step !== "done" || !receipt?.txHash || receiptStatus !== "pending") return;
    const rpcUrl = `${NETWORK.middlewareUrl}/eth`;
    const txHash = receipt.txHash;
    let cancelled = false;

    async function poll() {
      try {
        const r = await getTransactionReceipt(rpcUrl, txHash);
        if (cancelled || !r) return;
        if (r.status === "success") {
          removePendingTx(address, txHash);
          setReceiptStatus("success");
        } else {
          markPendingFailed(address, txHash, r.revertReason);
          setRevertReason(r.revertReason);
          setReceiptStatus("failed");
        }
      } catch {
        // transient — try again on next tick
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), RECEIPT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, receipt, receiptStatus, address]);

  async function handlePaste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      // Only the EVM-address form is checksummed; party ids are opaque strings.
      setRecipient(recipientType === "party" ? text : toChecksumAddress(text));
    } catch {
      // clipboard access denied — no-op
    }
  }

  function handleRecipientBlur() {
    if (recipient && recipientType === "address") setRecipient(toChecksumAddress(recipient));
  }

  function handleRecipientTypeChange(t: RecipientType) {
    if (t === recipientType) return;
    setRecipientType(t);
    setRecipient("");
    setError(null);
  }

  const recipientValid =
    recipientType === "party"
      ? PARTY_ID_RE.test(recipient)
      : /^0x[0-9a-fA-F]{40}$/.test(recipient);
  const selectedBalance = selectedToken ? balances.get(selectedToken.address) : undefined;
  const pillClass = isNonCustodial ? styles.modePillNonCustodial : styles.modePillCustodial;

  // Custodial sends to a plain EVM address settle via a raw ERC-20 transfer and
  // carry no offer validity. Every other path (any non-custodial send, or a
  // custodial send to a party id) goes through the middleware and needs a
  // validity, so the Offer expiry control is shown for those.
  const isCustodialParty = !isNonCustodial && recipientType === "party";
  const usesValidity = isNonCustodial || isCustodialParty;

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
          <h1 className={styles.pageTitle}>Transfer</h1>
          <span className={cn(styles.modePill, pillClass)}>
            {isNonCustodial ? "NON-CUSTODIAL" : "CUSTODIAL"}
          </span>
        </div>
        <p className={styles.pageSubtitle}>Send tokens on Canton Network.</p>

        <StepsBar step={step} />

        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* ── Details step ── */}
        {step === "details" && (
          <PageCard className={styles.card}>
            {/* Token */}
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>TOKEN</p>
              {tokensLoading ? (
                <Spinner />
              ) : (
                <TokenDropdown
                  tokens={tokens}
                  selected={selectedToken}
                  balances={balances}
                  onSelect={(t) => {
                    setSelectedToken(t);
                    setAmount("");
                    setError(null);
                  }}
                />
              )}
            </div>

            {/* Recipient type — EVM address or Canton party id. Both modes
                support party id: non-custodial via prepare/execute, custodial
                via the server-signed /custodial endpoint. */}
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>RECIPIENT TYPE</p>
              <RecipientTypeToggle value={recipientType} onChange={handleRecipientTypeChange} />
            </div>

            {/* Recipient */}
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>RECIPIENT</p>
              <div className={styles.recipientWrapper}>
                <input
                  className={styles.recipientInput}
                  type="text"
                  placeholder={recipientType === "party" ? "name::fingerprint" : "0x..."}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  onBlur={handleRecipientBlur}
                  spellCheck={false}
                />
                <button className={styles.pasteBtn} type="button" onClick={handlePaste}>
                  Paste
                </button>
              </div>
              {recipientValid && (
                <p className={styles.recipientHint}>
                  ✓ Valid {recipientType === "party" ? "Canton party ID" : "EVM address"}
                </p>
              )}
            </div>

            {/* Amount */}
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>AMOUNT</p>
              <div className={styles.amountRow}>
                <input
                  className={styles.amountInput}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                />
                {selectedBalance !== undefined && selectedToken && (
                  <button
                    className={styles.maxBtn}
                    type="button"
                    onClick={() => {
                      setAmount(formatTokenAmount(selectedBalance, selectedToken.decimals));
                      setError(null);
                    }}
                  >
                    MAX
                  </button>
                )}
                {selectedToken && (
                  <span className={styles.amountSymbol}>{selectedToken.symbol}</span>
                )}
              </div>
              {selectedBalance !== undefined && selectedToken && (
                <p className={styles.balanceHint}>
                  Balance: {formatTokenAmount(selectedBalance, selectedToken.decimals)}{" "}
                  {selectedToken.symbol}
                </p>
              )}
            </div>

            {/* Offer expiry — sets validity_seconds: how long the recipient has
                to accept before the offer expires and the funds can be reclaimed.
                Shown for every send that creates an on-ledger offer. */}
            {usesValidity && (
              <div className={styles.fieldGroup}>
                <p className={styles.fieldLabel}>OFFER EXPIRY</p>
                <ExpiryPicker value={validitySeconds} onChange={setValiditySeconds} />
                <p className={styles.balanceHint}>
                  The recipient has this long to accept. After it expires the offer can be reclaimed.
                </p>
              </div>
            )}

            {/* Info strip */}
            <div className={styles.infoStrip}>
              <InfoIcon />
              {isCustodialParty ? (
                <span>
                  Gas-free on Canton · The recipient party receives an{" "}
                  <strong style={{ color: "var(--text-primary)" }}>offer to accept</strong> — the
                  server co-signs on your behalf.
                </span>
              ) : isNonCustodial ? (
                <span>
                  Gas-free on Canton · Settles in ~2–4s · You&apos;ll sign{" "}
                  <strong style={{ color: "var(--text-primary)" }}>three times</strong> (MetaMask
                  auth × 2 + Snap)
                </span>
              ) : (
                <span>
                  Gas-free on Canton · Settles in ~2–4s ·{" "}
                  <strong style={{ color: "var(--text-primary)" }}>one MetaMask signature</strong> —
                  server co-signs Canton side
                </span>
              )}
            </div>

            <button
              className={styles.btnContinue}
              onClick={handleContinue}
              disabled={tokensLoading}
            >
              Continue
            </button>
          </PageCard>
        )}

        {/* ── Sign step (non-custodial) ── */}
        {step === "sign" && isNonCustodial && (
          <div className={styles.signCard}>
            <div className={cn(styles.signIconWrap, styles.signIconSnap)}>
              {pending && signPhase !== "awaiting-snap" ? (
                <Spinner />
              ) : (
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path
                    d="M14 4L24 9.5V18.5L14 24L4 18.5V9.5L14 4Z"
                    stroke="#00d4a4"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 14L12 17L19 11"
                    stroke="#00d4a4"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            <p className={styles.signTitle}>Sign in Canton Snap</p>
            <p className={styles.signSubtitle}>
              {signPhase === "preparing"
                ? "Authenticating with MetaMask…"
                : signPhase === "signing"
                  ? "Approve the request in the Canton Snap dialog…"
                  : signPhase === "executing"
                    ? "Submitting transaction to Canton…"
                    : "Review the transaction hash in the snap dialog and approve to send the transfer."}
            </p>

            {prepared && (
              <div className={styles.hashPreview}>
                <span className={styles.hashPreviewLabel}>TRANSACTION HASH</span>
                <span className={styles.hashPreviewValue}>{prepared.transactionHash}</span>
              </div>
            )}

            <button
              className={styles.btnOpenDialog}
              onClick={handleSnapSign}
              disabled={pending || signPhase !== "awaiting-snap"}
            >
              {signPhase === "signing"
                ? "Signing…"
                : signPhase === "executing"
                  ? "Executing…"
                  : "Open snap dialog"}
            </button>

            <div className={styles.signStatusRow}>
              <div className={styles.statusItem}>
                <div
                  className={cn(
                    styles.statusItemDot,
                    signPhase === "preparing"
                      ? styles.statusItemDotActive
                      : styles.statusItemDotDone,
                  )}
                />
                <span className={styles.statusItemDone}>Authenticated with MetaMask</span>
              </div>
              <div className={styles.statusItem}>
                <div
                  className={cn(
                    styles.statusItemDot,
                    signPhase === "preparing"
                      ? styles.statusItemDotPending
                      : styles.statusItemDotDone,
                  )}
                />
                <span className={prepared ? styles.statusItemDone : ""}>Transaction prepared</span>
              </div>
              <button className={styles.btnCancel} onClick={handleReset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Sign step (custodial) ── */}
        {step === "sign" && !isNonCustodial && selectedToken && (
          <div className={styles.signCard}>
            <div className={cn(styles.signIconWrap, styles.signIconMetaMask)}>
              {pending ? (
                <Spinner />
              ) : (
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path
                    d="M14 3L25 8.5V19.5L14 25L3 19.5V8.5L14 3Z"
                    fill="rgba(246,133,27,0.2)"
                    stroke="#f6851b"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <circle cx="14" cy="14" r="3.5" fill="#f6851b" opacity="0.8" />
                </svg>
              )}
            </div>

            <p className={styles.signTitle}>Confirm in MetaMask</p>
            <p className={styles.signSubtitle}>
              {isCustodialParty
                ? "Authorise the transfer — the middleware signs and settles it on Canton on your behalf."
                : "Sign the ERC-20 transfer — the middleware will co-sign on Canton."}
            </p>

            <div className={styles.contractPreview}>
              <span className={styles.contractPreviewLabel}>
                {isCustodialParty ? "CANTON TRANSFER" : "CONTRACT CALL"}
                <span className={styles.contractVia}>{isCustodialParty ? "via /custodial" : "via /eth"}</span>
              </span>
              <span className={styles.contractCall}>
                {isCustodialParty
                  ? `${amount} ${selectedToken.symbol} → ${shortenPartyId(recipient)}`
                  : `${selectedToken.symbol.toLowerCase()}.transfer(${shortenAddress(recipient)}, ${parseTokenAmount(amount, selectedToken.decimals).toString()})`}
              </span>
            </div>

            <button
              className={styles.btnOpenDialog}
              onClick={isCustodialParty ? handleCustodialPartySend : handleMetaMaskSign}
              disabled={pending}
            >
              {pending ? "Waiting for MetaMask…" : "Open MetaMask"}
            </button>

            <div className={styles.signStatusRow}>
              <div className={styles.statusItem}>
                <div
                  className={cn(
                    styles.statusItemDot,
                    pending ? styles.statusItemDotActive : styles.statusItemDotPending,
                  )}
                />
                <span>Custodial mode — no Canton Snap required</span>
              </div>
              <button className={styles.btnCancel} onClick={handleReset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Done step ── */}
        {step === "done" && receipt && (
          <PageCard className={styles.doneCard}>
            <div
              className={cn(
                styles.checkCircle,
                receiptStatus === "pending" && styles.checkCirclePending,
                receiptStatus === "failed" && styles.checkCircleFailed,
              )}
            >
              {receiptStatus === "pending" ? (
                <Spinner />
              ) : receiptStatus === "failed" ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6L18 18M18 6L6 18"
                    stroke="#0a0b14"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
                  <path
                    d="M2 10L10 18L26 2"
                    stroke="#0a0b14"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            <p className={styles.doneTitle}>
              {receiptStatus === "pending"
                ? "Transfer submitted"
                : receiptStatus === "failed"
                  ? "Transfer failed"
                  : "Transfer sent"}
            </p>
            <p className={styles.doneSubtitle}>
              {receiptStatus === "pending"
                ? "Awaiting confirmation on Canton Network…"
                : receiptStatus === "failed"
                  ? (revertReason ?? "Reverted on Canton Network.")
                  : "Transfer confirmed on Canton Network."}
            </p>

            <div className={styles.receipt}>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Amount</span>
                <span className={cn(styles.receiptValue, styles.receiptAmount)}>
                  {receipt.amount} {receipt.token.symbol}
                </span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>To</span>
                <span className={styles.receiptValue}>{receipt.to}</span>
              </div>
              {receipt.txHash && (
                <div className={styles.receiptRow}>
                  <span className={styles.receiptLabel}>Transaction</span>
                  <span className={styles.receiptValue}>{receipt.txHash}</span>
                </div>
              )}
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Status</span>
                <span className={styles.receiptValue}>
                  {receiptStatus === "pending"
                    ? "Pending"
                    : receiptStatus === "failed"
                      ? "Failed"
                      : "Confirmed"}
                </span>
              </div>
            </div>

            <div className={styles.doneActions}>
              <button className={styles.btnSendAnother} onClick={handleReset}>
                Send another
              </button>
              <button className={styles.btnViewActivity} onClick={() => onTabChange("activity")}>
                View in Activity →
              </button>
            </div>
          </PageCard>
        )}
      </DashboardLayout>
    </>
  );
}
