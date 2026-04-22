# Testing the Canton Snap with Middleware (Local Development)

This guide covers what the test dApp currently supports. See the [TODO](#todo--future-work) section for flows not yet implemented.

---

## Architecture Overview

The Canton Snap is a **pure signing oracle** — it never talks to the middleware directly. The test dApp orchestrates between the two:

```
Browser (test dApp)
    │
    ├── window.ethereum.request(wallet_invokeSnap, ...) ──► MetaMask Flask
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

### 1. MetaMask Flask

You **cannot** use regular MetaMask. You need **MetaMask Flask** — the developer build that allows installing unaudited local snaps.

- Download: https://metamask.io/flask/
- Install in a **separate browser profile** — Flask and regular MetaMask conflict in the same profile.

### 2. Node.js

```bash
node --version   # v18 or higher
```

### 3. Middleware running

The middleware repo is at `../canton-middleware`. Start it manually (Canton ledger + PostgreSQL + API server). Verify:

```bash
curl http://localhost:8081/health
# Expected: OK
```

---

## Starting the Dev Servers

```bash
# Install dependencies (first time only)
npm install

# Start snap server (port 4001) + dApp server (port 3000) together
npm run serve

# Or start individually:
npm run serve:snap   # snap only — http://localhost:4001
npm run serve:dapp   # dApp only — http://localhost:3000
```

Open the test dApp at **http://localhost:3000** (not `file://` — MetaMask won't inject into file:// pages).

---

## Step 1: Install the Snap

1. Open http://localhost:3000 in the browser where MetaMask Flask is installed.
2. Click **"Install / Connect Snap"**.
3. MetaMask Flask prompts to add the Canton Network Snap — review permissions and click **Install**.

The snap ID is `local:http://localhost:4001`. If you previously installed the snap at a different port, go to MetaMask Flask → Settings → Snaps → Remove it first, then reinstall.

---

## Step 2: Custodial Registration

The middleware generates and stores the Canton signing key on your behalf. One click.

1. Click **"Register (Custodial)"**.
2. MetaMask shows a **Sign Message** dialog for `register:<timestamp>` — approve it.
3. The middleware allocates a Canton party and returns:

```json
{
  "party": "user_ab12cd34::...",
  "fingerprint": "0x...",
  "key_mode": "custodial"
}
```

If you see a green **"Already registered"** banner, this address already has a Canton party — skip to Step 4.

---

## Step 3: Non-Custodial Registration (Snap)

You control the signing key — it lives in MetaMask Flask, never on the middleware. Run all 4 sub-steps in order.

### Step 3.1 — Get Public Key

Click **"1. Get Public Key"**. MetaMask Flask shows a confirmation dialog. Approve.

The snap derives a secp256k1 key from your seed and returns the compressed public key, SPKI DER encoding, and fingerprint.

### Step 3.2 — Prepare Topology

Click **"2. Prepare Topology"**. This:
- Signs `register:<timestamp>` with your MetaMask EVM key (`personal_sign`)
- POSTs to `/register/prepare-topology` with your compressed public key
- Receives a `topology_hash` (34-byte Canton multihash) and `registration_token`

If this step returns a green **"Already registered"** banner, skip the remaining sub-steps.

### Step 3.3 — Sign Topology

Click **"3. Sign Topology"**. MetaMask Flask shows the topology hash for confirmation. Approve.

The snap SHA-256 hashes the multihash bytes, then signs the resulting 32-byte digest with ECDSA — matching Canton's `EC_DSA_SHA_256` signing spec.

### Step 3.4 — Complete Registration

Click **"4. Complete Registration"**. The dApp submits all collected pieces to `/register`:

```json
{
  "signature": "0x...",
  "message": "register:<timestamp>",
  "key_mode": "external",
  "canton_public_key": "<compressed pubkey hex>",
  "registration_token": "<uuid>",
  "topology_signature": "<DER signature hex>"
}
```

A successful response means your Canton party is live with your snap-derived key as the sole signer.

---

## Step 4: Snap Crypto — Individual Method Testing

These sections test snap RPC methods in isolation, independent of the middleware.

| Section | Snap method | What it tests |
|---|---|---|
| `canton_getPublicKey` | `canton_getPublicKey` | Key derivation, SPKI encoding, fingerprint |
| `canton_getFingerprint` | `canton_getFingerprint` | Fingerprint only, no dialog |
| `canton_signHash` | `canton_signHash` | Signs a 32-byte hash with transaction metadata display |

These are useful for verifying the snap's crypto output in isolation — e.g. feeding in a hash from a middleware response manually and confirming the DER signature format.

---

## Running Snap Unit Tests

```bash
npm test
# 28 cross-validation tests against Go-generated test vectors
# Verifies: key derivation, SPKI DER, fingerprint, DER signatures
```

---

## Current Limitations

**Cannot install in regular MetaMask** — The snap is not published to npm. It only works via `local:http://localhost:4001` in MetaMask Flask. Publishing requires an npm release and MetaMask's snap review process.

**MetaMask Flask only** — Flask cannot coexist with regular MetaMask in the same browser profile. Use a dedicated profile.

**Each tester runs their own snap server** — The `local:` snap ID is tied to localhost. Teammates cannot share one snap server.

**Middleware URL is configurable but no staging environment exists** — The dApp Config section lets you change the middleware URL, but there is no shared testnet or staging deployment yet.

**Key index must match registration** — All snap calls must use the same key index used during registration (default: `0`). A different index derives a different key and the middleware will reject the signature.

---

## TODO / Future Work

The following flows are **not yet implemented** in the test dApp (tracked in [issue #5](https://github.com/ChainSafe/canton-snap/issues/5)):

- **Check registration status** — No `GET /user` endpoint on the middleware yet. The dApp detects already-registered state reactively (409 on registration), but cannot proactively check status on load.
- **Token transfer flow** — Prepare transfer (`POST /api/v2/transfer/prepare`), sign the returned hash with `canton_signHash`, and execute (`POST /api/v2/transfer/execute`). The snap method works but the dApp has no UI wiring for the middleware prepare/execute round-trip.
- **Balance display** — No UI to query a registered user's DEMO/PROMPT balance from the middleware.
- **Token minting** — No faucet/mint UI. Currently requires running middleware scripts manually:
  ```bash
  cd ../canton-middleware
  go run scripts/testing/mint-tokens.go --address <evm-address> --amount 1000 --token DEMO
  ```
- **End-to-end automated test** — The 9-step integration flow (registration → mint → transfer → verify balance) is not scripted. Crypto correctness is verified by unit tests; the full round-trip needs an automated integration test suite.

---

## Quick Reference

| | |
|---|---|
| Test dApp | http://localhost:3000 |
| Snap server | http://localhost:4001 |
| Snap ID | `local:http://localhost:4001` |
| Middleware API | http://localhost:8081 |
| Middleware health | `GET http://localhost:8081/health` |

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
