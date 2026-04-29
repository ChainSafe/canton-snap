import { TopBar } from "../components/TopBar";
import { AmbientOrb } from "../components/AmbientOrb";
import { Button } from "../components/Button";
import { cn } from "../lib/cn";
import { type NetworkId } from "../lib/config";
import { colors } from "../lib/tokens";
import styles from "./RegistrationChoicePage.module.css";

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  onCustodial: () => void;
  onNonCustodial: () => void;
  onDisconnect: () => void;
}

function Bullet({ text }: { text: string }) {
  return (
    <div className={styles.bullet}>
      <span className={styles.bulletDot} />
      <span className={styles.bulletText}>{text}</span>
    </div>
  );
}

export function RegistrationChoicePage({
  address,
  network,
  onNetworkChange,
  onCustodial,
  onNonCustodial,
  onDisconnect,
}: Props) {
  return (
    <div className="page">
      <AmbientOrb opacity={0.14} size={840} y="62%" />

      <TopBar
        address={address}
        network={network}
        onNetworkChange={onNetworkChange}
        onDisconnect={onDisconnect}
      />

      <main className={styles.main}>
        <h1 className={styles.title}>Choose how to manage your Canton key</h1>
        <p className={styles.subtitle}>Same custodial vs self-custody choice you know from EVM.</p>

        <div className={styles.cards}>
          {/* Custodial */}
          <div className={cn("card", styles.card)}>
            <div className={cn(styles.iconWrap, styles.iconCustodial)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="3"
                  y="8"
                  width="14"
                  height="10"
                  rx="2"
                  stroke={colors.purple}
                  strokeWidth="1.8"
                />
                <path
                  d="M6 8 V6 C6 4 8 2 10 2 C12 2 14 4 14 6 V8"
                  stroke={colors.purple}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className={styles.cardTitle}>Custodial</h2>
            <p className={styles.cardDescription}>Server manages your Canton signing key.</p>
            <div className="divider" />
            <div className={styles.bullets}>
              <Bullet text="One-click registration" />
              <Bullet text="No snap installation required" />
              <Bullet text="Server signs transactions on your behalf" />
            </div>
            <Button variant="secondary" className={styles.cardCta} onClick={onCustodial}>
              Use Custodial
            </Button>
          </div>

          {/* Non-Custodial */}
          <div className={cn("card", styles.card, styles.cardTeal)}>
            <div className={cn(styles.iconWrap, styles.iconNonCustodial)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2 L3 5 V11 C3 15 6 18 10 19 C14 18 17 15 17 11 V5 Z"
                  stroke={colors.teal}
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 11 L9 13 L13 8"
                  stroke={colors.teal}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className={styles.cardTitle}>Non-Custodial</h2>
            <p className={styles.cardDescription}>MetaMask Snap holds your Canton key.</p>
            <div className="divider" />
            <div className={styles.bullets}>
              <Bullet text="Private key never leaves MetaMask" />
              <Bullet text="Requires MetaMask with the Canton Snap" />
              <Bullet text="You approve every signature" />
            </div>
            <Button variant="primary" className={styles.cardCta} onClick={onNonCustodial}>
              Use Non-Custodial
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
