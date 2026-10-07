// SPDX-License-Identifier: Apache-2.0

import { installSnap } from "@metamask/snaps-jest";

const validHash = "ab".repeat(32);
const validMetadata = {
  operation: "Transfer",
  tokenSymbol: "DEMO",
  amount: "100",
  recipient: "alice::abcd",
  sender: "bob::1234",
};

describe("canton_getPublicKey", () => {
  it("returns public key info after user approval", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_getPublicKey",
      params: { keyIndex: 0 },
    });

    const ui = await response.getInterface();
    expect(ui.type).toBe("confirmation");
    await ui.ok();

    const result = await response;
    expect(result).toRespondWith(
      expect.objectContaining({
        compressedPubKey: expect.stringMatching(/^[0-9a-f]{66}$/),
        spkiDer: expect.stringMatching(
          /^3056301006072a8648ce3d020106052b8104000a03420004[0-9a-f]{128}$/,
        ),
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/),
      }),
    );
  });

  it("throws when user rejects", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_getPublicKey",
      params: { keyIndex: 0 },
    });

    const ui = await response.getInterface();
    await ui.cancel();

    expect(await response).toRespondWithError(
      expect.objectContaining({
        message: expect.stringContaining("rejected"),
      }),
    );
  });

  it("rejects invalid keyIndex", async () => {
    const { request } = await installSnap();

    // NaN / Infinity are excluded because the JSON-RPC transport drops them
    // before they reach the snap; the validator still catches them in-process
    // (exercised via direct unit test on validation.ts).
    for (const bad of [-1, 0.5, 100000, "0"]) {
      const result = await request({
        method: "canton_getPublicKey",
        params: { keyIndex: bad },
      });
      expect(result).toRespondWithError(
        expect.objectContaining({ message: expect.stringContaining("keyIndex") }),
      );
    }
  });
});

describe("canton_signHash", () => {
  it("returns DER signature after user approval", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: { hash: validHash, metadata: validMetadata },
    });

    const ui = await response.getInterface();
    expect(ui.type).toBe("confirmation");
    await ui.ok();

    const result = await response;
    expect(result).toRespondWith(
      expect.objectContaining({
        derSignature: expect.stringMatching(/^0x30[0-9a-f]{8,}$/),
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/),
      }),
    );
  });

  it("throws when user rejects signing", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: { hash: validHash, metadata: validMetadata },
    });

    const ui = await response.getInterface();
    await ui.cancel();

    expect(await response).toRespondWithError(
      expect.objectContaining({
        message: expect.stringContaining("rejected"),
      }),
    );
  });

  it("accepts a raw hash without metadata", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: { hash: validHash },
    });

    const ui = await response.getInterface();
    expect(ui.type).toBe("confirmation");
    await ui.ok();

    const result = await response;
    expect(result).toRespondWith(
      expect.objectContaining({
        derSignature: expect.stringMatching(/^0x30[0-9a-f]{8,}$/),
      }),
    );
  });

  it("rejects malformed hashes", async () => {
    const { request } = await installSnap();

    for (const bad of ["z".repeat(64), "ab".repeat(33), "abc", ""]) {
      const result = await request({
        method: "canton_signHash",
        params: { hash: bad, metadata: validMetadata },
      });
      expect(result).toRespondWithError(
        expect.objectContaining({ message: expect.stringMatching(/hash|hex/) }),
      );
    }
  });

  it("accepts 0x-prefixed hashes", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: { hash: "0x" + validHash, metadata: validMetadata },
    });

    const ui = await response.getInterface();
    await ui.ok();

    const result = await response;
    expect(result).toRespondWith(
      expect.objectContaining({
        derSignature: expect.stringMatching(/^0x30[0-9a-f]{8,}$/),
      }),
    );
  });

  it("rejects metadata with a non-string field", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_signHash",
      params: { hash: validHash, metadata: { ...validMetadata, operation: 42 } },
    });

    expect(result).toRespondWithError(
      expect.objectContaining({ message: expect.stringContaining("operation") }),
    );
  });

  it("rejects metadata with an oversized string", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_signHash",
      params: { hash: validHash, metadata: { ...validMetadata, tokenSymbol: "x".repeat(201) } },
    });

    expect(result).toRespondWithError(
      expect.objectContaining({ message: expect.stringContaining("tokenSymbol") }),
    );
  });
});

describe("canton_signTopology", () => {
  const testHash = "1220e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  it("returns DER signature after user approval", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signTopology",
      params: { hash: testHash },
    });

    const ui = await response.getInterface();
    expect(ui.type).toBe("confirmation");
    await ui.ok();

    const result = await response;
    expect(result).toRespondWith(
      expect.objectContaining({
        derSignature: expect.stringMatching(/^0x30[0-9a-f]{8,}$/),
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/),
      }),
    );
  });

  it("throws when user rejects", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signTopology",
      params: { hash: testHash },
    });

    const ui = await response.getInterface();
    await ui.cancel();

    expect(await response).toRespondWithError(
      expect.objectContaining({
        message: expect.stringContaining("rejected"),
      }),
    );
  });

  it("rejects a non-multihash topology hash", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_signTopology",
      params: { hash: "ab".repeat(34) }, // right length, wrong prefix
    });

    expect(result).toRespondWithError(
      expect.objectContaining({ message: expect.stringContaining("multihash") }),
    );
  });
});

describe("canton_getFingerprint", () => {
  it("requires consent on first call from an origin", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_getFingerprint",
      params: { keyIndex: 0 },
    });

    const ui = await response.getInterface();
    expect(ui.type).toBe("confirmation");
    await ui.ok();

    const result = await response;
    expect(result).toRespondWith(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/),
      }),
    );
  });

  it("returns silently on subsequent calls from the same origin AND keyIndex", async () => {
    const { request } = await installSnap();

    // First call — approve once
    const first = request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    await (await first.getInterface()).ok();
    await first;

    // Same keyIndex — no dialog
    const second = await request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    expect(second).toRespondWith(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/),
      }),
    );
  });

  it("re-prompts for a different keyIndex from the same origin", async () => {
    const { request } = await installSnap();

    // Approve keyIndex 0
    const r0 = request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    await (await r0.getInterface()).ok();
    await r0;

    // keyIndex 1 must still prompt — origin-wide approval would let the dApp
    // enumerate every Canton identity silently.
    const r1 = request({ method: "canton_getFingerprint", params: { keyIndex: 1 } });
    const ui = await r1.getInterface();
    expect(ui.type).toBe("confirmation");
    await ui.ok();
    const result = await r1;
    expect(result).toRespondWith(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/),
      }),
    );
  });

  it("throws when user rejects fingerprint disclosure", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_getFingerprint",
      params: { keyIndex: 0 },
    });

    const ui = await response.getInterface();
    await ui.cancel();

    expect(await response).toRespondWithError(
      expect.objectContaining({ message: expect.stringContaining("rejected") }),
    );
  });
});

describe("unsupported method", () => {
  it("throws for unknown RPC method", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_unknownMethod",
    });

    expect(result).toRespondWithError(
      expect.objectContaining({
        message: expect.stringContaining("Unsupported"),
      }),
    );
  });
});

/**
 * Recovery, determinism and dialog content through the real sandbox.
 *
 * The vitest suites (derivation.test.ts, dialogs.test.ts) prove the same
 * properties against a stubbed platform, which gives control of the entropy.
 * These prove they survive the real MetaMask simulation and its serialisation.
 */

// The simulation's default seed phrase. Stated here because the recovery tests
// are about identity following the seed, so the seed must be explicit.
const DEFAULT_SRP = "test test test test test test test test test test test ball";
const OTHER_SRP = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";

/**
 * Read the Canton fingerprint from a freshly installed Snap.
 *
 * Each installSnap is an independent wallet session, which is what makes this
 * a recovery test rather than a caching test.
 *
 * @param {object} [options] Options forwarded to installSnap.
 * @returns {Promise<string>} The derived fingerprint.
 */
async function fingerprintFrom(options) {
  const { request } = await installSnap(options);
  const response = request({
    method: "canton_getFingerprint",
    params: { keyIndex: 0 },
  });
  const ui = await response.getInterface();
  await ui.ok();
  return (await response).response.result.fingerprint;
}

describe("recovery after wallet restore", () => {
  it("derives the same Canton identity from the same seed phrase", async () => {
    // Two independent installs from one seed phrase. This is what a user
    // restoring MetaMask on a new machine does, and if it did not hold their
    // Canton party would be permanently unreachable.
    const before = await fingerprintFrom({ options: { secretRecoveryPhrase: DEFAULT_SRP } });
    const afterRestore = await fingerprintFrom({ options: { secretRecoveryPhrase: DEFAULT_SRP } });

    expect(afterRestore).toBe(before);
    expect(afterRestore).toMatch(/^1220[0-9a-f]{64}$/);
  });

  it("derives a different identity from a different seed phrase", async () => {
    // The negative half. Without it the test above would pass even if the
    // fingerprint were a constant unrelated to the wallet.
    const mine = await fingerprintFrom({ options: { secretRecoveryPhrase: DEFAULT_SRP } });
    const theirs = await fingerprintFrom({ options: { secretRecoveryPhrase: OTHER_SRP } });

    expect(theirs).not.toBe(mine);
  });

  it("derives the same identity for every origin in a session", async () => {
    // Keys are scoped to the Snap, not the calling origin, so two dApps
    // address one Canton identity. Documented in SIGNER_ARCHITECTURE.md
    // because it is load-bearing and not obvious.
    const { request } = await installSnap();

    const read = async (origin) => {
      const response = request({
        origin,
        method: "canton_getFingerprint",
        params: { keyIndex: 0 },
      });
      const ui = await response.getInterface();
      await ui.ok();
      return (await response).response.result.fingerprint;
    };

    expect(await read("https://b.example")).toBe(await read("https://a.example"));
  });

  it("re-derives rather than restoring consent from a previous install", async () => {
    // A fresh install starts with empty state, so consent must be asked for
    // again. This documents the consent boundary; it is not evidence for the
    // determinism above, which holds for a different reason.
    const { request } = await installSnap({ options: { secretRecoveryPhrase: DEFAULT_SRP } });
    const response = request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    const ui = await response.getInterface();

    expect(ui.type).toBe("confirmation");
    await ui.ok();
    await response;
  });
});

describe("determinism within a session", () => {
  it("returns the same identity from getPublicKey and getFingerprint", async () => {
    const { request } = await installSnap();

    const pubResponse = request({ method: "canton_getPublicKey", params: { keyIndex: 0 } });
    await (await pubResponse.getInterface()).ok();
    const pub = (await pubResponse).response.result;

    const fpResponse = request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    await (await fpResponse.getInterface()).ok();
    const fp = (await fpResponse).response.result;

    expect(fp.fingerprint).toBe(pub.fingerprint);
  });

  it("returns a different identity for a different key index", async () => {
    const { request } = await installSnap();

    const read = async (keyIndex) => {
      const response = request({ method: "canton_getPublicKey", params: { keyIndex } });
      await (await response.getInterface()).ok();
      return (await response).response.result;
    };

    const zero = await read(0);
    const one = await read(1);

    expect(one.fingerprint).not.toBe(zero.fingerprint);
    expect(one.compressedPubKey).not.toBe(zero.compressedPubKey);
  });
});

describe("dialog content in the sandbox", () => {
  it("renders the reported transfer details and the unverifiability caveat", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: { hash: validHash, keyIndex: 0, metadata: validMetadata },
    });
    const ui = await response.getInterface();
    const rendered = JSON.stringify(ui.content);

    // Rendered labels, not bare values. Asserting the amount "100" alone would
    // pass against the fingerprint, which every dialog renders.
    expect(rendered).toContain(`Operation: ${validMetadata.operation}`);
    expect(rendered).toContain(`Token: ${validMetadata.tokenSymbol}`);
    expect(rendered).toContain(`Amount: ${validMetadata.amount}`);
    expect(rendered).toContain("the snap cannot yet verify these against the hash");

    await ui.ok();
    await response;
  });

  it("warns when the dApp supplies no transaction context", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: { hash: validHash, keyIndex: 0 },
    });
    const ui = await response.getInterface();
    const rendered = JSON.stringify(ui.content);

    expect(rendered).toContain("RAW HASH SIGNING");
    expect(rendered).not.toContain("Amount:");

    await ui.ok();
    await response;
  });
});
