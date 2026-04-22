import { CopyButton } from './CopyButton';
import styles from './WalletMenu.module.css';

interface Props {
  address: string;
  snapInstalled?: boolean;
  onDisconnect: () => void;
}

export function WalletMenu({ address, snapInstalled, onDisconnect }: Props) {
  return (
    <div className="dropdown">
      <div className={styles.section}>
        <p className="dropdown-section-label">CONNECTED WALLET</p>
        <div className={`dropdown-row ${styles.walletRow}`}>
          <div className={styles.avatar}>
            <div className={styles.avatarRing} />
            <div className={styles.avatarDot} />
          </div>
          <div className={styles.walletAddress}>
            <p className={styles.addressTop}>{address.slice(0, 10)}</p>
            <p className={styles.addressBottom}>…{address.slice(-24)}</p>
          </div>
          <CopyButton text={address} />
        </div>
      </div>

      {snapInstalled && (
        <div className={styles.section}>
          <p className="dropdown-section-label">CANTON SNAP</p>
          <div className={`dropdown-row ${styles.snapRow}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 L3 5 V12 C3 17 7 20 12 22 C17 20 21 17 21 12 V5 Z" fill="rgba(0,212,164,0.12)" stroke="#00d4a4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 12 L11 15 L16 9" stroke="#00d4a4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className={styles.snapInfo}>
              <p className={styles.snapName}>Installed</p>
              <p className={styles.snapVersion}>v1.0.0 · npm:canton-snap</p>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11, fontWeight: 600 }} onClick={() => window.open('about:blank')}>
              Manage
            </button>
          </div>
        </div>
      )}

      <button className="btn btn-danger" onClick={onDisconnect}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M7 4 H4 Q2 4 2 6 V10 Q2 12 4 12 H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11 6 L15 10 L11 14 M15 10 H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Disconnect wallet
      </button>
    </div>
  );
}
