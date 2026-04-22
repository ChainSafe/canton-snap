# Canton Snap

MetaMask Snap for non-custodial Canton Network signing.

Derives secp256k1 keys from the user's MetaMask seed phrase and signs Canton transactions with SHA-256 + ASN.1 DER encoding — the signature format Canton's Interactive Submission API requires but MetaMask cannot produce natively.

## Architecture

```
MetaMask (encrypted vault, holds seed)
    │
    └─ Canton Snap (sandboxed)
         ├─ Derives key at m/44'/60'/1'/0/0
         ├─ Signs with SHA-256 + ECDSA + DER
         ├─ Shows confirmation dialog
         └─ Returns signature to dApp
```

The **Canton dApp** (`packages/dapp`) is the browser frontend. It drives MetaMask + the snap for key operations, and talks to the Canton middleware REST API for registration and transaction flows.

## Snap RPC Methods

| Method | Purpose | Dialog |
|--------|---------|--------|
| `canton_getPublicKey` | Export compressed pubkey + SPKI DER + fingerprint | Yes |
| `canton_signTopology` | Sign topology hash during registration | Yes |
| `canton_signHash` | Sign a 32-byte hash, return DER signature | Yes |
| `canton_getFingerprint` | Quick fingerprint lookup | No |

## Project Structure

```
canton-snap/
├── packages/
│   ├── snap/                       # MetaMask Snap — pure signing oracle
│   │   ├── src/
│   │   │   ├── index.ts            # onRpcRequest handler
│   │   │   ├── keyDerivation.ts    # BIP-44 key derivation from MetaMask seed
│   │   │   ├── dialogs.ts          # Confirmation dialog builders
│   │   │   ├── types.ts            # RPC param/response interfaces
│   │   │   ├── spki.ts             # Compressed pubkey → SPKI DER
│   │   │   ├── fingerprint.ts      # SPKI DER → Canton multihash fingerprint
│   │   │   └── sign.ts             # (privateKey, hash) → DER signature
│   │   ├── test/
│   │   │   ├── vectors.json        # Go-generated cross-validation vectors
│   │   │   ├── crypto.test.ts      # Crypto unit tests
│   │   │   ├── index.test.js       # Snap integration tests
│   │   │   └── setup.js
│   │   ├── snap.manifest.json
│   │   └── snap.config.ts
│   └── dapp/                       # Canton dApp — React 19 + Vite
│       ├── src/
│       │   ├── App.tsx             # State-based router
│       │   ├── components/         # TopBar, WalletMenu, NetworkSwitcher, …
│       │   ├── hooks/              # useMetaMask, useSnap, useRegistration
│       │   ├── lib/                # config, ethereum, middleware, cn
│       │   └── pages/              # LandingPage, RegistrationChoicePage, …
│       ├── index.html
│       └── vite.config.ts
├── docs/
│   └── testing-with-middleware.md  # Local dev setup and testing guide
├── designs/                        # UI design mockups (SVG)
├── eslint.config.js                # ESLint 9 flat config (all packages)
├── .env.example                    # Environment variable template
└── package.json                    # Workspace root — scripts for all packages
```

## Development

```bash
npm install
cp .env.example .env          # configure snap port (default: 8080)

# Build snap + dApp
npm run build

# Start both servers (snap on 8080, dApp on 3000)
npm run serve

# Or individually:
npm run serve:snap             # snap dev server
npm run dev:dapp               # dApp Vite dev server
npm run watch:snap             # snap with hot-reload
```

See [`docs/testing-with-middleware.md`](docs/testing-with-middleware.md) for the full local setup guide including middleware integration.

## Quality

```bash
npm run lint                   # ESLint across all packages
npm run lint:fix               # Auto-fix lint errors
npm run format                 # Prettier format
npm run format:check           # Check formatting without writing
```

## Tests

```bash
npm test                       # Crypto cross-validation unit tests
npm run test:snap              # Full snap integration tests (jest + snaps-jest)
```

## Snap Permissions

- `snap_getBip44Entropy` (coinType 60) — derive Canton keys from seed
- `snap_dialog` — show confirmation dialogs
- `snap_manageState` — persist registered fingerprints
- **No network access** — the snap is a pure signing oracle

## Dependencies

**Snap (`packages/snap`):**
- [`@noble/curves`](https://github.com/paulmillr/noble-curves) — secp256k1 ECDSA (audited, pure JS)
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — SHA-256
- [`@metamask/key-tree`](https://github.com/MetaMask/key-tree) — BIP-44 key derivation
- [`@metamask/snaps-sdk`](https://github.com/MetaMask/snaps) — Snap API types and UI components

**dApp (`packages/dapp`):**
- [React 19](https://react.dev) + [Vite](https://vitejs.dev) — UI framework and build tool
