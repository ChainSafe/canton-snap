import { useState, useRef, useEffect } from "react";
import { Logo } from "./Logo";
import { WalletMenu } from "./WalletMenu";
import { shortenAddress } from "../lib/ethereum";
import { NETWORK } from "../lib/config";
import styles from "./TopBar.module.css";

interface Props {
  address?: string | null;
  onDisconnect?: () => void;
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg className="pill-caret" width="10" height="6" viewBox="0 0 10 6" fill="none">
      <path
        d={open ? "M1 5 L5 1 L9 5" : "M1 1 L5 5 L9 1"}
        stroke="#a1a6c4"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TopBar({ address, onDisconnect }: Props) {
  const [walletOpen, setWalletOpen] = useState(false);
  const walletRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setWalletOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-icon">
          <Logo />
        </div>
        <span className="topbar-logo-text">Canton dApp</span>
      </div>

      {address && (
        <div className={styles.walletActions}>
          <div className="pill pill-static" aria-label={`Network: ${NETWORK.name}`}>
            <span className="pill-dot" style={{ background: NETWORK.color }} />
            <span>{NETWORK.name}</span>
          </div>

          <div ref={walletRef} className={styles.pillAnchor}>
            <button
              className={`pill pill-mono ${walletOpen ? "active-teal" : ""}`}
              onClick={() => setWalletOpen((o) => !o)}
            >
              <span className="pill-dot" style={{ background: "#34d399" }} />
              <span>{shortenAddress(address)}</span>
              <Caret open={walletOpen} />
            </button>
            {walletOpen && (
              <WalletMenu
                address={address}
                onDisconnect={() => {
                  setWalletOpen(false);
                  onDisconnect?.();
                }}
              />
            )}
          </div>
        </div>
      )}
    </header>
  );
}
