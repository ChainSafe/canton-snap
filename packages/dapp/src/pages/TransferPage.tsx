import { useState, useEffect } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
import { Spinner } from "../components/Spinner";
import { getNetwork, type NetworkId } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import { getTokenBalance, formatTokenAmount, encodeTransfer, parseTokenAmount, ethChainId } from "../lib/ethrpc";
import { prepareTransfer, executeTransfer, type PrepareResult } from "../lib/transfer";
import { addEthChain, sendEthTransaction, shortenAddress } from "../lib/ethereum";
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

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M8 16L13 21L24 11" stroke="#00d4a4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SnapIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M14 4L24 9.5V18.5L14 24L4 18.5V9.5L14 4Z" stroke="#00d4a4" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 10V14L17 16" stroke="#00d4a4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MetaMaskIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="10" fill="rgba(255,107,0,0.15)" />
      <path d="M9 10L14 7L19 10L14 13L9 10Z" fill="#ff6b00" opacity="0.8" />
      <path d="M9 10V18L14 21V13L9 10Z" fill="#ff6b00" opacity="0.5" />
      <path d="M19 10V18L14 21V13L19 10Z" fill="#ff6b00" opacity="0.7" />
    </svg>
  );
}

type StepState = "pending" | "active" | "done";

function StepsBar({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
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
      {steps.map(({ id, label }, i) => {
        const st = state(id);
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div className={styles.stepItem}>
              <div
                className={cn(
                  styles.stepDot,
                  st === "done" && styles.stepDotDone,
                  st === "active" && styles.stepDotActive,
                  st === "pending" && styles.stepDotPending,
                )}
              >
                {st === "done" ? "✓" : i + 1}
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
            {i < steps.length - 1 && <div className={styles.stepConnector} />}
          </div>
        );
      })}
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
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signPhase, setSignPhase] = useState<SignPhase>("idle");
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const snap = useSnap();
  const isNonCustodial = keyMode === "external";
  const currentNet = getNetwork(network);

  // Load token list
  useEffect(() => {
    setTokensLoading(true);
    getTokens(currentNet.middlewareUrl)
      .then((list) => {
        setTokens(list);
        if (list.length > 0) setSelectedToken(list[0]);
      })
      .catch(() => {})
      .finally(() => setTokensLoading(false));
  }, [currentNet.middlewareUrl]);

  // Load balance whenever selected token or address changes
  useEffect(() => {
    if (!selectedToken) { setBalance(null); return; }
    const rpcUrl = `${currentNet.middlewareUrl}/eth`;
    getTokenBalance(rpcUrl, selectedToken.address, address)
      .then(setBalance)
      .catch(() => setBalance(null));
  }, [selectedToken, currentNet.middlewareUrl, address]);

  // Auto-run prepare when entering sign step (non-custodial)
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

    return () => { cancelled = true; };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): string | null {
    if (!selectedToken) return "Select a token";
    if (!recipient.match(/^0x[0-9a-fA-F]{40}$/)) return "Enter a valid 0x EVM address";
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return "Enter a positive amount";
    if (balance !== null) {
      const parsed = parseTokenAmount(amount, selectedToken.decimals);
      if (parsed > balance) return "Amount exceeds your balance";
    }
    return null;
  }

  function handleContinue() {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setStep("sign");
  }

  // Non-custodial: snap sign + execute (prepare already done on step entry)
  async function handleSnapSign() {
    if (!prepared || !selectedToken) return;
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

  // Custodial: add Canton chain to MetaMask, then send via eth_sendTransaction
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

  const pillClass = isNonCustodial ? styles.modePillNonCustodial : styles.modePillCustodial;
  const pillLabel = isNonCustodial ? "NON-CUSTODIAL" : "CUSTODIAL";

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
          <span className={cn(styles.modePill, pillClass)}>{pillLabel}</span>
        </div>

        <StepsBar step={step} />

        {/* Error banner */}
        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* ── Details step ── */}
        {step === "details" && (
          <>
            <div className={styles.card}>
              {/* Token selector */}
              <div className={styles.fieldGroup}>
                <p className={styles.fieldLabel}>TOKEN</p>
                {tokensLoading ? (
                  <Spinner />
                ) : (
                  <select
                    className={styles.tokenSelect}
                    value={selectedToken?.address ?? ""}
                    onChange={(e) => {
                      const t = tokens.find((tk) => tk.address === e.target.value) ?? null;
                      setSelectedToken(t);
                      setAmount("");
                    }}
                  >
                    {tokens.map((t) => (
                      <option key={t.address} value={t.address}>
                        {t.symbol} — {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Recipient */}
              <div className={styles.fieldGroup}>
                <p className={styles.fieldLabel}>RECIPIENT</p>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  spellCheck={false}
                />
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
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {balance !== null && selectedToken && (
                    <button
                      className={styles.maxBtn}
                      onClick={() => setAmount(formatTokenAmount(balance, selectedToken.decimals))}
                      type="button"
                    >
                      MAX
                    </button>
                  )}
                </div>
                {balance !== null && selectedToken && (
                  <p className={styles.balanceHint}>
                    Balance: {formatTokenAmount(balance, selectedToken.decimals)} {selectedToken.symbol}
                  </p>
                )}
              </div>

              {/* Info strip */}
              <div className={styles.infoStrip}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 6V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="7" cy="4" r="0.7" fill="currentColor" />
                </svg>
                {isNonCustodial
                  ? "Gas-free on Canton · Settles in ~2–4s · You'll sign twice (MetaMask + Snap)"
                  : "Gas-free on Canton · Settles in ~2–4s · One MetaMask confirmation"}
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.btnContinue} onClick={handleContinue}>
                Continue
              </button>
            </div>
          </>
        )}

        {/* ── Sign step (non-custodial) ── */}
        {step === "sign" && isNonCustodial && (
          <>
            <div className={styles.signCard}>
              <div className={cn(styles.signIcon, styles.signIconSnap)}>
                {pending && signPhase !== "awaiting-snap" ? <Spinner /> : <SnapIcon />}
              </div>

              <p className={styles.signTitle}>Sign in Canton Snap</p>
              <p className={styles.signSubtitle}>
                {signPhase === "preparing"
                  ? "Authenticating with MetaMask…"
                  : "Review the transfer in your Canton Snap, then approve."}
              </p>

              {prepared && (
                <div className={styles.hashPreview}>
                  <span style={{ color: "var(--text-muted)", fontSize: 10, letterSpacing: 1 }}>TX HASH </span>
                  {prepared.transactionHash}
                </div>
              )}

              <button
                className={styles.btnOpenDialog}
                onClick={handleSnapSign}
                disabled={pending || signPhase !== "awaiting-snap"}
              >
                {pending && signPhase === "signing" ? "Signing…" : "Open snap dialog"}
              </button>

              <div className={styles.signStatus}>
                <div className={styles.statusRow}>
                  <span
                    className={cn(
                      styles.statusDot,
                      signPhase === "preparing" ? styles.statusDotActive : styles.statusDotDone,
                    )}
                  />
                  <span className={signPhase !== "preparing" ? styles.statusDone : ""}>
                    Authenticated with MetaMask
                  </span>
                </div>
                <div className={styles.statusRow}>
                  <span
                    className={cn(
                      styles.statusDot,
                      signPhase === "preparing"
                        ? styles.statusDotPending
                        : signPhase === "awaiting-snap"
                          ? styles.statusDotDone
                          : styles.statusDotDone,
                    )}
                  />
                  <span className={prepared ? styles.statusDone : ""}>Transaction prepared</span>
                </div>
                <div className={styles.statusRow}>
                  <span
                    className={cn(
                      styles.statusDot,
                      signPhase === "signing" || signPhase === "executing"
                        ? styles.statusDotActive
                        : styles.statusDotPending,
                    )}
                  />
                  <span>Canton Snap signing</span>
                </div>
              </div>

              <button className={styles.btnCancel} onClick={handleReset}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ── Sign step (custodial) ── */}
        {step === "sign" && !isNonCustodial && selectedToken && (
          <>
            <div className={styles.signCard}>
              <div className={cn(styles.signIcon, styles.signIconMetaMask)}>
                {pending ? <Spinner /> : <MetaMaskIcon />}
              </div>

              <p className={styles.signTitle}>Confirm in MetaMask</p>
              <p className={styles.signSubtitle}>
                Custodial mode — no Canton Snap required. The server co-signs the Canton side.
              </p>

              <div className={styles.contractPreview}>
                <span className={styles.contractCall}>
                  {selectedToken.symbol.toLowerCase()}.transfer(
                  {shortenAddress(recipient)}, {parseTokenAmount(amount, selectedToken.decimals).toString()})
                </span>
                {" "}via /eth
              </div>

              <button
                className={styles.btnOpenDialog}
                onClick={handleMetaMaskSign}
                disabled={pending}
              >
                {pending ? "Waiting for MetaMask…" : "Open MetaMask"}
              </button>

              <div className={styles.signStatus}>
                <div className={styles.statusRow}>
                  <span className={cn(styles.statusDot, pending ? styles.statusDotActive : styles.statusDotPending)} />
                  <span>MetaMask confirmation</span>
                </div>
                <div className={styles.statusRow}>
                  <span className={cn(styles.statusDot, styles.statusDotPending)} />
                  <span>Server signs Canton side</span>
                </div>
              </div>

              <button className={styles.btnCancel} onClick={handleReset}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ── Done step ── */}
        {step === "done" && receipt && (
          <div className={styles.doneCard}>
            <div className={styles.checkCircle}>
              <CheckIcon />
            </div>

            <p className={styles.doneTitle}>Transfer sent</p>
            <p className={styles.doneSubtitle}>Settled on Canton in under 4 seconds.</p>

            <div className={styles.receipt}>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>AMOUNT</span>
                <span className={cn(styles.receiptValue, styles.receiptAmount)}>
                  {receipt.amount} {receipt.token.symbol}
                </span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>TO</span>
                <span className={styles.receiptValue}>{receipt.to}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>TX HASH</span>
                <span className={styles.receiptValue}>{receipt.txHash}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>COMPLETED</span>
                <span className={styles.receiptValue}>Just now</span>
              </div>
            </div>

            <div className={styles.doneActions}>
              <button className={styles.btnSendAnother} onClick={handleReset}>
                Send another
              </button>
            </div>
          </div>
        )}
      </DashboardLayout>
    </>
  );
}
