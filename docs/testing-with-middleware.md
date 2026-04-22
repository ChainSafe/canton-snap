# Testing the Canton Snap with Middleware (Local Development)

This guide covers local setup and the supported registration flows. See [Current Limitations](#current-limitations) and [TODO](#todo--future-work) for what isn't implemented yet.

---

## Architecture Overview

The Canton Snap is a **pure signing oracle** — it never talks to the middleware directly. The Canton dApp orchestrates between the two:

```
Canton dApp (browser)
    │
    ├── window.ethereum.request(wallet_invokeSnap, ...) ──► MetaMask
    │                                                            │
    │                                                       Canton Snap
    │                                                       (key derivation
    │                                                        + signing)
    │
    └── fetch(http://localhost:8081/...) ──────────────────► Middleware API
                                                                  │
                                                             Canton Ledger
                                                             (gRPC)
```

---

## Prerequisites

### 1. MetaMask

Install [MetaMask](https://metamask.io) in your browser. The Canton Snap installs as a local snap via `wallet_requestSnaps` — no Flask or developer build required for local development.

### 2. Node.js

```bash
node --version   # v18 or higher
```

### 3. Middleware running

Clone and start the [canton-middleware](https://github.com/ChainSafe/canton-middleware) repo (Canton ledger + PostgreSQL + API server). Refer to its README for setup instructions.

Once running, verify:

```bash
curl http://localhost:8081/health
# Expected: OK
```

---

## Starting the Dev Servers

```bash
# First-time setup
npm install
cp .env.example .env          # snap port config (default: 8080)

# Build snap + dApp
npm run build

# Start snap server (port 8080) + dApp (port 3000) together
npm run serve

# Or start individually:
npm run serve:snap   # snap only  — http://localhost:8080
npm run dev:dapp     # dApp only  — http://localhost:3000
```

> **Port conflicts:** The dApp Vite server auto-increments past any busy port (3000 → 3001 → …). The snap server uses the port from your `.env` (`VITE_SNAP_PORT`, default `8080`); both snap and dApp read from the same file.

Open the dApp at **http://localhost:3000**

---

## Step 1: Connect MetaMask

1. Open http://localhost:3000 in the browser where MetaMask is installed.
2. Click **"Connect MetaMask"**.
3. MetaMask prompts to share your account address — approve.

---

## Step 2: Choose Registration Mode

After connecting you'll see two options:

- **Custodial** — the middleware generates and stores your Canton signing key. One-click flow.
- **Non-Custodial** — the Canton Snap holds your key inside MetaMask. You approve every signature.

---

## Custodial Registration

1. Click **"Use Custodial"**.
2. MetaMask shows a **Sign Message** dialog for `register:<timestamp>` — approve it.
3. The middleware allocates a Canton party and returns your party ID and fingerprint.

If you see **"Already registered"**, this address already has a Canton party — you'll be taken to the done screen.

---

## Non-Custodial Registration

The Canton Snap holds your signing key. It never leaves MetaMask.

### Step 1 — Install Canton Snap

1. Click **"Use Non-Custodial"** then **"Install Canton Snap"** (or **"Connect Canton Snap"** if already installed).
2. MetaMask asks to install the snap and grant this dApp permission — approve.

### Step 2 — Sign

1. Click **"Start signing"**.
2. MetaMask prompts for an EIP-191 signature (`register:<timestamp>`) — approve.
3. The snap prompts to sign the topology hash — approve.
4. Registration is submitted automatically once both signatures are collected.

---

## Running Snap Unit Tests

```bash
npm test           # crypto unit tests
npm run test:snap  # full snap integration tests (jest + @metamask/snaps-jest)
```

---

## Current Limitations

**Snap not published** — The snap is not on npm. It only works via `local:http://localhost:8080`. Publishing requires an npm release and MetaMask's snap review process.

**Each developer runs their own snap server** — The `local:` snap ID is tied to localhost. Teammates cannot share one snap server.

**No staging environment** — The dApp supports switching networks via the network switcher, but there is no shared testnet or staging deployment yet.

**Key index must match registration** — All snap calls must use the same key index used during registration (default: `0`). A different index derives a different key.

---

## TODO / Future Work

The following flows are not yet implemented (tracked in [issue #5](https://github.com/ChainSafe/canton-snap/issues/5)):

- **Check registration status** — No proactive status check on load; already-registered state is detected reactively via 409 responses.
- **Token transfer flow** — Prepare transfer, sign with `canton_signHash`, execute. The snap method works but there is no dApp UI yet.
- **Balance display** — No UI to query a registered user's token balance.
- **Token minting** — No faucet UI. Requires running middleware scripts manually:
  ```bash
  cd ../canton-middleware
  go run scripts/testing/mint-tokens.go --address <evm-address> --amount 1000 --token DEMO
  ```
- **End-to-end automated test** — The full registration → mint → transfer → verify flow is not scripted.

---

## Quick Reference

| | |
|---|---|
| Canton dApp | http://localhost:3000 |
| Snap server | http://localhost:8080 (set via `VITE_SNAP_PORT` in `.env`) |
| Snap ID | `local:http://localhost:8080` |
| Middleware API | http://localhost:8081 |
| Middleware health | `GET http://localhost:8081/health` |

| Command | Purpose |
|---|---|
| `npm run serve` | Start snap + dApp together |
| `npm run serve:snap` | Snap server only |
| `npm run dev:dapp` | dApp dev server only |
| `npm run build` | Build snap + dApp |
| `npm run build:snap` | Build snap bundle only |
| `npm run watch:snap` | Snap hot-reload during development |
| `npm test` | Crypto unit tests |
| `npm run test:snap` | Full snap integration tests |
| `npm run lint` | Lint all packages |
| `npm run format` | Format all packages |

| Middleware endpoint | Purpose |
|---|---|
| `POST /register` | Custodial or non-custodial registration |
| `POST /register/prepare-topology` | Step 1 of non-custodial registration |

| Snap method | Dialog | Purpose |
|---|---|---|
| `canton_getPublicKey` | Yes | Key derivation + SPKI + fingerprint |
| `canton_signTopology` | Yes | SHA-256 + ECDSA sign of Canton topology multihash |
| `canton_signHash` | Yes | ECDSA sign of 32-byte pre-hashed digest |
| `canton_getFingerprint` | No | Fingerprint lookup only |
