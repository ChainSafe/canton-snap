import { CopyButton } from "./CopyButton";
import { shortenAddress } from "../lib/ethereum";
import styles from "./WalletMenu.module.css";

interface Props {
  address: string;
  onDisconnect: () => void;
}

export function WalletMenu({ address, onDisconnect }: Props) {
  return (
    <div className="dropdown">
      <div className={styles.section}>
        <p className="dropdown-section-label">CONNECTED WALLET</p>
        <div className={`dropdown-row ${styles.walletRow}`}>
          <div className={styles.avatar}>
            <div className={styles.avatarRing} />
            <div className={styles.avatarDot} />
          </div>
          <p className={styles.walletAddress}>{shortenAddress(address, 6)}</p>
          <CopyButton text={address} />
        </div>
      </div>

      <button className="btn btn-danger" onClick={onDisconnect}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M7 4 H4 Q2 4 2 6 V10 Q2 12 4 12 H7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M11 6 L15 10 L11 14 M15 10 H6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Disconnect wallet
      </button>
    </div>
  );
}
