import { useState, useRef, useEffect, type ReactNode } from "react";
import { Logo } from "./Logo";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { WalletMenu } from "./WalletMenu";
import { shortenAddress } from "../lib/ethereum";
import { getNetwork, type NetworkId } from "../lib/config";
import { cn } from "../lib/cn";
import styles from "./DashboardLayout.module.css";

export type DashboardTab = "profile" | "balances" | "transfer";

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  children: ReactNode;
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

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 17C3 13 6 11 10 11C14 11 17 13 17 17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BalancesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 9H18" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="13" r="1.5" fill="currentColor" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 10H15M10 5L15 10L10 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BridgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 8H15M12 5L15 8L12 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 12H5M8 15L5 12L8 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6V10L13 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  { id: "profile" as DashboardTab, label: "Profile", Icon: ProfileIcon },
  { id: "balances" as DashboardTab, label: "Balances", Icon: BalancesIcon },
  { id: "transfer" as DashboardTab, label: "Transfer", Icon: TransferIcon },
  { id: "bridge", label: "Bridge", Icon: BridgeIcon, disabled: true },
  { id: "activity", label: "Activity", Icon: ActivityIcon, disabled: true },
];

export function DashboardLayout({
  address,
  network,
  onNetworkChange,
  activeTab,
  onTabChange,
  onDisconnect,
  children,
}: Props) {
  const [walletOpen, setWalletOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const walletRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setWalletOpen(false);
      if (networkRef.current && !networkRef.current.contains(e.target as Node))
        setNetworkOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setWalletOpen(false);
        setNetworkOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const currentNet = getNetwork(network);

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className="topbar-logo-icon">
            <Logo />
          </div>
          <span className="topbar-logo-text">Canton dApp</span>
        </div>
        <div className={styles.sidebarDivider} />
        <nav className={styles.sidebarNav}>
          {NAV.map(({ id, label, Icon, disabled }) => {
            const isActive = id === activeTab;
            const isDisabled = disabled === true;
            return (
              <button
                key={id}
                className={cn(styles.navItem, isActive && styles.navItemActive)}
                disabled={isDisabled}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  if (id === "profile" || id === "balances" || id === "transfer") onTabChange(id);
                }}
              >
                <Icon />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main area ── */}
      <div className={styles.main}>
        {/* Top-right pills */}
        <div className={styles.mainHeader}>
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
                  onNetworkChange(id as NetworkId);
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
                  onDisconnect();
                }}
              />
            )}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
