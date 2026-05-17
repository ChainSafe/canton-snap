import { installSnap } from "@metamask/snaps-jest";

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
  const testHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  it("returns DER signature after user approval", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
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

  it("throws when user rejects signing", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
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

  it("throws when hash is missing", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_signHash",
      params: {},
    });

    expect(result).toRespondWithError(
      expect.objectContaining({
        message: expect.stringContaining("hash"),
      }),
    );
  });

  it("rejects malformed hex", async () => {
    const { request } = await installSnap();

    for (const bad of ["z".repeat(64), testHash + "ab", "abc", ""]) {
      const result = await request({
        method: "canton_signHash",
        params: { hash: bad },
      });
      expect(result).toRespondWithError(
        expect.objectContaining({ message: expect.stringMatching(/hash|hex/) }),
      );
    }
  });

  it("rejects wrong-length hash", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_signHash",
      params: { hash: "ab".repeat(16) }, // 16 bytes, not 32
    });

    expect(result).toRespondWithError(
      expect.objectContaining({ message: expect.stringContaining("32 bytes") }),
    );
  });

  it("accepts 0x-prefixed hash", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: { hash: "0x" + testHash },
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

  it("shows metadata in dialog when provided", async () => {
    const { request } = await installSnap();

    const response = request({
      method: "canton_signHash",
      params: {
        hash: testHash,
        metadata: {
          operation: "Transfer",
          tokenSymbol: "DEMO",
          amount: "100",
          recipient: "0xabcdef",
          sender: "0x123456",
        },
      },
    });

    const ui = await response.getInterface();
    expect(ui.type).toBe("confirmation");
    await ui.ok();

    expect(await response).toRespondWith(
      expect.objectContaining({
        derSignature: expect.any(String),
      }),
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

  it("rejects oversized topology hash", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_signTopology",
      params: { hash: "ab".repeat(200) }, // 200 bytes, exceeds 128
    });

    expect(result).toRespondWithError(
      expect.objectContaining({ message: expect.stringContaining("topology hash") }),
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

  it("returns silently on subsequent calls from the same origin", async () => {
    const { request } = await installSnap();

    // First call — approve once
    const first = request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    await (await first.getInterface()).ok();
    await first;

    // Second call — no dialog
    const second = await request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    expect(second).toRespondWith(
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
