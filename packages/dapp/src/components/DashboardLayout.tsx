// SPDX-License-Identifier: Apache-2.0

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Logo } from "./Logo";
import { WalletMenu } from "./WalletMenu";
import { shortenAddress } from "../lib/ethereum";
import { NETWORK } from "../lib/config";
import { cn } from "../lib/cn";
import styles from "./DashboardLayout.module.css";

export type DashboardTab = "profile" | "balances" | "transfer" | "offers" | "activity";

interface Props {
  address: string;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
  /** Page heading rendered in the shared header band, left of the pills. */
  title: string;
  subtitle?: string;
  /** Extra element on the title row (e.g. the Transfer page's mode pill). */
  titleExtra?: ReactNode;
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

function OffersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 7L10 3L17 7V13L10 17L3 13V7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M3 7L10 11L17 7M10 11V17"
        stroke="currentColor"
        strokeWidth="1.6"
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
  { id: "offers" as DashboardTab, label: "Offers", Icon: OffersIcon },
  { id: "activity" as DashboardTab, label: "Activity", Icon: ActivityIcon },
];

export function DashboardLayout({
  address,
  activeTab,
  onTabChange,
  onDisconnect,
  title,
  subtitle,
  titleExtra,
  children,
}: Props) {
  const [walletOpen, setWalletOpen] = useState(false);
  const walletRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setWalletOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setWalletOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className="topbar-logo-icon">
            <Logo />
          </div>
          <span className="topbar-logo-text">EVM Middleware</span>
        </div>
        <div className={styles.sidebarDivider} />
        <nav className={styles.sidebarNav}>
          {NAV.map(({ id, label, Icon }) => {
            const isActive = id === activeTab;
            return (
              <button
                key={id}
                className={cn(styles.navItem, isActive && styles.navItemActive)}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onTabChange(id)}
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
        {/* One shared content column: the page header and every card lay out in
            it, so titles and cards always share the same left/right edges. */}
        <div className={styles.content}>
          {/* Header band: side-band title on the left, network + wallet pills
              right-aligned on the same y-axis. */}
          <div className={styles.pageHead}>
            <div className={styles.pageHeadText}>
              <div className={styles.pageTitleRow}>
                <h1 className={styles.pageTitle}>{title}</h1>
                {titleExtra}
              </div>
              {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
            </div>

            <div className={styles.pageHeadPills}>
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
                      onDisconnect();
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
