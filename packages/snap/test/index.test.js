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
        spkiDer: expect.stringMatching(/^[0-9a-f]+$/),
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
        derSignature: expect.stringMatching(/^0x[0-9a-f]+$/),
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
        derSignature: expect.stringMatching(/^0x[0-9a-f]+$/),
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
        derSignature: expect.stringMatching(/^0x/),
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
        derSignature: expect.stringMatching(/^0x[0-9a-f]+$/),
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
