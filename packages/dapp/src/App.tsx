// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useEffect } from "react";
import { useMetaMask } from "./hooks/useMetaMask";
import { useRegistration } from "./hooks/useRegistration";
import { useAutoNetworkSwitch } from "./hooks/useAutoNetworkSwitch";
import { NETWORK } from "./lib/config";
import { NON_CUSTODIAL_ENABLED } from "./lib/features";
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
import { DashboardBalancesPage } from "./pages/DashboardBalancesPage";
import { DashboardActivityPage } from "./pages/DashboardActivityPage";
import { DashboardOffersPage } from "./pages/DashboardOffersPage";
import { TransferPage } from "./pages/TransferPage";
import type { DashboardTab } from "./components/DashboardLayout";

type Page =
  | "landing"
  | "registration-choice"
  | "custodial-pending"
  | "noncustodial-install"
  | "noncustodial-sign"
  | "registration-done"
  | "dashboard";

const DASHBOARD_TABS: readonly DashboardTab[] = [
  "profile",
  "balances",
  "transfer",
  "offers",
  "activity",
];

function readTabFromHash(): DashboardTab {
  const h = window.location.hash.replace(/^#/, "");
  return (DASHBOARD_TABS as readonly string[]).includes(h) ? (h as DashboardTab) : "profile";
}

export default function App() {
  const [page, setPage] = useState<Page>("landing");
  const [mode, setMode] = useState<"custodial" | "noncustodial">("custodial");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>(readTabFromHash);
  // Token address to pre-select when opening the Transfer tab from a balances
  // row's "Send →". Null on plain nav so Transfer falls back to the first token.
  const [transferToken, setTransferToken] = useState<string | null>(null);

  // Mirror dashboardTab into the URL hash so a refresh on /#balances stays on
  // Balances instead of snapping back to Profile. Only mutate the hash while
  // we're actually on the dashboard — on landing/registration the hash is
  // irrelevant and clobbering it would surprise the user.
  useEffect(() => {
    if (page !== "dashboard") return;
    const want = `#${dashboardTab}`;
    if (window.location.hash !== want) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${want}`,
      );
    }
  }, [page, dashboardTab]);

  // Browser back/forward across tabs.
  useEffect(() => {
    function onHashChange() {
      setDashboardTab(readTabFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const mm = useMetaMask();
  const reg = useRegistration(NETWORK.middlewareUrl);
  const { registerCustodial, sign } = reg;

  // Prompt MetaMask to switch to the active Canton chain on connect — silent
  // if MM is already on it.
  useAutoNetworkSwitch(NETWORK, mm.address);

  // Auto-reconnect on refresh: if MetaMask already has an account and we have a
  // cached session signature, skip the landing page and go straight to dashboard.
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
      .then(() => getUser(NETWORK.middlewareUrl, addr, session.signature, session.message))
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
  }, [page, mm.autoConnecting, mm.address]);

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
    setTransferToken(null);
    setDashboardTab("profile");
    setPage("landing");
  }

  // Plain tab navigation (sidebar). Clears any pending pre-selection so the
  // Transfer tab only honours a token when reached via a "Send →" row action.
  const handleTabChange = useCallback((tab: DashboardTab) => {
    setTransferToken(null);
    setDashboardTab(tab);
  }, []);

  // "Send →" on a balances row: pre-select that token, then open Transfer.
  const handleSendToken = useCallback((tokenAddress: string) => {
    setTransferToken(tokenAddress);
    setDashboardTab("transfer");
  }, []);

  const handleCustodial = useCallback(() => {
    setMode("custodial");
    setPage("custodial-pending");
  }, []);

  function handleNonCustodial() {
    setMode("noncustodial");
    setPage(reg.snap.alreadyInstalled ? "noncustodial-sign" : "noncustodial-install");
  }

  // v1.0 ships custodial-only: skip the registration-choice screen and go
  // straight to the custodial flow. The non-custodial pages stay in the
  // bundle behind NON_CUSTODIAL_ENABLED so a build with the flag set
  // re-enables the full chooser without code changes.
  const goRegister = useCallback(() => {
    if (NON_CUSTODIAL_ENABLED) {
      setPage("registration-choice");
    } else {
      handleCustodial();
    }
  }, [handleCustodial]);

  const address = mm.address ?? "";
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
              NETWORK.middlewareUrl,
              addr,
              session.signature,
              session.message,
            );
            if (existing) {
              setProfile(existing);
              setPage("dashboard");
            } else {
              goRegister();
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
                  NETWORK.middlewareUrl,
                  addr,
                  session.signature,
                  session.message,
                );
                if (existing) {
                  setProfile(existing);
                  setPage("dashboard");
                } else {
                  goRegister();
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

  if (page === "registration-choice" && NON_CUSTODIAL_ENABLED) {
    return (
      <RegistrationChoicePage
        address={address}
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
        pending={reg.pending}
        error={reg.error}
        onBack={NON_CUSTODIAL_ENABLED ? () => setPage("registration-choice") : undefined}
        onRegister={handleRegisterCustodial}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (page === "noncustodial-install" && NON_CUSTODIAL_ENABLED) {
    return (
      <NonCustodialRegistrationPage
        address={address}
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

  if (page === "noncustodial-sign" && NON_CUSTODIAL_ENABLED) {
    return (
      <NonCustodialRegistrationPage
        address={address}
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
    const sharedProps = {
      address,
      activeTab: dashboardTab,
      onTabChange: handleTabChange,
      onDisconnect: handleDisconnect,
    };

    if (dashboardTab === "balances") {
      return <DashboardBalancesPage {...sharedProps} onSendToken={handleSendToken} />;
    }

    if (dashboardTab === "transfer") {
      return (
        <TransferPage
          {...sharedProps}
          keyMode={profile.keyMode}
          preselectTokenAddress={transferToken}
        />
      );
    }

    if (dashboardTab === "offers") {
      return <DashboardOffersPage {...sharedProps} keyMode={profile.keyMode} />;
    }

    if (dashboardTab === "activity") {
      return <DashboardActivityPage {...sharedProps} cantonPartyId={profile.cantonPartyId} />;
    }

    return (
      <DashboardProfilePage
        {...sharedProps}
        profile={profile}
        snapInstalled={snapInstalled}
        snapVersion={snapVersion}
        onInstallSnap={reg.snap.install}
      />
    );
  }

  return null;
}
