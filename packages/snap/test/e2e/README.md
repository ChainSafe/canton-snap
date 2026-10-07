# Snap end-to-end test

Milestone 5 asks for an end-to-end test of the MetaMask Snap. Everything else in
these repositories proves one leg of it: the Snap unit tests drive signing but
submit nothing, and the middleware integration tests complete real transfers but
sign them with a Go keypair. The argument that the Snap can move a CIP-56 token
is, across those two suites, transitive. This test closes it.

`transfer.e2e.test.js` runs one transfer where the only Canton signature comes
from inside the Snap:

1. Derive the Canton key and read back the fingerprint. Only public material is
   returned, and the test asserts the response carries exactly three fields.
2. Register the derived key as an external party, so the party id carries the
   Snap's fingerprint.
3. Ask the middleware to prepare a transfer, and check the prepared transaction
   is sending from that party.
4. Sign the prepared hash in the Snap, through the approval dialog.
5. Execute, then read the recipient's balance back off the ledger.
6. Decline a signature and assert the Snap returns an error rather than a
   signature.

The Snap's private key is derived from `snap_getEntropy` on each call and is
never returned, so no key material is held anywhere else in this flow.

## Requirements

- Node 20 or later. Verified on 22.20.0. Node 18 cannot run the build toolchain.
- A reachable middleware API server with a funded sender party.
- The sender's EVM address whitelisted on that deployment, since the transfer
  endpoints authenticate with an EIP-191 signature over `<prefix>:<unix>`.

The test is not wired into CI. It needs a live backend and a funded party, so it
is run by hand against devnet.

## Running it

`npm run test:e2e` builds the Snap first. That matters: the Snap under test is
the bundle in `dist/`, so a stale bundle would silently test the previous build.

### Recipe A, against a party you already have

Use this when a party is already registered and funded.

```bash
export MIDDLEWARE_URL=http://localhost:8080
export SNAP_E2E_EVM_PRIVKEY=0x...        # whitelisted sender
export SNAP_E2E_RECIPIENT_PARTY='bob::1220...'
npm run test:e2e
```

### Recipe B, provisioning a party in the run

Use this on a fresh devnet. The test registers the Snap's derived key as an
external party and mints to it, which needs an operator checkout for the mint
script.

```bash
export MIDDLEWARE_URL=http://localhost:8080
export SNAP_E2E_EVM_PRIVKEY=0x...
export SNAP_E2E_RECIPIENT_PARTY='bob::1220...'
export SNAP_E2E_SELF_PROVISION=1
export MIDDLEWARE_REPO=~/Dev/canton-middleware
npm run test:e2e
```

Without `SNAP_E2E_SELF_PROVISION=1` the registration and funding test is
skipped, so the run reports a skip rather than passing silently.

## Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MIDDLEWARE_URL` | yes | | API server base URL |
| `SNAP_E2E_EVM_PRIVKEY` | yes | | Sender's EVM key. Signs the auth headers and, in recipe B, the registration |
| `SNAP_E2E_RECIPIENT_PARTY` | one of | | Recipient Canton party id |
| `SNAP_E2E_RECIPIENT_EVM` | one of | | Recipient EVM address, resolved by the middleware |
| `SNAP_E2E_TOKEN` | no | `DEMO` | Token symbol |
| `SNAP_E2E_AMOUNT` | no | `1` | Amount to transfer |
| `SNAP_E2E_TOKEN_ADDRESS` | no | | ERC-20 facade address. Without it the settlement check is skipped |
| `SNAP_E2E_BALANCE_CHECK_EVM` | no | recipient EVM | Address whose balance proves settlement. Set it when routing by party |
| `SNAP_E2E_SELF_PROVISION` | no | off | `1` enables the register-and-fund test |
| `SNAP_E2E_FUND_AMOUNT` | no | `100` | Amount minted during self-provisioning |
| `MIDDLEWARE_REPO` | recipe B | | canton-middleware checkout holding the mint script |
| `MINT_CONFIG` | no | `config.api-server.devnet-test.yaml` | Config passed to the mint script as `-c` |

Set exactly one of `SNAP_E2E_RECIPIENT_PARTY` and `SNAP_E2E_RECIPIENT_EVM`. The
middleware rejects a request carrying both or neither, and the test fails early
rather than letting the backend reject it halfway through.

Routing by party and checking a balance are separate concerns. The balance read
goes through the ERC-20 facade and so needs an EVM address, which is why
`SNAP_E2E_BALANCE_CHECK_EVM` exists: it lets you route to a party and still
prove settlement. Leave both it and `SNAP_E2E_TOKEN_ADDRESS` unset and the run
proves submission but not settlement, which it warns about.

## Notes on the identity

The Snap's signing key is derived from the Snap ID, which in simulation is
`local:http://localhost:<port>`. snaps-jest picks a random port unless told
otherwise, so `jest.e2e.config.cjs` pins it to 8081. Changing that port changes
the derived party, and the previously registered and funded party is orphaned.

`MINT_CONFIG` has no tracked default today. `config.api-server.devnet-test.yaml`
is untracked in canton-middleware, so recipe B needs either that file present
locally or `MINT_CONFIG` pointing at one that is tracked.
