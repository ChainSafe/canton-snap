import { useEffect, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { AmbientOrb } from '../components/AmbientOrb';
import { Spinner } from '../components/Spinner';
import { Button } from '../components/Button';
import { cn } from '../lib/cn';
import { type NetworkId } from '../lib/config';
import styles from './CustodialRegistrationPage.module.css';

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onRegister: () => void;
  onDisconnect: () => void;
}

function StatusIcon({ pending: _pending, error }: { pending: boolean; error: string | null }) {
  if (error) {
    return (
      <div className={styles.errorIcon}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 8 V15" stroke="#ff6b6b" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="14" cy="20" r="1.5" fill="#ff6b6b" />
        </svg>
      </div>
    );
  }
  return <Spinner size={64} />;
}

export function CustodialRegistrationPage({ address, network, onNetworkChange, pending, error, onBack, onRegister, onDisconnect }: Props) {
  useEffect(() => {
    void onRegister();
  }, [onRegister]);

  const [timestamp] = useState(() => Math.floor(Date.now() / 1000));

  return (
    <div className="page">
      <AmbientOrb opacity={0.14} size={840} y="62%" />
      <TopBar address={address} network={network} onNetworkChange={onNetworkChange} onDisconnect={onDisconnect} />

      <div className={styles.backBar}>
        <button className="back-link" onClick={onBack}>← Back to registration</button>
      </div>

      <main className={styles.main}>
        <div className={cn('card', styles.card)}>
          <div className={cn('mode-tag', 'mode-tag-custodial', styles.modeTag)}>CUSTODIAL</div>

          <div className={styles.spinnerWrap}>
            <StatusIcon pending={pending} error={error} />
          </div>

          <h2 className={styles.title}>Confirm in MetaMask</h2>

          <p className={styles.description}>
            Sign the registration message to prove you<br />
            own this wallet. The middleware will then<br />
            allocate a Canton party for you.
          </p>

          <div className={styles.messageSection}>
            <p className={styles.messageLabel}>Message you'll sign (EIP-191)</p>
            <div className={styles.messageBox}>
              <span className={styles.messageValue}>register:{timestamp}</span>
              <span className={styles.messageUtc}>UTC</span>
            </div>
          </div>

          {error && (
            <div className={cn('error-banner', styles.errorSection)}>
              {error}
              <div className={styles.retryWrap}>
                <Button variant="ghost" onClick={onRegister}>Try again</Button>
              </div>
            </div>
          )}

          {!error && (
            <p className={styles.waitingText}>
              Waiting for signature…{' '}
              <Button variant="ghost" onClick={onBack}>Cancel</Button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
