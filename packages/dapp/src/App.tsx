import { useState, useCallback } from "react";
import { useMetaMask } from "./hooks/useMetaMask";
import { useRegistration } from "./hooks/useRegistration";
import { DEFAULT_NETWORK, getNetwork, type NetworkId } from "./lib/config";
import { LandingPage } from "./pages/LandingPage";
import { RegistrationChoicePage } from "./pages/RegistrationChoicePage";
import { CustodialRegistrationPage } from "./pages/CustodialRegistrationPage";
import { NonCustodialRegistrationPage } from "./pages/NonCustodialRegistrationPage";
import { RegistrationDonePage } from "./pages/RegistrationDonePage";

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

  const mm = useMetaMask();
  const reg = useRegistration(getNetwork(network).middlewareUrl);
  const { registerCustodial, sign } = reg;

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

  if (page === "landing") {
    return (
      <LandingPage
        detected={mm.detected}
        connecting={mm.connecting}
        error={mm.error}
        onConnect={async () => {
          await mm.connect();
          setPage("registration-choice");
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
        onDashboard={() => setPage("dashboard")}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (page === "dashboard") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          color: "var(--text-secondary)",
          fontSize: 15,
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="12" fill="rgba(0,212,164,0.1)" />
          <path
            d="M14 28 L20 20 L26 24 L32 16"
            stroke="#00d4a4"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p>Dashboard coming soon</p>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: "8px 20px" }}
          onClick={() => setPage("registration-choice")}
        >
          ← Back
        </button>
      </div>
    );
  }

  return null;
}
