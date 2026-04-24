import { useState, useEffect, useRef } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { PageCard } from "../components/PageCard";
import { Spinner } from "../components/Spinner";
import { getNetwork, type NetworkId } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import {
  getTokenBalance,
  formatTokenAmount,
  encodeTransfer,
  parseTokenAmount,
  ethChainId,
} from "../lib/ethrpc";
import { prepareTransfer, executeTransfer, type PrepareResult } from "../lib/transfer";
import { addEthChain, sendEthTransaction, shortenAddress, toChecksumAddress } from "../lib/ethereum";
import { TOKEN_COLORS } from "../lib/tokens";
import { useSnap } from "../hooks/useSnap";
import { cn } from "../lib/cn";
import styles from "./TransferPage.module.css";

type Step = "details" | "sign" | "done";
type SignPhase = "idle" | "preparing" | "awaiting-snap" | "signing" | "executing";

interface Receipt {
  txHash: string;
  token: TokenConfig;
  amount: string;
  to: string;
}

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  keyMode: "custodial" | "external";
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
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={styles.tokenDropdownChevron}>
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
  network,
  onNetworkChange,
  activeTab,
  onTabChange,
  onDisconnect,
  keyMode,
}: Props) {
  const [step, setStep] = useState<Step>("details");
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TokenConfig | null>(null);
  const [balances, setBalances] = useState<Map<string, bigint>>(new Map());
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signPhase, setSignPhase] = useState<SignPhase>("idle");
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const snap = useSnap();
  const isNonCustodial = keyMode === "external";
  const currentNet = getNetwork(network);

  // Load token list then fetch all balances
  useEffect(() => {
    let cancelled = false;
    setTokensLoading(true);
    const rpcUrl = `${currentNet.middlewareUrl}/eth`;
    getTokens(currentNet.middlewareUrl)
      .then(async (list) => {
        if (cancelled) return;
        setTokens(list);
        if (list.length > 0) setSelectedToken(list[0]);
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
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTokensLoading(false); });
    return () => { cancelled = true; };
  }, [currentNet.middlewareUrl, address]);

  // Auto-run prepare when entering sign step (non-custodial only)
  useEffect(() => {
    if (step !== "sign" || !isNonCustodial || !selectedToken) return;
    let cancelled = false;
    setSignPhase("preparing");
    setPending(true);
    setError(null);

    prepareTransfer(currentNet.middlewareUrl, address, recipient, selectedToken.symbol, amount)
      .then((result) => {
        if (cancelled) return;
        setPrepared(result);
        setSignPhase("awaiting-snap");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError((e as Error).message);
        setStep("details");
        setSignPhase("idle");
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Intentionally depends only on [step]: prepare should fire once on entry to the sign
  // step, not re-run when form fields (recipient, amount, selectedToken) change mid-flight.
  }, [step]);

  function validate(): string | null {
    if (!selectedToken) return "Select a token";
    if (!recipient.match(/^0x[0-9a-fA-F]{40}$/)) return "Enter a valid 0x EVM address";
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return "Enter a positive amount";
    const bal = balances.get(selectedToken.address);
    if (bal !== undefined) {
      if (parseTokenAmount(amount, selectedToken.decimals) > bal) return "Amount exceeds your balance";
    }
    return null;
  }

  function handleContinue() {
    const err = validate();
    if (err) { setError(err); return; }
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
        operation: "transfer",
        tokenSymbol: selectedToken.symbol,
        amount,
        recipient,
        sender: address,
      });

      setSignPhase("executing");
      await executeTransfer(
        currentNet.middlewareUrl,
        address,
        prepared.transferId,
        derSignature,
        fingerprint,
      );

      setReceipt({ txHash: prepared.transactionHash, token: selectedToken, amount, to: recipient });
      setStep("done");
    } catch (e: unknown) {
      setError((e as Error).message);
      setSignPhase("awaiting-snap");
    } finally {
      setPending(false);
    }
  }

  async function handleMetaMaskSign() {
    if (!selectedToken) return;
    setPending(true);
    setError(null);
    try {
      const rpcUrl = `${currentNet.middlewareUrl}/eth`;
      const chainId = await ethChainId(rpcUrl);

      await addEthChain({
        chainId,
        chainName: currentNet.name,
        rpcUrls: [rpcUrl],
        nativeCurrency: { name: "Canton", symbol: "CANTON", decimals: 18 },
      });

      const amountBigInt = parseTokenAmount(amount, selectedToken.decimals);
      const data = encodeTransfer(recipient, amountBigInt);
      const txHash = await sendEthTransaction({ from: address, to: selectedToken.address, data });

      setReceipt({ txHash, token: selectedToken, amount, to: recipient });
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
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setRecipient(toChecksumAddress(text.trim()));
    } catch {
      // clipboard access denied — no-op
    }
  }

  function handleRecipientBlur() {
    if (recipient) setRecipient(toChecksumAddress(recipient));
  }

  const recipientValid = /^0x[0-9a-fA-F]{40}$/.test(recipient);
  const selectedBalance = selectedToken ? balances.get(selectedToken.address) : undefined;
  const pillClass = isNonCustodial ? styles.modePillNonCustodial : styles.modePillCustodial;

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

            {/* Recipient */}
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>RECIPIENT</p>
              <div className={styles.recipientWrapper}>
                <input
                  className={styles.recipientInput}
                  type="text"
                  placeholder="0x..."
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
                <p className={styles.recipientHint}>✓ Valid EVM address</p>
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
                  onChange={(e) => { setAmount(e.target.value); setError(null); }}
                />
                {selectedBalance !== undefined && selectedToken && (
                  <button
                    className={styles.maxBtn}
                    type="button"
                    onClick={() => { setAmount(formatTokenAmount(selectedBalance, selectedToken.decimals)); setError(null); }}
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

            {/* Info strip */}
            <div className={styles.infoStrip}>
              <InfoIcon />
              {isNonCustodial ? (
                <span>
                  Gas-free on Canton · Settles in ~2–4s · You&apos;ll sign{" "}
                  <strong style={{ color: "var(--text-primary)" }}>twice</strong> (MetaMask + Snap)
                </span>
              ) : (
                <span>
                  Gas-free on Canton · Settles in ~2–4s ·{" "}
                  <strong style={{ color: "var(--text-primary)" }}>one MetaMask signature</strong>{" "}
                  — server co-signs Canton side
                </span>
              )}
            </div>

            <button className={styles.btnContinue} onClick={handleContinue} disabled={tokensLoading}>
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
                  <path d="M9 14L12 17L19 11" stroke="#00d4a4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
              Sign the ERC-20 transfer — the middleware will co-sign on Canton.
            </p>

            <div className={styles.contractPreview}>
              <span className={styles.contractPreviewLabel}>
                CONTRACT CALL
                <span className={styles.contractVia}>via /eth</span>
              </span>
              <span className={styles.contractCall}>
                {selectedToken.symbol.toLowerCase()}.transfer({shortenAddress(recipient)},{" "}
                {parseTokenAmount(amount, selectedToken.decimals).toString()})
              </span>
            </div>

            <button className={styles.btnOpenDialog} onClick={handleMetaMaskSign} disabled={pending}>
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
            <div className={styles.checkCircle}>
              <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
                <path
                  d="M2 10L10 18L26 2"
                  stroke="#0a0b14"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p className={styles.doneTitle}>Transfer sent</p>
            <p className={styles.doneSubtitle}>Transfer confirmed on Canton Network.</p>

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
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Transaction</span>
                <span className={styles.receiptValue}>{receipt.txHash}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Completed</span>
                <span className={styles.receiptValue}>Just now</span>
              </div>
            </div>

            <div className={styles.doneActions}>
              <button className={styles.btnSendAnother} onClick={handleReset}>
                Send another
              </button>
              <button
                className={styles.btnViewActivity}
                onClick={() => onTabChange("balances")}
              >
                View in Activity →
              </button>
            </div>
          </PageCard>
        )}
      </DashboardLayout>
    </>
  );
}
