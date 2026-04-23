import { useState, useCallback, useEffect } from "react";
import { useMetaMask } from "./hooks/useMetaMask";
import { useRegistration } from "./hooks/useRegistration";
import { DEFAULT_NETWORK, getNetwork, type NetworkId } from "./lib/config";
import { personalSign } from "./lib/ethereum";
import { getUser, SessionExpiredError, type UserProfile } from "./lib/middleware";
import { getSession, storeSession, clearSession, clearAllSessions } from "./lib/session";
import { Spinner } from "./components/Spinner";
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
  const [connectError, setConnectError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const mm = useMetaMask();
  const reg = useRegistration(getNetwork(network).middlewareUrl);
  const { registerCustodial, sign } = reg;

  // Auto-reconnect on refresh: if MetaMask already has an account and we have a
  // cached session signature, skip the landing page and go straight to dashboard.
  // Gating on page === "landing" naturally prevents re-runs once we've navigated
  // away, while still allowing a re-check when the network changes on landing.
  useEffect(() => {
    if (page !== "landing") return;
    if (mm.autoConnecting) return;
    const addr = mm.address;
    if (!addr) return;

    const session = getSession(addr);
    if (!session) return;

    // setReconnecting via .then() so it's in a callback, not the synchronous effect body.
    Promise.resolve()
      .then(() => setReconnecting(true))
      .then(() =>
        getUser(getNetwork(network).middlewareUrl, addr, session.signature, session.message),
      )
      .then((existing) => {
        if (existing) {
          setProfile(existing);
          setPage("dashboard");
        }
      })
      .catch((e) => {
        if (e instanceof SessionExpiredError) clearSession(addr);
        // stay on landing in all error cases; user re-connects manually
      })
      .finally(() => setReconnecting(false));
  }, [page, mm.autoConnecting, mm.address, network]);

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
  const snapVersion = reg.snap.version;

  if (mm.autoConnecting || reconnecting) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <Spinner />
      </div>
    );
  }

  if (page === "landing") {
    return (
      <LandingPage
        detected={mm.detected}
        connecting={mm.connecting}
        error={mm.error ?? connectError}
        onConnect={async () => {
          setConnectError(null);
          const addr = await mm.connect();
          if (!addr) return;

          // Get or create a session signature for authenticating GET /user.
          // If the server rejects the cached signature as expired, clear it and re-sign once.
          const freshSign = async () => {
            const message = `login:${addr.toLowerCase()}:${Math.floor(Date.now() / 1000)}`;
            const signature = await personalSign(message, addr);
            storeSession(addr, message, signature);
            return { message, signature };
          };

          let session = getSession(addr);
          if (!session) {
            try {
              session = await freshSign();
            } catch {
              return; // user rejected signing
            }
          }

          try {
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
          } catch (e) {
            if (e instanceof SessionExpiredError) {
              clearSession(addr);
              try {
                session = await freshSign();
              } catch {
                return; // user rejected re-signing
              }
              try {
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
              } catch (e2) {
                setConnectError((e2 as Error).message);
              }
            } else {
              setConnectError((e as Error).message);
            }
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
    const handleNetworkChange = (id: NetworkId) => {
      setNetwork(id);
      if (!mm.address) return;
      const session = getSession(mm.address);
      if (!session) return;
      void getUser(getNetwork(id).middlewareUrl, mm.address, session.signature, session.message)
        .then((updated) => {
          if (updated) {
            setProfile(updated);
          } else {
            setProfile(null);
            setPage("registration-choice");
          }
        })
        .catch(() => {});
    };
    return (
      <DashboardProfilePage
        address={address}
        network={network}
        onNetworkChange={handleNetworkChange}
        profile={profile}
        snapInstalled={snapInstalled}
        snapVersion={snapVersion}
        onInstallSnap={reg.snap.install}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return null;
}
