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
├── .env.example                    # Points to per-package .env.example files
└── package.json                    # Workspace root — scripts for all packages
```

## Development

**Requires [MetaMask Flask](https://metamask.io/flask/)** — local snaps are rejected by the standard MetaMask extension. Flask is needed until the snap is published to npm. Run it in a dedicated browser profile where the standard MetaMask extension is not installed to avoid `window.ethereum` conflicts.

```bash
npm install

# Copy env templates for each package
cp packages/snap/.env.example packages/snap/.env
cp packages/dapp/.env.example packages/dapp/.env

# Build snap + dApp
npm run build

# Start both servers (snap on 4040, dApp on 3000)
npm run serve

# Or individually:
npm run serve:snap             # snap dev server
npm run dev:dapp               # dApp Vite dev server
npm run watch:snap             # snap with hot-reload
```

`VITE_SNAP_PORT` must match in both `.env` files (default: `4040`).

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

- `snap_getEntropy` — derive a deterministic, snap-scoped seed (Canton uses coin type 60, which `snap_getBip44Entropy` forbids, so we hash snap-specific entropy instead)
- `snap_dialog` — show confirmation dialogs
- `snap_manageState` — persist registered fingerprints
- `endowment:rpc` (`dapps: true`) — accept JSON-RPC calls from dApps
- **No network access** — the snap is a pure signing oracle

## Dependencies

**Snap (`packages/snap`):**
- [`@noble/curves`](https://github.com/paulmillr/noble-curves) — secp256k1 ECDSA (audited, pure JS)
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — SHA-256
- [`@metamask/snaps-sdk`](https://github.com/MetaMask/snaps) — Snap API types and UI components

**dApp (`packages/dapp`):**
- [React 19](https://react.dev) + [Vite](https://vitejs.dev) — UI framework and build tool

## Release

Releases are fully automated by [release-please](https://github.com/googleapis/release-please) — no local scripts, no manual tagging, no `npm publish` from a laptop.

### How it works

1. **Land conventional commits.** Use `feat: …`, `fix: …`, `feat!: …` (breaking) etc. in PR titles / squashed commits. These drive the version bump.
2. **release-please opens a release PR automatically.** On every push to `main`, the `Release Please` workflow runs and either opens or updates a single PR titled e.g. `chore(main): release 0.3.0`. It contains:
   - the version bump in `packages/snap/package.json` and `packages/snap/snap.manifest.json` (kept in lockstep via `extra-files`),
   - a generated `packages/snap/CHANGELOG.md` entry,
   - the list of commits going into the release.
3. **Review and merge the release PR.** That's the only manual step.
4. **On merge, the same workflow's `publish` job runs.** It:
   - creates the git tag `vX.Y.Z`,
   - creates the GitHub release (visible under the repo's **Releases** tab),
   - runs lint + build (which auto-syncs the manifest shasum) + tests,
   - publishes `@chainsafe/canton-snap@X.Y.Z` to npm with [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) (visible under the repo's **Packages** sidebar after first publish),
   - appends install instructions to the GitHub release notes.

You can also trigger the workflow manually from the Actions tab via **Run workflow** if you want release-please to re-evaluate without waiting for the next push.

### One-time setup

- Add an `NPM_TOKEN` secret to the repo: an **Automation** token from npm with publish rights on the `@chainsafe` scope (Settings → Secrets and variables → Actions → New repository secret).
- `GITHUB_TOKEN` is provided by Actions automatically.
- For npm provenance to work, the `id-token: write` permission must be granted to the workflow — it already is.

### Conventional commit cheat sheet

| Prefix | Effect on version | Example |
|---|---|---|
| `fix: …` | patch (0.2.0 → 0.2.1) | `fix: handle missing keyIndex param` |
| `feat: …` | minor (0.2.0 → 0.3.0) | `feat: add canton_signBatch RPC method` |
| `feat!: …` or footer `BREAKING CHANGE:` | major (0.2.0 → 1.0.0) | `feat!: rename canton_signHash params` |
| `chore:`, `ci:`, `build:`, `test:`, `style:` | no release | housekeeping |
| `docs:`, `refactor:`, `perf:`, `deps:` | no version bump on their own, but appear in changelog | |

If `main` only has `chore:` / `ci:` commits since the last release, release-please will not open a PR — there's nothing user-visible to release.

## Installing the Published Snap

Once published, the snap is identified by `npm:@chainsafe/canton-snap` and is supported by the standard MetaMask extension (no Flask required).

A dApp installs and connects to it through `wallet_requestSnaps`:

```ts
const SNAP_ID = "npm:@chainsafe/canton-snap";

// Prompts the user to install (first time) or just connect (subsequent times).
const result = await window.ethereum.request({
  method: "wallet_requestSnaps",
  params: { [SNAP_ID]: { version: "^0.2.0" } },
});

// Invoke an RPC method on the snap.
const { fingerprint } = await window.ethereum.request({
  method: "wallet_invokeSnap",
  params: { snapId: SNAP_ID, request: { method: "canton_getFingerprint" } },
});
```

MetaMask shows the install dialog with the snap's icon, permissions, and version, and the user approves once. After that, `wallet_invokeSnap` calls go straight through.

To check whether a snap is already installed:

```ts
const snaps = await window.ethereum.request({ method: "wallet_getSnaps" });
const installed = snaps[SNAP_ID]; // { version, id, ... } or undefined
```
