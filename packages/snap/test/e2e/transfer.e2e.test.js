// SPDX-License-Identifier: Apache-2.0

/**
 * End-to-end: a CIP-56 transfer signed inside the Snap.
 *
 * This is the demonstration Milestone 5 asks for. Everything else in these
 * repositories proves a part: the Snap is driven but submits nothing, or a
 * transfer completes but is signed by a Go keypair. The argument across them is
 * transitive. This closes it.
 *
 * No private key is held server side. The Snap derives its signing key from
 * snap_getEntropy on each call and never returns it.
 */

import { installSnap } from "@metamask/snaps-jest";
import { hexToBytes } from "@noble/hashes/utils";
import {
  requireEnv,
  prepareTransfer,
  executeTransfer,
  balanceOf,
  waitFor,
} from "./middleware.js";
import { registerExternal, evmAddressFrom } from "./register.js";
import { fundParty } from "./fund.js";
import { approve, approveWithContent, resultOf, FINGERPRINT, DER_SIGNATURE } from "./snaps.js";

const TOKEN = process.env.SNAP_E2E_TOKEN ?? "DEMO";
const AMOUNT = process.env.SNAP_E2E_AMOUNT ?? "1";
const FUND_AMOUNT = process.env.SNAP_E2E_FUND_AMOUNT ?? "100";

// Exactly one of these routes the transfer; the middleware rejects both.
const RECIPIENT_PARTY = process.env.SNAP_E2E_RECIPIENT_PARTY;
const RECIPIENT_EVM = process.env.SNAP_E2E_RECIPIENT_EVM;

// Separate from routing: the address whose balance proves settlement.
const BALANCE_CHECK_EVM = process.env.SNAP_E2E_BALANCE_CHECK_EVM ?? RECIPIENT_EVM;
const TOKEN_ADDRESS = process.env.SNAP_E2E_TOKEN_ADDRESS;

// The sender's EVM identity. Registration and the transfer endpoints both
// authenticate with it, and it must be whitelisted on the target, so it is
// supplied rather than generated.
const EVM_PRIVKEY_HEX = process.env.SNAP_E2E_EVM_PRIVKEY;
const evmPrivKey = EVM_PRIVKEY_HEX ? hexToBytes(EVM_PRIVKEY_HEX.replace(/^0x/, "")) : undefined;

const SELF_PROVISION = process.env.SNAP_E2E_SELF_PROVISION === "1";
const CAN_CHECK_SETTLEMENT = Boolean(TOKEN_ADDRESS && BALANCE_CHECK_EVM);

const provisionIt = SELF_PROVISION ? it : it.skip;
const settlementIt = CAN_CHECK_SETTLEMENT ? it : it.skip;

describe("Snap-signed CIP-56 transfer", () => {
  beforeAll(() => {
    requireEnv(["MIDDLEWARE_URL", "SNAP_E2E_EVM_PRIVKEY"]);
    if (Boolean(RECIPIENT_PARTY) === Boolean(RECIPIENT_EVM)) {
      throw new Error(
        "Set exactly one of SNAP_E2E_RECIPIENT_PARTY or SNAP_E2E_RECIPIENT_EVM. " +
          "The middleware rejects a request carrying both or neither.",
      );
    }
    if (!CAN_CHECK_SETTLEMENT) {
      console.warn(
        "SNAP_E2E_TOKEN_ADDRESS or SNAP_E2E_BALANCE_CHECK_EVM unset: " +
          "the settlement assertion will be skipped, so this run proves submission but not settlement.",
      );
    }
  });

  it("derives a Canton identity and exposes only public material", async () => {
    const { request } = await installSnap();

    const pubReq = request({ method: "canton_getPublicKey", params: { keyIndex: 0 } });
    const ui = await pubReq.getInterface();
    await ui.ok();

    const res = await pubReq;
    expect(res).toRespondWith(
      expect.objectContaining({
        compressedPubKey: expect.stringMatching(/^[0-9a-f]{66}$/),
        spkiDer: expect.stringMatching(/^[0-9a-f]+$/),
        fingerprint: expect.stringMatching(FINGERPRINT),
      }),
    );

    // Positive assertion: exactly these three fields, so a future change that
    // adds key material to the response fails here rather than shipping.
    expect(Object.keys(resultOf(res)).sort()).toEqual([
      "compressedPubKey",
      "fingerprint",
      "spkiDer",
    ]);

    const fp = await approve(request({ method: "canton_getFingerprint", params: { keyIndex: 0 } }));
    expect(fp.fingerprint).toBe(resultOf(res).fingerprint);
  });

  provisionIt("registers a party whose Canton key never leaves the Snap, then funds it", async () => {
    const { request } = await installSnap();

    const { party, cantonFingerprint, evmAddress } = await registerExternal({ request, evmPrivKey });

    expect(evmAddress.toLowerCase()).toBe(evmAddressFrom(evmPrivKey).toLowerCase());
    expect(cantonFingerprint).toMatch(FINGERPRINT);
    // The party id carries the Canton fingerprint, so this ties the allocated
    // party to the key inside the Snap.
    expect(party.split("::")[1]).toBe(cantonFingerprint);

    await fundParty(party, FUND_AMOUNT);
  });

  it("completes a transfer whose only Canton signature came from the Snap", async () => {
    const { request } = await installSnap();

    const { fingerprint } = await approve(
      request({ method: "canton_getFingerprint", params: { keyIndex: 0 } }),
    );
    expect(fingerprint).toMatch(FINGERPRINT);

    const prepared = await prepareTransfer({
      evmPrivKey,
      toPartyID: RECIPIENT_PARTY,
      to: RECIPIENT_EVM,
      amount: AMOUNT,
      token: TOKEN,
    });
    expect(prepared.transaction_hash).toMatch(/^(0x)?[0-9a-f]{64,}$/);
    expect(prepared.transfer_id).toMatch(/\w/);

    // The sending party must be the Snap's. Without this the test would pass
    // for a transfer out of somebody else's account.
    expect(prepared.party_id.split("::")[1]).toBe(fingerprint);

    const signed = await approveWithContent(
      request({
        method: "canton_signHash",
        params: {
          hash: prepared.transaction_hash,
          keyIndex: 0,
          metadata: {
            operation: "Transfer",
            tokenSymbol: TOKEN,
            amount: AMOUNT,
            recipient: RECIPIENT_PARTY ?? RECIPIENT_EVM,
            sender: prepared.party_id,
          },
        },
      }),
      // Rendered labels, not bare values: a bare "1" matches the fingerprint
      // every dialog already renders.
      [`Amount: ${AMOUNT}`, `Token: ${TOKEN}`],
    );
    expect(signed.derSignature).toMatch(DER_SIGNATURE);
    expect(signed.fingerprint).toBe(fingerprint);

    const executed = await executeTransfer({
      evmPrivKey,
      transferID: prepared.transfer_id,
      signature: signed.derSignature,
      signedBy: signed.fingerprint,
    });
    expect(executed.status).toBe("completed");

  });

  settlementIt("settles on the ledger, raising the recipient's balance", async () => {
    const before = await balanceOf({ tokenAddress: TOKEN_ADDRESS, evmAddress: BALANCE_CHECK_EVM });

    const { request } = await installSnap();
    const prepared = await prepareTransfer({
      evmPrivKey,
      toPartyID: RECIPIENT_PARTY,
      to: RECIPIENT_EVM,
      amount: AMOUNT,
      token: TOKEN,
    });
    const signed = await approve(
      request({
        method: "canton_signHash",
        params: {
          hash: prepared.transaction_hash,
          keyIndex: 0,
          metadata: { operation: "Transfer", tokenSymbol: TOKEN, amount: AMOUNT },
        },
      }),
    );
    await executeTransfer({
      evmPrivKey,
      transferID: prepared.transfer_id,
      signature: signed.derSignature,
      signedBy: signed.fingerprint,
    });

    // Exact, not "greater than": a concurrent transfer on a shared devnet would
    // satisfy an inequality without this transfer having settled.
    const expected = before + BigInt(AMOUNT) * 10n ** 18n;
    const after = await waitFor(
      () => balanceOf({ tokenAddress: TOKEN_ADDRESS, evmAddress: BALANCE_CHECK_EVM }),
      (v) => v === expected,
      { label: `recipient balance to reach ${expected}` },
    );
    expect(after).toBe(expected);
  });

  it("produces no signature when the user declines", async () => {
    const { request } = await installSnap();

    // A dummy hash: this asserts Snap behaviour and needs no backend, so it
    // leaves no prepared transfer behind.
    const signReq = request({
      method: "canton_signHash",
      params: {
        hash: "ab".repeat(32),
        keyIndex: 0,
        metadata: { operation: "Transfer", tokenSymbol: TOKEN, amount: AMOUNT },
      },
    });

    const ui = await signReq.getInterface();
    await ui.cancel();

    // The Snap throws on rejection. Asserting the error is what makes this
    // test fail if approval ever becomes decorative.
    expect(await signReq).toRespondWithError(
      expect.objectContaining({ message: expect.stringContaining("reject") }),
    );
  });
});
