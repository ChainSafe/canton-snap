import { TopBar } from "../components/TopBar";
import { AmbientOrb } from "../components/AmbientOrb";
import { Button } from "../components/Button";
import styles from "./LandingPage.module.css";

interface Props {
  connecting: boolean;
  error: string | null;
  detected: boolean;
  onConnect: () => void;
}

export function LandingPage({ connecting, error, detected, onConnect }: Props) {
  return (
    <div className={styles.root}>
      <AmbientOrb opacity={0.18} size={840} y="62%" />

      <TopBar />

      <main className={styles.main}>
        <p className={styles.eyebrow}>Canton for EVM users</p>

        <h1 className={styles.title}>Use Canton like Ethereum</h1>

        <p className={styles.subtitle}>
          Register a Canton party, hold tokens, and transfer —<br />
          all with MetaMask you already have.
        </p>

        {!detected && (
          <div className="error-banner" style={{ marginTop: 32, maxWidth: 420, textAlign: "left" }}>
            MetaMask not detected. Open this page over HTTP and ensure MetaMask is installed.
          </div>
        )}

        {error && (
          <div className="error-banner" style={{ marginTop: 20, maxWidth: 420 }}>
            {error}
          </div>
        )}

        <Button className={styles.cta} onClick={onConnect} disabled={!detected || connecting}>
          {connecting ? "Connecting…" : "Connect MetaMask"}
        </Button>

        <p className={styles.installHint}>
          Don't have MetaMask?{" "}
          <a
            href="https://metamask.io/"
            target="_blank"
            rel="noreferrer"
            className={styles.installLink}
          >
            Install it →
          </a>
        </p>
      </main>

      <footer className="footer">
        <span>Your EVM wallet, on Canton Network.</span>
        <div className={styles.footerLinks}>
          <a
            href="https://github.com/chain-safe/canton-snap"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
