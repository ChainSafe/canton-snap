// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { NETWORK } from "../lib/config";
import type { NetworkConfig } from "../lib/config";
import { getTokens, type TokenConfig } from "../lib/middleware";
import { TOKEN_COLORS } from "../lib/tokens";
import { useMetaMaskImport, type TokenImportState } from "../hooks/useMetaMaskImport";
import { cn } from "../lib/cn";
import styles from "./ImportTokensBanner.module.css";

// How many token avatars to show before collapsing the rest into a "+N" badge.
// Keeps the preview compact no matter how many tokens the network exposes.
const MAX_AVATARS = 5;

function WalletPlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
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

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.5L5.5 10.5L11.5 3.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statusFor(token: TokenConfig, states: Record<string, TokenImportState>) {
  return states[token.address]?.status ?? "idle";
}

function TokenAvatar({
  token,
  status,
  index,
}: {
  token: TokenConfig;
  status: TokenImportState["status"];
  index: number;
}) {
  const colors = TOKEN_COLORS[token.symbol.toUpperCase()] ?? { bg: "#656a8a", text: "#ffffff" };
  return (
    <span
      className={styles.avatar}
      // Stack later avatars beneath earlier ones so the overlap reads left-to-right.
      style={{ background: colors.bg, color: colors.text, zIndex: MAX_AVATARS - index }}
      title={
        status === "success"
          ? `${token.symbol} — added`
          : status === "error"
            ? `${token.symbol} — not added`
            : token.symbol
      }
    >
      {token.symbol.charAt(0).toUpperCase()}
      {status === "pending" && <span className={styles.avatarSpinner} />}
      {status === "success" && (
        <span className={cn(styles.avatarBadge, styles.avatarBadgeOk)}>
          <CheckIcon size={9} />
        </span>
      )}
      {status === "error" && (
        <span className={cn(styles.avatarBadge, styles.avatarBadgeErr)}>!</span>
      )}
    </span>
  );
}

/**
 * Presentational "Add your tokens to MetaMask" surface. Rendered as a full-width
 * `banner` (atop the balances list) or a centred `card` (after registration).
 * State is driven entirely by props so a parent that already owns a
 * useMetaMaskImport instance (the balances page) stays the single source of
 * truth — see MetaMaskImportPanel for the self-contained variant.
 */
export function ImportTokensBanner({
  variant,
  tokens,
  tokenStates,
  importingAll,
  onImportAll,
}: {
  variant: "banner" | "card";
  tokens: TokenConfig[];
  tokenStates: Record<string, TokenImportState>;
  importingAll: boolean;
  onImportAll: () => void;
}) {
  if (tokens.length === 0) return null;

  const total = tokens.length;
  const importedCount = tokens.filter((t) => statusFor(t, tokenStates) === "success").length;
  const remaining = total - importedCount;
  const allImported = remaining === 0;

  const visible = tokens.slice(0, MAX_AVATARS);
  const overflow = total - visible.length;

  const buttonLabel = importingAll
    ? `Adding… ${importedCount}/${total}`
    : importedCount > 0
      ? `Add ${remaining} more`
      : total === 1
        ? "Add to MetaMask"
        : `Add all ${total} to MetaMask`;

  const statusLabel = allImported
    ? `All ${total} ${total === 1 ? "token" : "tokens"} added`
    : importedCount > 0
      ? `${importedCount} of ${total} added`
      : `${total} ${total === 1 ? "token" : "tokens"}`;

  return (
    <div className={cn(styles.root, variant === "card" ? styles.card : styles.banner)}>
      <div className={styles.head}>
        <div className={cn(styles.iconWrap, allImported && styles.iconWrapDone)}>
          {allImported ? <CheckIcon size={18} /> : <WalletPlusIcon />}
        </div>
        <div className={styles.copy}>
          <p className={styles.title}>
            {allImported ? "Your tokens are in MetaMask" : "Add your tokens to MetaMask"}
          </p>
          <p className={styles.subtitle}>
            {allImported
              ? "View and send these tokens directly from your wallet."
              : "Import them so balances and transfers show in MetaMask."}
          </p>
        </div>
      </div>

      <div className={styles.foot}>
        <div className={styles.preview}>
          <div className={styles.avatars}>
            {visible.map((token, i) => (
              <TokenAvatar
                key={token.address}
                token={token}
                status={statusFor(token, tokenStates)}
                index={i}
              />
            ))}
            {overflow > 0 && <span className={styles.avatarMore}>+{overflow}</span>}
          </div>
          <span className={styles.previewLabel}>{statusLabel}</span>
        </div>

        {!allImported && (
          <Button
            variant="primary"
            onClick={onImportAll}
            disabled={importingAll}
            className={styles.action}
          >
            {importingAll && <Spinner size={14} color="#0a0b14" />}
            {buttonLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Self-contained variant: fetches the token list and owns its own
 * useMetaMaskImport instance. Use this where there's no existing import state to
 * share (e.g. the post-registration screen). Renders nothing until at least one
 * token is known.
 */
export function MetaMaskImportPanel({
  address,
  variant = "card",
  network = NETWORK,
}: {
  address: string;
  variant?: "banner" | "card";
  network?: NetworkConfig;
}) {
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const { tokenStates, importAll, importingAll } = useMetaMaskImport(network, address);

  useEffect(() => {
    let cancelled = false;
    getTokens(network.middlewareUrl)
      .then((items) => {
        if (!cancelled) setTokens(items);
      })
      .catch(() => {
        // No tokens to import (or middleware unreachable) — render nothing.
      });
    return () => {
      cancelled = true;
    };
  }, [network.middlewareUrl]);

  if (tokens.length === 0) return null;

  return (
    <ImportTokensBanner
      variant={variant}
      tokens={tokens}
      tokenStates={tokenStates}
      importingAll={importingAll}
      onImportAll={() => void importAll(tokens)}
    />
  );
}
