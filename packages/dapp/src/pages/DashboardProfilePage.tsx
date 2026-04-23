import { useState, useRef, useEffect } from "react";
import { CopyButton } from "../components/CopyButton";
import { Logo } from "../components/Logo";
import { NetworkSwitcher } from "../components/NetworkSwitcher";
import { WalletMenu } from "../components/WalletMenu";
import { shortenAddress } from "../lib/ethereum";
import { getNetwork, type NetworkId } from "../lib/config";
import { cn } from "../lib/cn";
import { checkMiddlewareHealth } from "../lib/middleware";
import type { UserProfile } from "../lib/middleware";
import styles from "./DashboardProfilePage.module.css";

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  profile: UserProfile;
  snapInstalled: boolean;
  snapVersion: string | null;
  onDisconnect: () => void;
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
  { id: "profile", label: "Profile", Icon: ProfileIcon },
  { id: "balances", label: "Balances", Icon: BalancesIcon },
  { id: "transfer", label: "Transfer", Icon: TransferIcon },
  { id: "bridge", label: "Bridge", Icon: BridgeIcon },
  { id: "activity", label: "Activity", Icon: ActivityIcon },
] as const;

export function DashboardProfilePage({
  address,
  network,
  onNetworkChange,
  profile,
  snapInstalled,
  snapVersion,
  onDisconnect,
}: Props) {
  const [walletOpen, setWalletOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [middlewareHealthy, setMiddlewareHealthy] = useState<boolean | null>(null);
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
  const isNonCustodial = profile.keyMode === "external";

  useEffect(() => {
    setMiddlewareHealthy(null);
    checkMiddlewareHealth(currentNet.middlewareUrl).then(setMiddlewareHealthy);
  }, [currentNet.middlewareUrl]);

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
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={cn(styles.navItem, id === "profile" && styles.navItemActive)}
              disabled={id !== "profile"}
              aria-current={id === "profile" ? "page" : undefined}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
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
                snapInstalled={snapInstalled}
                onDisconnect={() => {
                  setWalletOpen(false);
                  onDisconnect();
                }}
              />
            )}
          </div>
        </div>

        {/* Page heading */}
        <h1 className={styles.pageTitle}>Profile</h1>
        <p className={styles.pageSubtitle}>Your Canton identity and quick actions.</p>

        {/* ── Identity card ── */}
        <div className={styles.identityCard}>
          <div>
            <p className={styles.sectionLabel}>CANTON PARTY</p>
            <div className={styles.partyIdRow}>
              <div style={{ minWidth: 0 }}>
                {(() => {
                  const sep = profile.cantonPartyId.indexOf("::");
                  const head =
                    sep >= 0 ? profile.cantonPartyId.slice(0, sep) : profile.cantonPartyId;
                  const cont = sep >= 0 ? profile.cantonPartyId.slice(sep) : "";
                  return (
                    <>
                      <p className={styles.partyId}>{head}</p>
                      {cont && <p className={styles.partyIdCont}>{cont}</p>}
                    </>
                  );
                })()}
              </div>
              <CopyButton text={profile.cantonPartyId} />
            </div>

            <p className={styles.sectionLabel} style={{ marginTop: 4 }}>
              FINGERPRINT
            </p>
            <div className={styles.fingerprintRow}>
              <p className={styles.fingerprint}>{profile.fingerprint}</p>
              {profile.fingerprint && <CopyButton text={profile.fingerprint} />}
              <span
                className={cn(
                  "mode-tag",
                  isNonCustodial ? "mode-tag-noncustodial" : "mode-tag-custodial",
                )}
              >
                {isNonCustodial ? "NON-CUSTODIAL" : "CUSTODIAL"}
              </span>
            </div>
          </div>

          {/* Quick actions */}
          <div className={styles.quickActions}>
            <p className={styles.sectionLabel}>QUICK ACTIONS</p>
            <button className={styles.btnSend} disabled>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M2 10H18M12 4L18 10L12 16"
                  stroke="#0a0b14"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <span className={styles.btnActionTitle}>Send tokens</span>
                <span className={styles.btnActionSub}>Transfer on Canton Network</span>
              </div>
            </button>
            <button className={styles.btnBridge} disabled>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M2 7H14M11 4L14 7L11 10M18 13H6M9 10L6 13L9 16"
                  stroke="var(--text-secondary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <span className={styles.btnBridgeTitle}>Bridge assets</span>
                <span className={styles.btnBridgeSub}>Move between networks</span>
              </div>
            </button>
          </div>
        </div>

        {/* ── Connection card ── */}
        <div className={styles.connectionCard}>
          <p className={styles.connectionCardTitle}>Connection</p>
          <div className={styles.connectionGrid}>
            <div>
              <p className={styles.sectionLabel}>METAMASK</p>
              <div className={styles.connStatus}>
                <span className={cn(styles.connDot, styles.connDotGreen)} />
                <span className={styles.connLabel}>Connected</span>
              </div>
              <p className={styles.connMeta}>{shortenAddress(address)}</p>
            </div>

            <div>
              <p className={styles.sectionLabel}>CANTON SNAP</p>
              <div className={styles.connStatus}>
                <span
                  className={cn(
                    styles.connDot,
                    snapInstalled ? styles.connDotGreen : styles.connDotAmber,
                  )}
                />
                <span className={styles.connLabel}>
                  {snapInstalled
                    ? `Installed${snapVersion ? ` · v${snapVersion}` : ""}`
                    : "Not installed"}
                </span>
              </div>
            </div>

            <div>
              <p className={styles.sectionLabel}>MIDDLEWARE</p>
              <div className={styles.connStatus}>
                {middlewareHealthy !== null && (
                  <span
                    className={cn(
                      styles.connDot,
                      middlewareHealthy ? styles.connDotGreen : styles.connDotAmber,
                    )}
                  />
                )}
                <span className={styles.connLabel}>
                  {middlewareHealthy === null
                    ? currentNet.name
                    : middlewareHealthy
                      ? `${currentNet.name} · Connected`
                      : `${currentNet.name} · Unreachable`}
                </span>
              </div>
              <p className={styles.connMeta}>{currentNet.host}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
