import { useState, useCallback, useEffect, useRef } from "react";
import { useMetaMask } from "./hooks/useMetaMask";
import { useRegistration } from "./hooks/useRegistration";
import { DEFAULT_NETWORK, getNetwork, type NetworkId } from "./lib/config";
import { personalSign } from "./lib/ethereum";
import { getUser, type UserProfile } from "./lib/middleware";
import { getSession, storeSession, clearAllSessions } from "./lib/session";
import { LandingPage } from "./pages/LandingPage";
import { RegistrationChoicePage } from "./pages/RegistrationChoicePage";
import { CustodialRegistrationPage } from "./pages/CustodialRegistrationPage";
import { NonCustodialRegistrationPage } from "./pages/NonCustodialRegistrationPage";
import { RegistrationDonePage } from "./pages/RegistrationDonePage";
import { DashboardProfilePage } from "./pages/DashboardProfilePage";

type Page =
  | "landing"
  | "registration-choice"
  | "custodial-pending"
  | "noncustodial-install"
  | "noncustodial-sign"
  | "registration-done"
  | "dashboard";

export default function App() {
  const [page, setPage] = useState<Page>("landing");
  const [mode, setMode] = useState<"custodial" | "noncustodial">("custodial");
  const [network, setNetwork] = useState<NetworkId>(DEFAULT_NETWORK);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const autoConnectAttempted = useRef(false);

  const mm = useMetaMask();
  const reg = useRegistration(getNetwork(network).middlewareUrl);
  const { registerCustodial, sign } = reg;

  // Auto-reconnect on refresh: if MetaMask already has an account and we have a
  // cached session signature, skip the landing page and go straight to dashboard.
  useEffect(() => {
    if (mm.autoConnecting) return;
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;

    if (!mm.address) return;

    const session = getSession(mm.address);
    if (!session) return;

    getUser(getNetwork(network).middlewareUrl, mm.address, session.signature, session.message).then(
      (existing) => {
        if (existing) {
          setProfile(existing);
          setPage("dashboard");
        }
      },
    );
  }, [mm.autoConnecting, mm.address, network]);

  const handleRegisterCustodial = useCallback(async () => {
    const done = await registerCustodial(mm.address ?? "");
    if (done) setPage("registration-done");
  }, [registerCustodial, mm.address]);

  const handleSign = useCallback(async () => {
    const done = await sign(mm.address ?? "");
    if (done) setPage("registration-done");
  }, [sign, mm.address]);

  function handleDisconnect() {
    mm.disconnect();
    setProfile(null);
    clearAllSessions();
    setPage("landing");
  }

  function handleCustodial() {
    setMode("custodial");
    setPage("custodial-pending");
  }

  function handleNonCustodial() {
    setMode("noncustodial");
    setPage(reg.snap.alreadyInstalled ? "noncustodial-sign" : "noncustodial-install");
  }

  const address = mm.address ?? "";
  const netProps = { network, onNetworkChange: setNetwork };
  const snapInstalled = reg.snap.installed || reg.snap.alreadyInstalled;

  if (page === "landing") {
    return (
      <LandingPage
        detected={mm.detected}
        connecting={mm.connecting}
        error={mm.error}
        onConnect={async () => {
          const addr = await mm.connect();
          if (!addr) return;

          // Get or create a session signature for authenticating GET /user.
          let session = getSession(addr);
          if (!session) {
            const message = `login:${addr.toLowerCase()}`;
            try {
              const signature = await personalSign(message, addr);
              storeSession(addr, message, signature);
              session = { message, signature };
            } catch {
              // User rejected signing — stay on landing so they can try again.
              return;
            }
          }

          const existing = await getUser(
            getNetwork(network).middlewareUrl,
            addr,
            session.signature,
            session.message,
          );
          if (existing) {
            setProfile(existing);
            setPage("dashboard");
          } else {
            setPage("registration-choice");
          }
        }}
      />
    );
  }

  if (page === "registration-choice") {
    return (
      <RegistrationChoicePage
        address={address}
        {...netProps}
        onCustodial={handleCustodial}
        onNonCustodial={handleNonCustodial}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (page === "custodial-pending") {
    return (
      <CustodialRegistrationPage
        address={address}
        {...netProps}
        pending={reg.pending}
        error={reg.error}
        onBack={() => setPage("registration-choice")}
        onRegister={handleRegisterCustodial}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (page === "noncustodial-install") {
    return (
      <NonCustodialRegistrationPage
        address={address}
        {...netProps}
        step="install"
        snapInstalling={reg.snap.installing}
        signingPending={false}
        snapError={reg.snap.error}
        signError={null}
        snapAlreadyInstalled={reg.snap.alreadyInstalled}
        onBack={() => setPage("registration-choice")}
        onInstall={async () => {
          const ok = await reg.snap.install();
          if (ok) setPage("noncustodial-sign");
        }}
        onSign={() => {}}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (page === "noncustodial-sign") {
    return (
      <NonCustodialRegistrationPage
        address={address}
        {...netProps}
        step="sign"
        snapInstalling={false}
        signingPending={reg.pending}
        snapAlreadyInstalled={reg.snap.alreadyInstalled}
        snapError={null}
        signError={reg.error}
        onBack={() => setPage("registration-choice")}
        onInstall={() => {}}
        onSign={handleSign}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (page === "registration-done") {
    const done = reg.result ?? reg.alreadyRegistered;
    return (
      <RegistrationDonePage
        address={address}
        {...netProps}
        cantonPartyId={done?.cantonPartyId ?? ""}
        fingerprint={done?.fingerprint ?? ""}
        snapInstalled={mode === "noncustodial" && reg.snap.installed}
        wasAlreadyRegistered={reg.wasAlreadyRegistered}
        onDashboard={() => {
          if (done) {
            setProfile({
              cantonPartyId: done.cantonPartyId,
              fingerprint: done.fingerprint,
              keyMode: mode === "noncustodial" ? "external" : "custodial",
            });
          }
          setPage("dashboard");
        }}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (page === "dashboard" && profile) {
    return (
      <DashboardProfilePage
        address={address}
        {...netProps}
        profile={profile}
        snapInstalled={snapInstalled}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return null;
}
