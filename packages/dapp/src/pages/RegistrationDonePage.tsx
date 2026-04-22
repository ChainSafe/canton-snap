import { TopBar } from "../components/TopBar";
import { AmbientOrb } from "../components/AmbientOrb";
import { Button } from "../components/Button";
import { CopyButton } from "../components/CopyButton";
import { cn } from "../lib/cn";
import { type NetworkId } from "../lib/config";
import styles from "./RegistrationDonePage.module.css";

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  cantonPartyId: string;
  fingerprint: string;
  snapInstalled?: boolean;
  wasAlreadyRegistered?: boolean;
  onDashboard: () => void;
  onDisconnect: () => void;
}

export function RegistrationDonePage({
  address,
  network,
  onNetworkChange,
  cantonPartyId,
  fingerprint,
  snapInstalled,
  wasAlreadyRegistered,
  onDashboard,
  onDisconnect,
}: Props) {
  return (
    <div className="page">
      <AmbientOrb opacity={0.22} size={920} y="58%" />
      <TopBar
        address={address}
        snapInstalled={snapInstalled}
        network={network}
        onNetworkChange={onNetworkChange}
        onDisconnect={onDisconnect}
      />

      <main className={styles.main}>
        <div className={styles.checkWrap}>
          <div className={styles.checkGlow} />
          <div className={styles.checkCircle}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <path
                d="M9 18 L15 24 L27 12"
                stroke="#0a0b14"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h1 className={styles.title}>
          {wasAlreadyRegistered ? "Already registered" : "You're registered"}
        </h1>

        <p className={styles.subtitle}>
          {wasAlreadyRegistered
            ? "This address already has a Canton party. Head to the dashboard to get started."
            : "Your Canton party is ready. Head to the dashboard to see your balances."}
        </p>

        {cantonPartyId && (
          <div className={cn("card", styles.partyCard)}>
            <div className="info-row">
              <div className={styles.infoContent}>
                <p className="info-label">CANTON PARTY ID</p>
                <p className="info-value">
                  {cantonPartyId.slice(0, 30)}
                  {cantonPartyId.length > 30 ? "…" : ""}
                </p>
                {cantonPartyId.length > 30 && (
                  <p className="info-value-sub">{cantonPartyId.slice(30)}</p>
                )}
              </div>
              <CopyButton text={cantonPartyId} />
            </div>

            <div className="divider" />

            <div className="info-row">
              <div className={styles.infoContent}>
                <p className="info-label">FINGERPRINT</p>
                <p className="info-value">{fingerprint || "—"}</p>
              </div>
              {fingerprint && <CopyButton text={fingerprint} />}
            </div>
          </div>
        )}

        <Button className={styles.cta} onClick={onDashboard}>
          Go to dashboard →
        </Button>
      </main>
    </div>
  );
}
