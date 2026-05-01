import { useState, useRef, useEffect } from "react";
import { Logo } from "./Logo";
import { WalletMenu } from "./WalletMenu";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { shortenAddress } from "../lib/ethereum";
import { getNetwork, type NetworkId } from "../lib/config";
import styles from "./TopBar.module.css";

interface Props {
  address?: string | null;
  network?: NetworkId;
  onNetworkChange?: (id: NetworkId) => void;
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

export function TopBar({ address, network = "devnet", onNetworkChange, onDisconnect }: Props) {
  const [walletOpen, setWalletOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);

  const walletRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setWalletOpen(false);
      if (networkRef.current && !networkRef.current.contains(e.target as Node))
        setNetworkOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const currentNet = getNetwork(network);

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
          <div ref={networkRef} className={styles.pillAnchor}>
            <button
              className={`pill ${networkOpen ? "active-amber" : ""}`}
              onClick={() => {
                setNetworkOpen((o) => !o);
                setWalletOpen(false);
              }}
            >
              <span className="pill-dot" style={{ background: currentNet.color }} />
              <span>{currentNet.name}</span>
              <Caret open={networkOpen} />
            </button>
            {networkOpen && (
              <NetworkSwitcher
                current={network}
                onSelect={(id) => {
                  onNetworkChange?.(id as NetworkId);
                  setNetworkOpen(false);
                }}
              />
            )}
          </div>

          <div ref={walletRef} className={styles.pillAnchor}>
            <button
              className={`pill pill-mono ${walletOpen ? "active-teal" : ""}`}
              onClick={() => {
                setWalletOpen((o) => !o);
                setNetworkOpen(false);
              }}
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
