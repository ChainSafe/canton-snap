# Plan: end-to-end test for Snap-signed transfers

**Status:** proposal for review
**Addresses:** the missing end-to-end demonstration under Milestone 5, "a non-custodial CIP-56 token
transfer, signed inside the Snap with no private key on the server or on disk, is demonstrable end to end"

---

## The gap

No automated test drives the Snap. `grep -rni snap` across the middleware's `pkg/` and `tests/` trees
returns nothing.

What exists today proves the parts but never the whole:

| Evidence | Proves | Does not prove |
|---|---|---|
| `TestTransfer_DEMO_BetweenExternalUsers` (middleware) | prepare, external signature, execute, recipient credited | The signer is a Go keypair, not the Snap |
| `test/vectors.json`, 5 vectors, 65 vitest assertions | Snap and Go produce byte-identical signatures for the same inputs | Nothing about a live transfer |
| `index.test.js`, 18 tests via `@metamask/snaps-jest` | The four RPC methods behave correctly in a simulated MetaMask | The signature is never submitted anywhere |

The current argument is transitive: the Go path works, and the Snap signs identically, therefore the Snap
path works. That is a reasonable inference and it is not a demonstration.

**The gap is one step wide.** The existing middleware test already chains prepare, sign, execute and
balance assertion. Only the signing step uses a Go key instead of the Snap.

---

## Design

Replace the Go signer with a real Snap signature, driven by `@metamask/snaps-jest`, which is already a
dependency and already used in `packages/snap/test/index.test.js`.

```
installSnap()                                    @metamask/snaps-jest
  │
  ├─ canton_getPublicKey      ──────────────────► derive the Canton party
  │
  ├─ POST /register/prepare-topology ───────────► middleware returns a topology tx
  ├─ canton_signTopology      ──────────────────► Snap signs it
  ├─ POST /register           ──────────────────► party allocated, no key server side
  │
  ├─ POST /api/v2/transfer/prepare ─────────────► middleware returns a hash
  ├─ canton_signHash          ──────────────────► Snap signs the hash
  ├─ POST /api/v2/transfer/execute ─────────────► submitted via Interactive Submission
  │
  └─ poll balance             ──────────────────► recipient credited
```

Every signature in that flow is produced inside the Snap. Nothing signs server side.

---

## Two phases

### Phase 1: a gated cross-validation test (half a day)

Smallest change that removes "no automated test touches the Snap".

The 65 vitest cross-validation tests currently run only at publish time. Add `test:crypto` to CI so a
Snap-produced signature is verified against the Go-generated vectors on every pull request. One line in the
root `package.json` plus a workflow step.

This does not demonstrate a transfer. It does mean a regression in Snap signing is caught by CI rather than
by a user.

### Phase 2: the full flow (3 to 5 days)

A new test in `packages/snap/test/e2e/transfer.test.ts` driving the sequence above.

**Target environment.** Point it at the devnet middleware rather than a local stack. The local harness
needs the Canton container image, which is not publicly pullable, so a local-only test could not be run by
anyone outside ChainSafe. Devnet keeps it reproducible.

**Funding the sender.** The Snap derives a fresh party with a zero balance, and minting requires an
operator action. Two options:

1. **Pre-funded fixture party.** A party whose key the Snap can derive from a fixed test mnemonic, funded
   once and topped up as needed. Simple, but the key must be deterministic and test-only.
2. **Admin mint step.** The test calls the admin API to mint to the newly derived party, using a CI
   secret. Cleaner isolation, requires the admin credential in CI.

Option 2 is preferable. The admin API already exists and each run gets a clean party, which also exercises
registration rather than assuming it.

**Whitelisting.** Registration is whitelist-gated, so the test's party must be admitted. The same admin
credential covers this.

**Assertions.** Recipient balance increases by the transfer amount; the sender's party has no encrypted key
column populated server side; the submitted signature verifies against the public key the Snap returned.

---

## What this needs that does not exist yet

| Item | Owner | Note |
|---|---|---|
| `test:crypto` gated in CI | snap | One line, Phase 1 |
| Admin credential available to CI | infra | Needed for minting and whitelisting in Phase 2 |
| Devnet middleware reachable from CI | infra | Confirm the endpoint and that it stays up |
| A documented test mnemonic, if option 1 is chosen | snap | Test-only, never funded on MainNet |

---

## Why not drive it from the Go suite

The middleware's e2e suite is the natural home, since the test would slot directly into
`TestTransfer_DEMO_BetweenExternalUsers` by swapping the signer. But driving MetaMask from Go means
shelling out to Node, which puts a JavaScript toolchain into a Go harness and couples two repositories'
CI.

Keeping it in canton-snap, where the simulation framework already lives, is cleaner. The trade is that the
middleware's gated suite still will not touch the Snap, so Phase 1 matters on its own.

---

## Open questions

1. Devnet or a dedicated test deployment? Devnet is simplest but shared, so a flaky environment makes the
   test flaky.
2. Should Phase 2 run on every pull request, or nightly? It depends on an external environment, so nightly
   with a manual trigger may be more honest than gating merges on it.
3. Does the recorded walkthrough for reviewers reuse this flow, or stay a separate manual runbook?
