// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AmbientOrb } from "../components/AmbientOrb";
import { Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { Spinner } from "../components/Spinner";
import { TokenIcon } from "../components/TokenIcon";
import { cn } from "../lib/cn";
import { NETWORK } from "../lib/config";
import {
  CooldownActiveError,
  FaucetDrainedError,
  NotRegisteredError,
  getFaucetStatus,
  getFaucetTokens,
  getRecentDrips,
  requestDrip,
  type DripReceipt,
  type FaucetToken,
  type RecentDrip,
} from "../lib/faucet";
import {
  formatAgo,
  formatCooldownNoun,
  formatCountdown,
  isEvmAddress,
  shortenId,
} from "../lib/format";
import styles from "./FaucetPage.module.css";

const RECENT_DRIPS_LIMIT = 8;
const RECENT_DRIPS_REFRESH_MS = 30_000;
const STATUS_DEBOUNCE_MS = 400;

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="#00f0b8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FaucetPage() {
  const [tokens, setTokens] = useState<FaucetToken[] | null>(null);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const addressValid = isEvmAddress(address.trim());

  // Per-token cooldown expiry (epoch ms). No entry = available now.
  const [availableAt, setAvailableAt] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  const [dripping, setDripping] = useState(false);
  const [receipt, setReceipt] = useState<DripReceipt | null>(null);
  const [dripError, setDripError] = useState<string | null>(null);

  const [recent, setRecent] = useState<RecentDrip[] | null>(null);

  // When a drip (or a 429) records a cooldown, status lookups that started
  // earlier are stale — applying one would wipe the fresh entry and re-enable
  // the button. Stamp cooldown writes so older responses get dropped.
  const cooldownWrittenAtRef = useRef(0);

  const loadTokens = useCallback(() => {
    // setTokensError via .then() so it's in a callback, not the synchronous
    // effect body (react-hooks/set-state-in-effect).
    Promise.resolve()
      .then(() => setTokensError(null))
      .then(() => getFaucetTokens(NETWORK.middlewareUrl))
      .then((items) => {
        const enabled = items.filter((t) => t.enabled);
        setTokens(enabled);
        setSelected((cur) => cur ?? enabled[0]?.symbol ?? null);
      })
      .catch((e: unknown) => setTokensError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(loadTokens, [loadTokens]);

  const refreshRecent = useCallback(() => {
    getRecentDrips(NETWORK.middlewareUrl, RECENT_DRIPS_LIMIT)
      .then(setRecent)
      .catch(() => {
        // The feed is decorative — leave the previous value on failure.
      });
  }, []);

  useEffect(() => {
    refreshRecent();
    const id = setInterval(refreshRecent, RECENT_DRIPS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshRecent]);

  // The server may omit retry_after_seconds; assume the token's full cooldown
  // so the button still shows a countdown instead of silently re-enabling.
  const fallbackCooldownSeconds = useCallback(
    (symbol: string) => tokens?.find((t) => t.symbol === symbol)?.cooldownSeconds ?? 3600,
    [tokens],
  );

  // Cooldown lookup for the typed address, debounced. Advisory only — the
  // drip endpoint enforces the real limit, so a failed lookup just clears.
  useEffect(() => {
    const addr = address.trim();
    if (!isEvmAddress(addr)) {
      const clear = setTimeout(() => setAvailableAt({}), 0);
      return () => clearTimeout(clear);
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const startedAt = Date.now();
      getFaucetStatus(NETWORK.middlewareUrl, addr)
        .then((items) => {
          if (cancelled || startedAt < cooldownWrittenAtRef.current) return;
          const next: Record<string, number> = {};
          for (const item of items) {
            if (!item.available) {
              next[item.token] =
                Date.now() + (item.retryAfterSeconds ?? fallbackCooldownSeconds(item.token)) * 1000;
            }
          }
          setAvailableAt(next);
        })
        .catch(() => {
          if (!cancelled && startedAt >= cooldownWrittenAtRef.current) setAvailableAt({});
        });
    }, STATUS_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [address, fallbackCooldownSeconds]);

  const selectedToken = useMemo(
    () => tokens?.find((t) => t.symbol === selected) ?? null,
    [tokens, selected],
  );

  const selectedAvailableAt = selected !== null ? availableAt[selected] : undefined;
  const cooldownRemaining = selectedAvailableAt
    ? Math.max(0, Math.ceil((selectedAvailableAt - now) / 1000))
    : 0;

  // Tick the countdown only while one is showing. Sync immediately — `now`
  // may be stale from a render seconds ago, which would overshoot the first
  // displayed remaining time. Once the cooldown lapses, drop its entry so the
  // interval stops instead of re-rendering an idle page forever.
  useEffect(() => {
    if (!selectedAvailableAt || selected === null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= selectedAvailableAt) {
        setAvailableAt((cur) => {
          const { [selected]: _expired, ...rest } = cur;
          return rest;
        });
      }
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [selectedAvailableAt, selected]);

  function selectToken(symbol: string) {
    setSelected(symbol);
    setReceipt(null);
    setDripError(null);
  }

  function updateAddress(value: string) {
    setAddress(value);
    setReceipt(null);
    setDripError(null);
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) updateAddress(text.trim());
    } catch {
      // Clipboard access denied — user can paste manually.
    }
  }

  async function handleDrip() {
    if (!selectedToken || !addressValid || dripping) return;
    const addr = address.trim();
    setDripping(true);
    setReceipt(null);
    setDripError(null);
    try {
      const result = await requestDrip(NETWORK.middlewareUrl, addr, selectedToken.symbol);
      setReceipt(result);
      const nextAt = result.nextAvailableAt ? Date.parse(result.nextAvailableAt) : NaN;
      cooldownWrittenAtRef.current = Date.now();
      setAvailableAt((cur) => ({
        ...cur,
        [selectedToken.symbol]: Number.isNaN(nextAt)
          ? Date.now() + selectedToken.cooldownSeconds * 1000
          : nextAt,
      }));
      refreshRecent();
    } catch (e: unknown) {
      if (e instanceof NotRegisteredError) {
        setDripError(
          "This address isn't registered on Canton yet. Connect it in the dapp and register first, then come back.",
        );
      } else if (e instanceof CooldownActiveError) {
        setDripError(
          "This address already got a drip recently — the countdown shows when the next one unlocks.",
        );
        const retrySeconds =
          e.retryAfterSeconds > 0 ? e.retryAfterSeconds : selectedToken.cooldownSeconds;
        cooldownWrittenAtRef.current = Date.now();
        setAvailableAt((cur) => ({
          ...cur,
          [selectedToken.symbol]: Date.now() + retrySeconds * 1000,
        }));
      } else if (e instanceof FaucetDrainedError) {
        setDripError(
          `The faucet is out of ${selectedToken.symbol} right now. Try again later or pick another token.`,
        );
      } else {
        setDripError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setDripping(false);
    }
  }

  const dripDisabled =
    !addressValid || !selectedToken || dripping || cooldownRemaining > 0 || tokens === null;

  let dripLabel = "Drip tokens";
  if (cooldownRemaining > 0) dripLabel = `Next drip in ${formatCountdown(cooldownRemaining)}`;
  else if (dripping) dripLabel = "Dripping…";
  else if (selectedToken) dripLabel = `Drip ${selectedToken.dripAmount} ${selectedToken.symbol}`;

  return (
    <div className={styles.root}>
      <AmbientOrb opacity={0.16} size={840} y="8%" />

      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">
            <Logo />
          </div>
          <div>
            <div className="topbar-logo-text">Canton Faucet</div>
            <div className={styles.brandSub}>EVM Middleware</div>
          </div>
        </div>
        <div className="pill" aria-label={`Network: ${NETWORK.name}`}>
          <span className="pill-dot" style={{ background: NETWORK.color }} />
          <span>{NETWORK.name}</span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={cn("card", styles.card, "animate-fade-in")}>
          <p className={styles.eyebrow}>{NETWORK.name} · Faucet</p>
          <h1 className={styles.title}>Test tokens, on tap.</h1>
          <p className={styles.subtitle}>
            Fund any registered devnet address with test tokens. Free, rate-limited, no wallet
            connection needed.
          </p>

          {tokensError && (
            <div className="error-banner" style={{ marginBottom: 20 }}>
              Couldn't load faucet tokens. {tokensError}{" "}
              <button className="btn btn-ghost" onClick={loadTokens}>
                Retry
              </button>
            </div>
          )}

          {tokens === null && !tokensError && (
            <div className={styles.loading}>
              <Spinner size={40} />
            </div>
          )}

          {tokens !== null && tokens.length > 0 && (
            <>
              <div className={styles.tokenGrid} role="radiogroup" aria-label="Token">
                {tokens.map((t) => (
                  <button
                    key={t.symbol}
                    role="radio"
                    aria-checked={t.symbol === selected}
                    className={cn(
                      styles.tokenOption,
                      t.symbol === selected && styles.tokenOptionOn,
                    )}
                    onClick={() => selectToken(t.symbol)}
                  >
                    <TokenIcon symbol={t.symbol} />
                    <span className={styles.tokenSym}>{t.symbol}</span>
                    <span className={styles.tokenAmt}>{t.dripAmount} / drip</span>
                  </button>
                ))}
              </div>

              <label className={styles.fieldLabel} htmlFor="faucet-address">
                Recipient address
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="faucet-address"
                  className={styles.input}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="0x0000…0000"
                  value={address}
                  onChange={(e) => updateAddress(e.target.value)}
                />
                <button className={styles.pasteBtn} type="button" onClick={handlePaste}>
                  Paste
                </button>
              </div>
              {address.trim() !== "" && !addressValid && (
                <p className={styles.inputHint}>
                  Enter a full EVM address (0x + 40 hex characters).
                </p>
              )}

              <Button className={styles.drip} onClick={handleDrip} disabled={dripDisabled}>
                {dripping && <Spinner size={16} color="#0a0b14" />}
                {dripLabel}
              </Button>

              {dripError && (
                <div className="error-banner" style={{ marginTop: 18 }}>
                  {dripError}
                </div>
              )}

              {receipt && (
                <div className={cn(styles.receipt, "animate-fade-in")}>
                  <div className={styles.receiptTitle}>
                    <CheckIcon />
                    {receipt.kind === "offer"
                      ? `${receipt.amount} ${receipt.token} offer sent`
                      : `${receipt.amount} ${receipt.token} sent`}
                  </div>
                  <div className={styles.receiptDetail}>
                    {receipt.kind === "offer" ? (
                      <>
                        Accept it from Offers in the dapp
                        {receipt.expiresAt &&
                          ` before ${new Date(receipt.expiresAt).toLocaleString()}`}
                        .
                        {receipt.contractId && (
                          <span className={styles.receiptId}>
                            {" "}
                            offer {shortenId(receipt.contractId)}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        Arriving in your dapp balance shortly.
                        {receipt.txId && (
                          <span className={styles.receiptId}> tx {shortenId(receipt.txId)}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              <p className={styles.meta}>
                {selectedToken && (
                  <span>1 drip / token / {formatCooldownNoun(selectedToken.cooldownSeconds)}</span>
                )}
                <span className={styles.metaSep}>·</span>
                <span>No sign-in</span>
                <span className={styles.metaSep}>·</span>
                <span>Devnet only — tokens have no value</span>
              </p>
            </>
          )}

          {tokens !== null && tokens.length === 0 && (
            <p className={styles.subtitle}>The faucet has no tokens enabled right now.</p>
          )}
        </div>

        {recent !== null && recent.length > 0 && (
          <section className={cn(styles.drips, "animate-fade-in")} aria-label="Recent drips">
            <h2 className={styles.dripsHead}>
              <span className={styles.dripsDot} />
              Recent drips
            </h2>
            {recent.map((d, i) => (
              <div key={`${d.createdAt}-${d.address}-${i}`} className={styles.dripRow}>
                <TokenIcon symbol={d.token} size={22} />
                <span className={styles.dripAddr}>{d.address}</span>
                <span className={styles.dripQty}>
                  {d.amount} {d.token}
                </span>
                <span className={styles.dripAgo}>{formatAgo(d.createdAt)}</span>
              </div>
            ))}
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Free test tokens on {NETWORK.name}.</span>
        <a
          href="https://github.com/chainsafe/canton-snap"
          target="_blank"
          rel="noreferrer"
          className={styles.footerLink}
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
