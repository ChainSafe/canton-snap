import { useState, useEffect } from "react";
import { CopyButton } from "../components/CopyButton";
import { DashboardLayout, type DashboardTab } from "../components/DashboardLayout";
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
  onInstallSnap: () => Promise<boolean>;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onDisconnect: () => void;
}

export function DashboardProfilePage({
  address,
  network,
  onNetworkChange,
  profile,
  snapInstalled,
  snapVersion,
  onInstallSnap,
  activeTab,
  onTabChange,
  onDisconnect,
}: Props) {
  const [reinstalling, setReinstalling] = useState(false);
  const [healthCache, setHealthCache] = useState<{ url: string; healthy: boolean } | null>(null);

  const currentNet = getNetwork(network);
  const isNonCustodial = profile.keyMode === "external";
  const middlewareHealthy =
    healthCache?.url === currentNet.middlewareUrl ? healthCache.healthy : null;

  useEffect(() => {
    let cancelled = false;
    checkMiddlewareHealth(currentNet.middlewareUrl).then((healthy) => {
      if (!cancelled) setHealthCache({ url: currentNet.middlewareUrl, healthy });
    });
    return () => {
      cancelled = true;
    };
  }, [currentNet.middlewareUrl]);

  return (
    <DashboardLayout
      address={address}
      network={network}
      onNetworkChange={onNetworkChange}
      activeTab={activeTab}
      onTabChange={onTabChange}
      onDisconnect={onDisconnect}
    >
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
                const head = sep >= 0 ? profile.cantonPartyId.slice(0, sep) : profile.cantonPartyId;
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
            {!snapInstalled && isNonCustodial && (
              <button
                className={styles.reinstallBtn}
                disabled={reinstalling}
                onClick={async () => {
                  setReinstalling(true);
                  try {
                    await onInstallSnap();
                  } finally {
                    setReinstalling(false);
                  }
                }}
              >
                {reinstalling ? "Installing…" : "Re-install snap →"}
              </button>
            )}
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
    </DashboardLayout>
  );
}
