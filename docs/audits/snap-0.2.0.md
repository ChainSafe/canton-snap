# Canton Snap — Internal Security Audit (v0.2.0)

| Field | Value |
|---|---|
| Subject | `@chainsafe/canton-snap@0.2.0` |
| Auditor | Internal review |
| Scope | `packages/snap/` source, manifest, build config, dependencies |
| Out of scope | `packages/dapp/`, Canton middleware, MetaMask runtime |
| Status | Draft — findings unaddressed |

## 1. Executive Summary

The snap is a small, single-purpose signing oracle. Key derivation (`@noble/curves` secp256k1 + `snap_getEntropy`) and DER signing are correctly implemented and cross-validated against Go test vectors. There is no network access, no on-disk state, and the source files total fewer than 400 lines.

The principal weaknesses identified are not in the cryptographic primitives but in **input handling and authorization**:

1. **Origin is never inspected.** Any installed dApp can drive `canton_signHash`, `canton_signTopology`, and `canton_getFingerprint`. The user-approval dialog is the only gate, and it does not disclose which dApp is asking.
2. **Caller-supplied metadata is rendered to the user as if it were authoritative.** A malicious dApp can show plausible UI text while requesting a signature over an unrelated hash.
3. **Hex inputs are decoded with a forgiving parser** that silently substitutes zero bytes for invalid characters and truncates odd-length inputs. Combined with `keyIndex` having no integer/range validation, this creates several silent-corruption paths.
4. **`canton_getFingerprint` has no dialog** and discloses a stable Canton identity to any caller.

No critical, key-extraction, or remote-code-execution issues were identified. The published npm tarball does not transitively include any of the dependencies flagged by `npm audit`; all flagged advisories are in development-only paths.

The recommended remediation work is concentrated in `src/index.ts` and is small (well under a day's engineering). The work in §5 below should be considered prerequisites to MetaMask Snaps Registry submission.

## 2. Risk Matrix

| ID | Title | Severity | Likelihood | Impact |
|---|---|---|---|---|
| H-01 | Unauthenticated dApp origin on every RPC | High | High | Sign-by-deception, identity leak |
| H-02 | Caller-supplied metadata rendered as authoritative | High | High | Display/intent divergence |
| M-01 | `hexToBytes` silently substitutes zero for invalid input | Medium | Medium | Signs unintended digests |
| M-02 | Odd-length hex silently truncates | Medium | Low | Signs unintended digests |
| M-03 | `hash` length not pre-validated before dialog render | Medium | Low | DoS via huge dialog payload |
| M-04 | `keyIndex` accepts `NaN`, floats, negatives, huge numbers | Medium | Low | Unbounded keyspace, dialog ambiguity |
| M-05 | `canton_getFingerprint` discloses identity with no consent | Medium | High | Cross-dApp tracking |
| M-06 | Topology dialog does not describe what is being authorized | Medium | Low | Approval without informed consent |
| L-01 | `snap_manageState` declared but unused | Low | — | Larger install dialog surface |
| L-02 | Incorrect rationale comment in `keyDerivation.ts` | Low | — | Maintenance hazard |
| L-03 | Signature response leaks fingerprint without explicit consent | Low | High | Identity correlation |
| L-04 | 18 transitive `npm audit` advisories in dev tooling | Low | — | None on shipped bundle |
| I-01 | No `SECURITY.md` / disclosure process | Info | — | — |
| I-02 | No fuzz / negative-input test coverage | Info | — | — |
| I-03 | Hand-rolled DER encoder duplicates `@noble/curves` capability | Info | — | — |

## 3. Methodology

- Source review of `packages/snap/src/*.ts` and `test/*`.
- Manifest review against MetaMask Snaps allowlist requirements.
- Live reproduction of input-handling findings via Node REPL.
- `npm audit --workspace packages/snap` for dependency posture.
- Static check of the published tarball file list (`files` field).

## 4. Findings

### H-01 — Unauthenticated dApp origin on every RPC

**Location:** `src/index.ts:25-38`.

**Observation.** `onRpcRequest` receives `{ origin, request }` from the snap runtime but ignores `origin`. The handlers proceed to the same dialog and signature path regardless of which dApp originated the call. The user-approval dialog (`src/dialogs.ts`) shows the hash and optional metadata but never the calling origin.

Since the manifest declares `endowment:rpc` with `dapps: true`, every connected dApp can invoke these methods.

**Impact.** A user with multiple dApps connected, or a user phished into installing a malicious dApp that has previously been granted snap access (e.g., via a `wallet_requestSnaps` consent), can be tricked into signing arbitrary 32-byte digests. Because the digest is opaque, the user has no way to verify intent from the dialog.

**Recommendation.**
1. Include `origin` in every confirmation dialog. Show it prominently (e.g., as the dialog heading or first line: "Signing request from `https://attacker.example`").
2. For `canton_getFingerprint`, either add a one-time-per-origin permission (persist allowed origins in `snap_manageState`) or surface a dialog on first use per origin.
3. Optionally maintain an explicit allowlist of dApp origins approved at install time; this is the strongest defense but adds operational cost.

### H-02 — Caller-supplied metadata rendered as authoritative

**Location:** `src/dialogs.ts:36-57`, `src/types.ts:11-17`.

**Observation.** `SignHashMetadata` (`operation`, `tokenSymbol`, `amount`, `recipient`, `sender`) is taken verbatim from the dApp's RPC params and displayed in the signing dialog. The hash is the only field the signature actually covers — the metadata is not bound to the digest in any way.

**Impact.** A malicious dApp can show `"Transfer 1 DEMO to alice.canton"` in the dialog while the hash represents an entirely different Canton transaction (e.g., a large-value transfer to an attacker-controlled party). The user has no out-of-band way to verify.

**Recommendation.** Pick one:
- **(Preferred)** Remove the metadata fields from the dialog entirely. Showing only the hash is honest: the user knows nothing about the operation and must verify it via the dApp UI before approving.
- **(Tactical)** Keep the fields but prepend an unmissable warning: `⚠ Details below are provided by the dApp and are not verified by the snap. Verify in the dApp UI before approving.` In dialog UI, separate them visually from the hash.
- **(Strategic)** Have the snap parse Canton's `PreparedTransaction` protobuf and render fields the snap itself can attest to. This is a larger project but is the correct end-state.

### M-01 — `hexToBytes` silently substitutes zero for invalid input

**Location:** `src/index.ts:137-143`, `src/sign.ts:84-90`, `src/keyDerivation.ts:55-62`, `src/fingerprint.ts:56-60`.

**Observation.** Each module defines a local `hexToBytes`:

```ts
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
```

`parseInt("zz", 16)` returns `NaN`. `Uint8Array` coerces `NaN` to `0`. As reproduced:

```
hexToBytes("z".repeat(64)) → 32 bytes of 0x00
hexToBytes("zz" + "aa".repeat(31)) → 0x00 0xaa 0xaa … 0xaa
```

**Impact.** A signature over a fully-zero or partially-corrupted hash succeeds without error. While the user must still approve the dialog, the rendered `hash` field (`Copyable({ value: hash })`) shows the original string they were told to sign, which differs from the bytes that get signed. Two failure modes:
1. Honest dApp with a bug that produces bad hex — silent signing of the wrong digest, user blame.
2. Adversarial dApp that constructs hex with carefully placed invalid characters to make the displayed hash look reasonable while signing a controlled value (e.g., `z` chars in positions the user is unlikely to read).

**Recommendation.** Replace the local helpers with a single strict implementation in a `src/hex.ts` module:

```ts
const HEX_RE = /^[0-9a-fA-F]*$/;
export function hexToBytes(hex: string): Uint8Array {
  if (!HEX_RE.test(hex)) throw new Error("hash contains non-hex characters");
  if (hex.length % 2 !== 0) throw new Error("hash has odd length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return bytes;
}
```

### M-02 — Odd-length hex silently truncates

**Location:** Same files as M-01.

**Observation.** `"abc".length / 2 === 1.5`, `new Uint8Array(1.5)` allocates 1 byte. The third character is discarded silently. Reproduced: `hexToBytes("abc")` → `0xab`.

**Impact.** Same as M-01: a malformed hash signs as a truncated digest without error.

**Recommendation.** Folded into M-01's fix.

### M-03 — `hash` length not pre-validated before dialog render

**Location:** `src/index.ts:61-91` (handleSignHash), `src/index.ts:93-127` (handleSignTopology).

**Observation.** The byte-length check that enforces 32 bytes is inside `signHashDER` (`src/sign.ts:24-29`), called **after** the dialog renders. A 1 MB hex hash would be passed verbatim to `Copyable({ value: hash })` before being rejected. `mm-snap`'s dialog renderer is not designed for arbitrary-size payloads.

**Impact.** Memory and UI DoS from a single RPC call by any dApp. The user would see a sluggish or unresponsive MetaMask popup.

**Recommendation.** Validate the hash format at the very top of each handler, before the dialog:

```ts
if (typeof params.hash !== "string" || params.hash.length > 130) {
  throw new Error("hash must be a 32-byte hex string");
}
```

(130 = `0x` + 128 hex chars; tighten further if no prefix is expected.)

### M-04 — `keyIndex` accepts `NaN`, floats, negatives, huge numbers

**Location:** `src/index.ts:41, 72, 108, 130`; `src/keyDerivation.ts:34-43`.

**Observation.** `keyIndex` is typed `number | undefined` and template-stringified into the salt: `` `canton-network-key-${keyIndex}` ``. As reproduced:

| `keyIndex` value | Salt |
|---|---|
| `0` | `canton-network-key-0` |
| `0.5` | `canton-network-key-0.5` |
| `0.50` | `canton-network-key-0.5` (collides with above) |
| `NaN` | `canton-network-key-NaN` |
| `undefined` (params is `{ hash: ..., keyIndex: undefined }`) | falls back to `0` ✓ |
| `-1` | `canton-network-key--1` |
| `1e20` | `canton-network-key-100000000000000000000` |

**Impact.** The keyspace is effectively unbounded. Two consequences:
1. A dApp can derive arbitrary, distinct keys per dApp/user/session without user awareness — each appears identical in the dialog (no keyIndex shown).
2. `0.5` vs `0.50` both stringify to `0.5`, but unique floats like `0.5000000000000001` produce distinct salts. Fingerprinting based on tiny float perturbations becomes possible.

**Recommendation.** Add a guard before every use:

```ts
function validatedKeyIndex(v: unknown): number {
  const i = v ?? 0;
  if (!Number.isInteger(i) || i < 0 || i > 1000) {
    throw new Error("keyIndex must be a non-negative integer ≤ 1000");
  }
  return i;
}
```

Cap is a policy decision — 1000 is generous and prevents UI overflow.

### M-05 — `canton_getFingerprint` discloses identity with no consent

**Location:** `src/index.ts:33, 129-135`.

**Observation.** Of the four RPC methods, only `canton_getFingerprint` has no dialog. The fingerprint is a stable 34-byte multihash of the public key — it is the user's Canton party identifier.

**Impact.** Any connected dApp can:
- Confirm whether the user has registered a Canton party.
- Correlate the user across dApps (same fingerprint everywhere).
- Use the fingerprint to look up the user in Canton's public ledger and gather transaction history.

This is the strongest privacy issue in the surface area.

**Recommendation.** Either:
- Show a dialog on every call (consistent with the other three methods), or
- Implement a per-origin allowlist using `snap_manageState`: first call from an origin prompts the user; subsequent calls from approved origins return silently.

### M-06 — Topology dialog does not describe what is being authorized

**Location:** `src/dialogs.ts:62-73`.

**Observation.** The topology-signing dialog reads:

> Approve Canton Registration. Sign the topology transaction to register your Canton Network identity. This links your MetaMask wallet to a Canton party. Topology hash: <hex>

This is true for the initial registration topology. It is misleading for subsequent topology operations — key rotation, additional signing keys, party hosting changes — which the snap will also accept and sign.

**Impact.** A user re-registering or doing key rotation has no way to distinguish that operation from an initial registration based on the dialog text.

**Recommendation.** Without parsing the topology payload, this is hard to solve perfectly. Minimum:
- Change the heading to `"Sign Canton Topology Transaction"` (operation-agnostic).
- Remove the misleading second sentence about "register your Canton Network identity".
- Add a warning: `⚠ Topology transactions can rotate keys or change party membership. Verify in the dApp before approving.`

### L-01 — `snap_manageState` declared but unused

**Location:** `snap.manifest.json:23`, `src/index.ts`.

**Observation.** The manifest grants `snap_manageState`, but no source file calls it. The README mentions persisting registered fingerprints; this is not implemented.

**Impact.** The install dialog shows a "manage state" permission the snap does not exercise. Larger blast radius if the snap is ever compromised post-install.

**Recommendation.** Either implement the state persistence (likely needed to fix M-05) or remove the permission from the manifest until needed.

### L-02 — Incorrect rationale comment in `keyDerivation.ts`

**Location:** `src/keyDerivation.ts:8-9`.

> `snap_getEntropy` is the recommended approach for snaps that need non-Ethereum keys, as `snap_getBip44Entropy` forbids coin type 60.

This is backwards. `snap_getBip44Entropy` with `coinType: 60` is what derives an Ethereum-compatible key from the seed; what MetaMask actually restricts is access to coin type 60's standard derivation path (m/44'/60'/0'/0/*) because that path is what the wallet itself uses. The correct rationale for the snap's choice is that it wants snap-scoped entropy that is unlinkable from any standard BIP-44 wallet path.

**Recommendation.** Rewrite the comment to: `"snap_getEntropy returns snap-scoped entropy, deterministic per (snap, salt) and unlinkable from the user's BIP-44 wallet keys."`

### L-03 — Signature response leaks fingerprint without explicit consent

**Location:** `src/index.ts:87-90, 122-126`.

**Observation.** Every signature response includes the `fingerprint` field. The signing dialog says "Sign Canton Transaction" but does not say "and reveal your Canton identity to this dApp".

**Impact.** Lower than M-05 because the user has already consented to a Canton-scoped signing operation, which implies revealing the signing identity. Still, the disclosure is implicit.

**Recommendation.** Mention in the dialog footer: `"Approving will also share your Canton fingerprint with the dApp."` Cheap to add.

### L-04 — 18 transitive `npm audit` advisories in dev tooling

**Observation.** Advisories include `bn.js` infinite-loop (GHSA-378v-28hj-76wf, moderate), `elliptic` risky-primitive (GHSA-848j-6mx2-7j84, low), `@metamask/controller-utils` chain, etc. All are reached through `@metamask/snaps-cli`, `@metamask/snaps-jest`, `@metamask/snaps-controllers` (the test emulator).

The published tarball ships only four files (`dist/bundle.js`, `images/icon.svg`, `package.json`, `snap.manifest.json`). None of the flagged packages are in the bundle.

**Impact.** None on shipped artifact. Theoretical risk: a developer running tests on an attacker-controlled hash could trigger the `bn.js` infinite loop, hanging CI. Low.

**Recommendation.** Track upstream fixes via `npm audit`; do not introduce overrides that would force `^11.1.1` snaps-sdk transitives down to `11.1.0` (covered separately — would break the test emulator).

### I-01 — No `SECURITY.md` / disclosure process

A `SECURITY.md` at the repo root is standard for any signing-related project. Should describe: supported versions (currently `^0.2.x`), how to report vulnerabilities (preferred channel — `security@chainsafe.io` or GitHub Security Advisories), the project's stance on coordinated disclosure, and a public-key/PGP option for sensitive reports.

### I-02 — No fuzz / negative-input test coverage

The current jest suite covers happy paths and one missing-hash error. Recommended additions:
- Property-based test that `hexToBytes(hex)` round-trips for all valid hex and rejects every non-hex string.
- `keyIndex` edge cases: `NaN`, `Infinity`, `-1`, `1e20`, `"0"` (string).
- `metadata` with extreme strings (1 MB tokenSymbol).
- Concurrent invocation behavior.

### I-03 — Hand-rolled DER encoder duplicates `@noble/curves` capability

`src/sign.ts:43-82` implements ASN.1 DER `SEQUENCE { INTEGER, INTEGER }` encoding by hand. The cross-validation tests confirm correctness, but `@noble/curves` ships `sig.toDERRawBytes()` that produces the same output. Using the library reduces audit surface.

## 5. Recommended Remediation Order

Pre-registry submission (block on these):

1. **H-01** — display `origin` in every dialog.
2. **H-02** — either remove unauthenticated metadata from dialog, or surface a clear "not-verified-by-snap" warning.
3. **M-01 + M-02** — strict hex parser in a shared `src/hex.ts`.
4. **M-04** — `keyIndex` validation.
5. **M-03** — hash length check before dialog render.

Should-fix:

6. **M-05** — dialog or per-origin allowlist on `canton_getFingerprint`.
7. **M-06** — neutral topology dialog wording.
8. **L-01** — drop unused `snap_manageState`, or implement and use it for M-05.
9. **L-02** — fix the misleading comment.

Nice-to-have:

10. **L-03** — disclose fingerprint sharing in dialog footer.
11. **I-01** — add `SECURITY.md`.
12. **I-02** — negative-input tests.
13. **I-03** — switch to `@noble/curves` DER helper.

## 6. Appendix

### Files reviewed

```
packages/snap/src/index.ts            (154 lines)
packages/snap/src/keyDerivation.ts    ( 62 lines)
packages/snap/src/sign.ts             ( 91 lines)
packages/snap/src/spki.ts             ( 68 lines)
packages/snap/src/fingerprint.ts      ( 61 lines)
packages/snap/src/dialogs.ts          ( 74 lines)
packages/snap/src/types.ts            ( 42 lines)
packages/snap/snap.manifest.json
packages/snap/snap.config.ts
packages/snap/package.json
packages/snap/test/index.test.js
packages/snap/test/crypto.test.ts
```

### Dependency versions

| Package | Version | Surface |
|---|---|---|
| `@noble/curves` | `^1.8.0` (resolves 1.9.7) | runtime |
| `@noble/hashes` | `^1.7.0` (resolves 1.8.0) | runtime |
| `@metamask/snaps-sdk` | `11.1.0` (exact) | runtime (types + JSX) |
| `@metamask/snaps-cli` | `^8.4.1` | dev |
| `@metamask/snaps-jest` | `^10.1.3` | dev |

### Trust model assumed

- MetaMask runtime is trusted (snap sandbox enforces I/O).
- User reviews dialog content before approving.
- Snap state, if persisted via `snap_manageState`, is treated as integrity-bound (MetaMask encrypts/signs).
- All dialogs are non-bypassable from the dApp side (assumed property of the MetaMask snap dialog implementation).
- Origin is not a forgeable input from the dApp's perspective (assumed property of `endowment:rpc`).
