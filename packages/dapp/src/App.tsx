import { useState, useEffect } from "react";
import "./App.css";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown }) => Promise<unknown>;
    };
  }
}

const SNAP_ID = `local:http://localhost:${import.meta.env.VITE_SNAP_PORT}`;

interface RegState {
  compressedPubKey?: string;
  spkiDer?: string;
  fingerprint?: string;
  topologyHash?: string;
  registrationToken?: string;
  topologySignature?: string;
  evmAddress?: string;
  message?: string;
  signature?: string;
}

interface Result {
  data?: unknown;
  error?: string;
}

class AlreadyRegisteredError extends Error {
  details: string;
  constructor(details: string) {
    super("already_registered");
    this.details = details;
  }
}

function getEthereum() {
  if (!window.ethereum) {
    throw new Error("MetaMask not found. Open over HTTP and ensure MetaMask Flask is installed.");
  }
  return window.ethereum;
}

function toHex(str: string) {
  return (
    "0x" +
    Array.from(new TextEncoder().encode(str))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function ResultBox({ result }: { result: Result | null }) {
  if (!result) return null;
  const text =
    result.error ??
    (typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2));
  return <div className={`result ${result.error ? "error" : "success"}`}>{text}</div>;
}

export default function App() {
  const [metamaskDetected, setMetamaskDetected] = useState(true);
  const [middlewareUrl, setMiddlewareUrl] = useState("http://localhost:8081");
  const [globalKeyIndex, setGlobalKeyIndex] = useState(0);

  const [reg, setReg] = useState<RegState>({});
  const [step2Enabled, setStep2Enabled] = useState(false);
  const [step3Enabled, setStep3Enabled] = useState(false);
  const [step4Enabled, setStep4Enabled] = useState(false);
  const [regAlreadyRegistered, setRegAlreadyRegistered] = useState<string | null>(null);
  const [custAlreadyRegistered, setCustAlreadyRegistered] = useState<string | null>(null);

  const [results, setResults] = useState<Record<string, Result | null>>({});

  // Individual snap method inputs
  const [getPubKeyIndex, setGetPubKeyIndex] = useState(0);
  const [getFpIndex, setGetFpIndex] = useState(0);
  const [signHashInput, setSignHashInput] = useState(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  const [signOp, setSignOp] = useState("Transfer");
  const [signToken, setSignToken] = useState("DEMO");
  const [signAmount, setSignAmount] = useState("100");
  const [signRecipient, setSignRecipient] = useState("");

  useEffect(() => {
    if (!window.ethereum) setMetamaskDetected(false);
  }, []);

  function setResult(key: string, data: unknown, error?: string) {
    setResults((prev) => ({ ...prev, [key]: error ? { error } : { data } }));
  }

  async function mwFetch(path: string, body: unknown) {
    const base = middlewareUrl.replace(/\/$/, "");
    const resp = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (resp.status === 409) throw new AlreadyRegisteredError(text);
    if (!resp.ok) throw new Error(`${resp.status}: ${text}`);
    return JSON.parse(text);
  }

  async function invokeSnap(method: string, params: unknown) {
    return getEthereum().request({
      method: "wallet_invokeSnap",
      params: { snapId: SNAP_ID, request: { method, params } },
    });
  }

  async function connectSnap() {
    try {
      await getEthereum().request({ method: "wallet_requestSnaps", params: { [SNAP_ID]: {} } });
      setResult("connect", "Snap installed successfully");
    } catch (e) {
      setResult("connect", null, (e as Error).message);
    }
  }

  // ── Custodial registration ──────────────────────────────────────────

  async function custRegister() {
    try {
      const accounts = (await getEthereum().request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      const message = `register:${Math.floor(Date.now() / 1000)}`;
      const signature = await getEthereum().request({
        method: "personal_sign",
        params: [toHex(message), address],
      });
      const data = await mwFetch("/register", { signature, message });
      setResult("custReg", data);
    } catch (e) {
      if (e instanceof AlreadyRegisteredError) {
        setCustAlreadyRegistered(e.details);
        return;
      }
      setResult("custReg", null, (e as Error).message);
    }
  }

  // ── Non-custodial registration steps ───────────────────────────────

  async function regStep1() {
    try {
      const result = (await invokeSnap("canton_getPublicKey", {
        keyIndex: globalKeyIndex,
      })) as RegState;
      setReg({
        compressedPubKey: result.compressedPubKey,
        spkiDer: result.spkiDer,
        fingerprint: result.fingerprint,
      });
      setResult("reg1", result);
      setStep2Enabled(true);
    } catch (e) {
      setResult("reg1", null, (e as Error).message);
    }
  }

  async function regStep2() {
    try {
      const accounts = (await getEthereum().request({ method: "eth_requestAccounts" })) as string[];
      const evmAddress = accounts[0];
      const message = `register:${Math.floor(Date.now() / 1000)}`;
      const signature = await getEthereum().request({
        method: "personal_sign",
        params: [toHex(message), evmAddress],
      });
      const data = await mwFetch("/register/prepare-topology", {
        signature,
        message,
        canton_public_key: reg.compressedPubKey,
      });
      setReg((prev) => ({
        ...prev,
        topologyHash: data.topology_hash,
        registrationToken: data.registration_token,
        evmAddress,
        message,
        signature: signature as string,
      }));
      setResult("reg2", data);
      setStep3Enabled(true);
    } catch (e) {
      if (e instanceof AlreadyRegisteredError) {
        setRegAlreadyRegistered(e.details);
        return;
      }
      setResult("reg2", null, (e as Error).message);
    }
  }

  async function regStep3() {
    try {
      const result = (await invokeSnap("canton_signTopology", { hash: reg.topologyHash })) as {
        derSignature: string;
      };
      setReg((prev) => ({ ...prev, topologySignature: result.derSignature }));
      setResult("reg3", result);
      setStep4Enabled(true);
    } catch (e) {
      setResult("reg3", null, (e as Error).message);
    }
  }

  async function regStep4() {
    try {
      const data = await mwFetch("/register", {
        signature: reg.signature,
        message: reg.message,
        key_mode: "external",
        canton_public_key: reg.compressedPubKey,
        registration_token: reg.registrationToken,
        topology_signature: reg.topologySignature,
      });
      setResult("reg4", data);
    } catch (e) {
      if (e instanceof AlreadyRegisteredError) {
        setRegAlreadyRegistered(e.details);
        return;
      }
      setResult("reg4", null, (e as Error).message);
    }
  }

  // ── Individual snap methods ─────────────────────────────────────────

  async function getPublicKey() {
    try {
      setResult("getPubKey", await invokeSnap("canton_getPublicKey", { keyIndex: getPubKeyIndex }));
    } catch (e) {
      setResult("getPubKey", null, (e as Error).message);
    }
  }

  async function getFingerprint() {
    try {
      setResult(
        "getFingerprint",
        await invokeSnap("canton_getFingerprint", { keyIndex: getFpIndex }),
      );
    } catch (e) {
      setResult("getFingerprint", null, (e as Error).message);
    }
  }

  async function signHash() {
    try {
      const metadata = {
        operation: signOp,
        tokenSymbol: signToken,
        amount: signAmount,
        recipient: signRecipient || undefined,
      };
      setResult("signHash", await invokeSnap("canton_signHash", { hash: signHashInput, metadata }));
    } catch (e) {
      setResult("signHash", null, (e as Error).message);
    }
  }

  return (
    <>
      <h1>Canton Snap Test dApp</h1>
      <p>Local testing interface for the Canton MetaMask Snap.</p>

      {!metamaskDetected && (
        <div className="banner banner-error">
          <strong>MetaMask not detected.</strong>
          <br />
          <br />
          Two common causes:
          <ol>
            <li>
              You opened this as <code>file://</code> — MetaMask does not inject into file:// pages.
              <br />
              Fix: run <code>npm run dev:dapp</code> and open <code>http://localhost:3000</code>
            </li>
            <li>
              MetaMask Flask is not installed.
              <br />
              Fix: Install{" "}
              <a href="https://metamask.io/flask/" target="_blank" rel="noreferrer">
                MetaMask Flask
              </a>{" "}
              (required for local snaps).
            </li>
          </ol>
        </div>
      )}

      {/* ── Connection ─────────────────────────────────────────────── */}
      <h2>Connection</h2>
      <button onClick={connectSnap} disabled={!metamaskDetected}>
        Install / Connect Snap
      </button>
      <ResultBox result={results["connect"] ?? null} />

      {/* ── Config ─────────────────────────────────────────────────── */}
      <h2>Config</h2>
      <label>
        Middleware URL:
        <input value={middlewareUrl} onChange={(e) => setMiddlewareUrl(e.target.value)} />
      </label>
      <label>
        Key Index (used across all flows):
        <input
          type="number"
          value={globalKeyIndex}
          min={0}
          style={{ width: 80 }}
          onChange={(e) => setGlobalKeyIndex(parseInt(e.target.value) || 0)}
        />
      </label>

      {/* ── Custodial Registration ─────────────────────────────────── */}
      <h2>Custodial Registration</h2>
      <p className="hint">
        Middleware generates and stores the Canton key on your behalf. Single step.
      </p>
      {custAlreadyRegistered && (
        <div className="banner banner-success">
          <strong>Already registered.</strong> This address already has a custodial Canton party.
          <div className="banner-details">{custAlreadyRegistered}</div>
        </div>
      )}
      <button onClick={custRegister} disabled={!!custAlreadyRegistered}>
        Register (Custodial)
      </button>
      <ResultBox result={results["custReg"] ?? null} />

      {/* ── Non-Custodial Registration ─────────────────────────────── */}
      <h2>Registration Flow (Non-Custodial)</h2>
      <p className="hint">Run steps 1–4 in order. Each step unlocks the next.</p>
      {regAlreadyRegistered ? (
        <div className="banner banner-success">
          <strong>Already registered.</strong> This address has an active Canton party — no need to
          re-register.
          <div className="banner-details">{regAlreadyRegistered}</div>
        </div>
      ) : (
        <>
          <div className="step">
            <div className="step-label">Step 1 — Get public key from snap</div>
            <button onClick={regStep1}>1. Get Public Key</button>
            <ResultBox result={results["reg1"] ?? null} />
          </div>
          <div className="step">
            <div className="step-label">
              Step 2 — Sign registration message &amp; prepare topology on middleware
            </div>
            <button onClick={regStep2} disabled={!step2Enabled}>
              2. Prepare Topology
            </button>
            <ResultBox result={results["reg2"] ?? null} />
          </div>
          <div className="step">
            <div className="step-label">Step 3 — Sign topology hash with snap</div>
            <button onClick={regStep3} disabled={!step3Enabled}>
              3. Sign Topology
            </button>
            <ResultBox result={results["reg3"] ?? null} />
          </div>
          <div className="step">
            <div className="step-label">Step 4 — Submit registration to middleware</div>
            <button onClick={regStep4} disabled={!step4Enabled}>
              4. Complete Registration
            </button>
            <ResultBox result={results["reg4"] ?? null} />
          </div>
        </>
      )}

      {/* ── canton_getPublicKey ────────────────────────────────────── */}
      <h2>canton_getPublicKey</h2>
      <label>
        Key Index:
        <input
          type="number"
          value={getPubKeyIndex}
          min={0}
          style={{ width: 80 }}
          onChange={(e) => setGetPubKeyIndex(parseInt(e.target.value) || 0)}
        />
      </label>
      <button onClick={getPublicKey}>Get Public Key</button>
      <ResultBox result={results["getPubKey"] ?? null} />

      {/* ── canton_getFingerprint ──────────────────────────────────── */}
      <h2>canton_getFingerprint</h2>
      <label>
        Key Index:
        <input
          type="number"
          value={getFpIndex}
          min={0}
          style={{ width: 80 }}
          onChange={(e) => setGetFpIndex(parseInt(e.target.value) || 0)}
        />
      </label>
      <button onClick={getFingerprint}>Get Fingerprint</button>
      <ResultBox result={results["getFingerprint"] ?? null} />

      {/* ── canton_signHash ────────────────────────────────────────── */}
      <h2>canton_signHash (Transfer)</h2>
      <label>
        Hash (hex):
        <input
          value={signHashInput}
          onChange={(e) => setSignHashInput(e.target.value)}
          placeholder="32-byte hex hash (with or without 0x)"
        />
      </label>
      <label>
        Operation: <input value={signOp} onChange={(e) => setSignOp(e.target.value)} />
      </label>
      <label>
        Token: <input value={signToken} onChange={(e) => setSignToken(e.target.value)} />
      </label>
      <label>
        Amount: <input value={signAmount} onChange={(e) => setSignAmount(e.target.value)} />
      </label>
      <label>
        Recipient:{" "}
        <input
          value={signRecipient}
          onChange={(e) => setSignRecipient(e.target.value)}
          placeholder="0x..."
        />
      </label>
      <button onClick={signHash}>Sign Hash</button>
      <ResultBox result={results["signHash"] ?? null} />
    </>
  );
}
