# Testing the Canton Snap with Middleware (Local Development)

---

## Prerequisites

### 1. MetaMask Flask

**MetaMask Flask is required.** Local snaps are a developer feature rejected by the standard MetaMask extension. Once the snap is published to npm and passes MetaMask's snap review process, a regular MetaMask install will suffice.

> **Browser profile:** Run MetaMask Flask in a **dedicated browser profile** that does not have the standard MetaMask extension installed. Both extensions inject `window.ethereum` and conflict with each other — the dApp will behave unpredictably if both are active in the same profile.

### 2. Node.js

```bash
node --version   # v18 or higher
```

### 3. Middleware

Clone the [canton-middleware](https://github.com/ChainSafe/canton-middleware) repo and start the local stack:

```bash
make docker-up     # start Canton ledger + PostgreSQL + middleware API
make docker-down   # stop and remove containers
```

Verify the API is up:

```bash
curl http://localhost:8081/health
# Expected: OK
```

---

## Setup

```bash
npm install

cp packages/snap/.env.example packages/snap/.env
cp packages/dapp/.env.example packages/dapp/.env
```

Edit each `.env` as needed. `VITE_SNAP_PORT` must match in both files (default: `4040`).

---

## Starting the Dev Servers

```bash
npm run build          # build snap + dApp
npm run serve          # start snap (4040) + dApp (3000) together

# Or individually:
npm run serve:snap     # http://localhost:4040
npm run dev:dapp       # http://localhost:3000
```

Open the dApp at **http://localhost:3000** — in the browser profile where MetaMask Flask is installed.

---

## Architecture

The snap is a pure signing oracle — it never contacts the middleware directly.

```
Canton dApp (browser)
    │
    ├── wallet_invokeSnap ──────────────────► MetaMask Flask
    │                                              │
    │                                         Canton Snap
    │                                         (key derivation + signing)
    │
    └── fetch(http://localhost:8081/...) ────► Middleware API
                                                   │
                                              Canton Ledger (gRPC)
```

---

## dApp Pages

The UI guides users through the flow. Pages in order:

| Page | Description |
|---|---|
| **Landing** | Connect MetaMask wallet |
| **Registration Choice** | Choose Custodial or Non-Custodial mode |
| **Custodial Registration** | One-click: middleware holds your Canton key |
| **Non-Custodial Registration** | Install snap → sign registration → submit |
| **Registration Done** | Party ID and fingerprint confirmed |
| **Dashboard: Profile** | Party details, key mode, snap version and install status |
| **Dashboard: Balances** | ERC-20 token balances for the registered Canton party |
| **Dashboard: Transfer** | Send tokens to another Canton party via the snap |
| **Dashboard: Activity** | ERC-20 transfer history (requires relayer — see Limitations) |

---

## Registration: Whitelist Requirement

Before an address can register, it must be whitelisted on the middleware. From the `canton-middleware` repo:

```bash
go run ./scripts/utils/whitelist.go --address <evm-address>
```

Registration will return an error until the address is whitelisted.

---

## Transfer Testing: Fund the Wallet

To test transfers, the Canton party must hold tokens. From the `canton-middleware` repo:

```bash
go run ./scripts/utils/fund-wallet.go --address <evm-address> --amount 1000 --token DEMO
```

---

## Tests

```bash
npm test              # crypto unit tests + snap integration tests
npm run test:snap     # snap integration tests only (jest + @metamask/snaps-jest)
```

---

## Current Limitations

**MetaMask Flask required** — Until the snap is published to npm and reviewed by MetaMask, only MetaMask Flask users can install it.

**Snap not published** — The snap runs only as `local:http://localhost:4040`. Publishing requires an npm release and MetaMask's snap review.

**Each developer runs their own snap server** — The `local:` snap ID is bound to localhost; teammates cannot share one instance.

**Activity tab requires relayer/bridge** — The Activity UI is built and reads ERC-20 transfer logs from the Canton EVM RPC. Populating real transaction history depends on the relayer or bridge being deployed and indexing events. This is the primary remaining integration work.

---

## TODO

- **Relayer / bridge integration** — Deploy and connect the relayer or bridge so the Activity tab has real transaction history to display. The UI and log-fetching logic are complete on the dApp side.

---

## Quick Reference

| | |
|---|---|
| Canton dApp | http://localhost:3000 |
| Snap server | http://localhost:4040 (set via `VITE_SNAP_PORT` in `packages/snap/.env`) |
| Snap ID | `local:http://localhost:4040` |
| Middleware API | http://localhost:8081 |

| Command | Purpose |
|---|---|
| `make docker-up` | Start middleware stack (Canton + DB + API) |
| `make docker-down` | Stop middleware stack |
| `npm run serve` | Start snap + dApp together |
| `npm run serve:snap` | Snap server only |
| `npm run dev:dapp` | dApp dev server only |
| `npm run build` | Build snap + dApp |
| `npm run watch:snap` | Snap hot-reload |
| `npm test` | All tests |
| `npm run lint` | Lint all packages |
| `npm run format` | Format all packages |

| Middleware script | Purpose |
|---|---|
| `go run ./scripts/utils/whitelist.go --address <addr>` | Whitelist an EVM address for registration |
| `go run ./scripts/utils/fund-wallet.go --address <addr> --amount N --token DEMO` | Fund a Canton party for transfer testing |

| Middleware endpoint | Purpose |
|---|---|
| `POST /register` | Custodial or non-custodial registration |
| `POST /register/prepare-topology` | Step 1 of non-custodial registration |

| Snap method | Dialog | Purpose |
|---|---|---|
| `canton_getPublicKey` | Yes | Key derivation + SPKI + fingerprint |
| `canton_signTopology` | Yes | Sign Canton topology multihash |
| `canton_signHash` | Yes | Sign 32-byte pre-hashed digest |
| `canton_getFingerprint` | No | Fingerprint lookup only |
