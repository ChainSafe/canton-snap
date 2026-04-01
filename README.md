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

## RPC Methods

| Method | Purpose | Dialog |
|--------|---------|--------|
| `canton_getPublicKey` | Export compressed pubkey + SPKI DER + fingerprint | Yes |
| `canton_signHash` | Sign a 32-byte hash, return DER signature | Yes (shows tx details) |
| `canton_signTopology` | Sign topology hash during registration | Yes |
| `canton_getFingerprint` | Quick fingerprint lookup | No |

## Development

```bash
npm install

# Build the snap bundle
npm run build

# Run cross-validation tests (Phase 1 crypto)
npm test

# Serve locally for MetaMask Flask testing
npm -w packages/snap run serve
```

## Project Structure

```
packages/snap/
├── src/
│   ├── index.ts              # onRpcRequest handler (4 RPC methods)
│   ├── keyDerivation.ts      # BIP-44 key derivation from MetaMask seed
│   ├── dialogs.ts            # Confirmation dialog builders
│   ├── types.ts              # RPC param/response interfaces
│   ├── spki.ts               # Compressed pubkey → SPKI DER (proven crypto)
│   ├── fingerprint.ts        # SPKI DER → Canton multihash fingerprint (proven crypto)
│   └── sign.ts               # (privateKey, hash) → DER signature (proven crypto)
├── test/
│   ├── vectors.json          # Go-generated test vectors
│   └── crypto.test.ts        # Cross-validation tests (28 passing)
├── snap.manifest.json        # Snap permissions and metadata
└── snap.config.ts            # Build configuration
```

## Permissions

- `snap_getBip44Entropy` (coinType 60) — derive Canton keys from seed
- `snap_dialog` — show confirmation dialogs
- `snap_manageState` — persist registered fingerprints
- **No network access** — the snap is a pure signing oracle

## Dependencies

- [`@noble/curves`](https://github.com/paulmillr/noble-curves) — secp256k1 ECDSA (audited, pure JS)
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — SHA-256
- [`@metamask/key-tree`](https://github.com/MetaMask/key-tree) — BIP-44 key derivation
- [`@metamask/snaps-sdk`](https://github.com/MetaMask/snaps) — Snap API types and UI components
