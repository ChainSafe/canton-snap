import { TopBar } from '../components/TopBar';
import { AmbientOrb } from '../components/AmbientOrb';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { cn } from '../lib/cn';
import { type NetworkId } from '../lib/config';
import styles from './NonCustodialRegistrationPage.module.css';

type Step = 'install' | 'sign';

interface Props {
  address: string;
  network: NetworkId;
  onNetworkChange: (id: NetworkId) => void;
  step: Step;
  snapInstalling: boolean;
  signingPending: boolean;
  snapAlreadyInstalled: boolean;
  snapError: string | null;
  signError: string | null;
  onBack: () => void;
  onInstall: () => void;
  onSign: () => void;
  onDisconnect: () => void;
}

function SnapIcon() {
  return (
    <div className={styles.snapIcon}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2 L2 4 V9 C2 12 4 14 8 15 C12 14 14 12 14 9 V4 Z" stroke="#00d4a4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 9 L7 10 L10 7" stroke="#00d4a4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function CheckIcon() {
  return (
    <div className={styles.checkIcon}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 7 L5 10 L12 3" stroke="#00d4a4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return <div className={styles.stepNumber}>{n}</div>;
}

export function NonCustodialRegistrationPage({
  address, network, onNetworkChange, step, snapInstalling, signingPending, snapAlreadyInstalled,
  snapError, signError, onBack, onInstall, onSign, onDisconnect,
}: Props) {
  const progressFill = step === 'install' ? 0 : 50;
  const progressLabel = step === 'install' ? '0 of 2 complete' : '1 of 2 complete';

  return (
    <div className="page">
      <AmbientOrb opacity={0.14} size={840} y="62%" />
      <TopBar address={address} network={network} onNetworkChange={onNetworkChange} onDisconnect={onDisconnect} />

      <div className={styles.backBar}>
        <button className="back-link" onClick={onBack}>← Back to registration</button>
      </div>

      <main className={styles.main}>
        <h1 className={styles.title}>Register non-custodially</h1>
        <p className={styles.subtitle}>Two steps — install the snap, then sign. Registration submits automatically.</p>

        <div className={styles.progressWrap}>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progressFill}%` }} />
          </div>
          <p className={styles.progressLabel}>{progressLabel}</p>
        </div>

        <div className={styles.steps}>
          {step === 'install' ? (
            <div className={cn('card-active', 'step-item', styles.stepActiveBody)} style={{ padding: 20 }}>
              <SnapIcon />
              <div className={styles.stepActiveBody}>
                <div className={styles.stepActiveHeader}>
                  <span className={styles.stepActiveTitle}>
                    {snapAlreadyInstalled ? 'Connect Canton Snap' : 'Install Canton Snap'}
                  </span>
                  <span className="step-badge" style={{ color: 'var(--teal)' }}>START HERE</span>
                </div>
                <p className={styles.stepDesc}>
                  {snapAlreadyInstalled
                    ? 'The Canton Snap is already installed. Allow this dApp to connect to it.'
                    : 'MetaMask will ask for permission to install the Canton Snap and let this dApp call it.'}
                </p>
                {snapError && <div className={cn('error-banner', styles.errorBanner)}>{snapError}</div>}
                <Button variant="primary-sm" onClick={onInstall} disabled={snapInstalling}>
                  {snapInstalling
                    ? (snapAlreadyInstalled ? 'Connecting…' : 'Installing…')
                    : (snapAlreadyInstalled ? 'Connect Canton Snap' : 'Install Canton Snap')}
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn('card', styles.stepDone)}>
              <CheckIcon />
              <div className={styles.stepDoneBody}>
                <div className={styles.stepDoneHeader}>
                  <span className={styles.stepDoneTitle}>Install Canton Snap</span>
                  <span className="step-badge" style={{ color: 'var(--teal)' }}>DONE</span>
                </div>
                <p className={styles.stepDoneDesc}>MetaMask installed the Canton Snap and granted this dApp permission.</p>
              </div>
            </div>
          )}

          {step === 'sign' ? (
            <div className={cn('card-active', 'step-item', styles.secondStep)} style={{ padding: 20 }}>
              <div className={styles.spinnerIcon}><Spinner size={24} /></div>
              <div className={styles.stepActiveBody}>
                <div className={styles.stepActiveHeader}>
                  <span className={styles.stepActiveTitle}>Sign</span>
                  <span className="step-badge" style={{ color: 'var(--teal)' }}>
                    {signingPending ? 'IN PROGRESS' : 'UP NEXT'}
                  </span>
                </div>
                <p className={styles.stepDesc}>Approve in MetaMask (wallet proof) and the Canton snap (topology hash).</p>
                <p className={styles.stepDescMuted}>Your registration is submitted automatically once both signatures are in.</p>
                {signError && <div className={cn('error-banner', styles.errorBanner)}>{signError}</div>}
                <Button variant="primary-sm" onClick={onSign} disabled={signingPending}>
                  {signingPending ? 'Signing…' : 'Start signing'}
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn('card', styles.stepLocked)}>
              <StepNumber n={2} />
              <div className={styles.stepLockedBody}>
                <div className={styles.stepLockedHeader}>
                  <span className={styles.stepLockedTitle}>Sign</span>
                  <span className="step-badge" style={{ color: 'var(--text-muted)' }}>LOCKED</span>
                </div>
                <p className={styles.stepLockedDesc}>MetaMask + Canton snap signatures. Registration submits automatically.</p>
              </div>
            </div>
          )}
        </div>

        <p className={styles.helperText}>Each step requires a confirmation. You can cancel at any time without registering.</p>
      </main>
    </div>
  );
}
