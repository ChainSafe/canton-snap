# Canton Snap

MetaMask Snap for non-custodial Canton Network signing.

Derives secp256k1 keys from the user's MetaMask seed phrase and signs Canton transactions with SHA-256 + ASN.1 DER encoding — the signature format Canton's Interactive Submission API requires but MetaMask cannot produce natively.

## Architecture

```
MetaMask (encrypted vault, holds seed)
    │
    └─ Canton Snap (sandboxed)
         ├─ Derives key via snap_getEntropy (salt = "canton-network-key-<index>")
         ├─ Hashed (SHA-256) to a secp256k1 private key, with rejection sampling
         ├─ Signs SHA-256 ECDSA DER (low-S, RFC 6979 deterministic k)
         ├─ Shows confirmation dialog (origin + keyIndex + fingerprint visible)
         └─ Returns signature to dApp
```

Keys are **scoped to the snap ID**, not derived from a BIP-44 path. The same MetaMask seed will produce a different Canton identity under `local:http://localhost:4040` vs `npm:@chainsafe/canton-snap`. The published snap is the recoverable identity; local dev keys are independent. There is no migration path between snap IDs — re-register the new identity with Canton if the snap ID changes.

The **Cantonium dApp** (`packages/dapp`) is the browser frontend. It drives MetaMask + the snap for key operations, and talks to the Canton middleware REST API for registration and transaction flows.

## Snap RPC Methods

| Method | Purpose | Dialog |
|--------|---------|--------|
| `canton_getPublicKey` | Export compressed pubkey + SPKI DER + fingerprint | Yes |
| `canton_signTopology` | Sign topology hash during registration | Yes |
| `canton_signHash` | Sign a 32-byte transaction hash with optional metadata for the dialog | Yes |
| `canton_getFingerprint` | Quick fingerprint lookup | First use per origin + key index |

## Project Structure

```
canton-snap/
├── packages/
│   ├── snap/                       # MetaMask Snap — Canton transaction signer
│   │   ├── src/
│   │   │   ├── index.ts            # onRpcRequest handler
│   │   │   ├── keyDerivation.ts    # snap_getEntropy key derivation
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
│   └── dapp/                       # Cantonium — React 19 + Vite
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
├── .env.example                    # Points to per-package .env.example files
└── package.json                    # Workspace root — scripts for all packages
```

## Development

The dApp can run against either the published snap on npm (default) or a locally served snap. The mode is controlled by `VITE_SNAP_ID` in `packages/dapp/.env`.

### Mode A — published snap (default, standard MetaMask)

Leave `VITE_SNAP_ID` unset. The dApp uses `npm:@chainsafe/canton-snap` and works with the standard MetaMask extension.

```bash
npm install
cp packages/dapp/.env.example packages/dapp/.env
npm run dev:dapp
```

### Mode B — local snap (MetaMask Flask)

Set `VITE_SNAP_ID=local:http://localhost:4040` in `packages/dapp/.env`. Requires [MetaMask Flask](https://metamask.io/flask/) in a dedicated browser profile (standard MetaMask rejects local snaps, and both extensions injecting `window.ethereum` will conflict).

```bash
npm install
cp packages/snap/.env.example packages/snap/.env
cp packages/dapp/.env.example packages/dapp/.env
# in packages/dapp/.env, uncomment VITE_SNAP_ID=local:http://localhost:4040

npm run build
npm run serve                  # snap on 4040, dApp on 3000
# or individually:
npm run serve:snap
npm run dev:dapp
npm run watch:snap             # snap with hot-reload
```

The port in `VITE_SNAP_ID` must match `VITE_SNAP_PORT` in `packages/snap/.env` (default `4040`).

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

- `snap_getEntropy` — derive snap-scoped Canton signing keys
- `snap_dialog` — confirmation dialogs
- `snap_manageState` — persist registered fingerprints
- `endowment:rpc` (`dapps: true`) — accept RPC from dApps
- No network access

## Dependencies

**Snap (`packages/snap`):**
- [`@noble/curves`](https://github.com/paulmillr/noble-curves) — secp256k1 ECDSA (audited, pure JS)
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — SHA-256
- [`@metamask/snaps-sdk`](https://github.com/MetaMask/snaps) — Snap API types and UI components

**dApp (`packages/dapp`):**
- [React 19](https://react.dev) + [Vite](https://vitejs.dev) — UI framework and build tool

## Release

Snap releases are driven by [release-please](https://github.com/googleapis/release-please) and published to npm via [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) — no `NPM_TOKEN` in the repo.

Scope: only `packages/snap`. Commits that don't touch `packages/snap/` are ignored. The dApp will have its own pipeline later.

1. Land conventional commits (`feat:`, `fix:`, `feat!:`) touching `packages/snap/`.
2. `Release Please` opens a release PR (`chore(main): release snap X.Y.Z`).
3. Merge it → tag `snap-vX.Y.Z`, GitHub release, `npm publish` with provenance.

Manual trigger: Actions → Release Please → Run workflow.

## Installing the Published Snap

Snap ID: `npm:@chainsafe/canton-snap`. Works with standard MetaMask (no Flask).

```ts
const SNAP_ID = "npm:@chainsafe/canton-snap";

await window.ethereum.request({
  method: "wallet_requestSnaps",
  params: { [SNAP_ID]: { version: "^0.2.0" } },
});

await window.ethereum.request({
  method: "wallet_invokeSnap",
  params: { snapId: SNAP_ID, request: { method: "canton_getFingerprint" } },
});
```

Check install status with `wallet_getSnaps`.

## License

This project is licensed under the Apache License, Version 2.0. See
[LICENSE](LICENSE) for the full license text and [NOTICE](NOTICE) for
attributions of third-party software included in or depended on by this
project.
