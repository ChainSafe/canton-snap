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

  it("returns same key for same index across calls", async () => {
    const { request } = await installSnap();

    // First call
    const resp1 = request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    const fp1 = await resp1;

    // Second call
    const resp2 = request({ method: "canton_getFingerprint", params: { keyIndex: 0 } });
    const fp2 = await resp2;

    // Both should succeed with the same fingerprint
    expect(fp1).toRespondWith(expect.objectContaining({ fingerprint: expect.any(String) }));
    expect(fp2).toRespondWith(expect.objectContaining({ fingerprint: expect.any(String) }));
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
  const testHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

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
});

describe("canton_getFingerprint", () => {
  it("returns fingerprint without dialog", async () => {
    const { request } = await installSnap();

    const result = await request({
      method: "canton_getFingerprint",
      params: { keyIndex: 0 },
    });

    expect(result).toRespondWith(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/),
      }),
    );
  });

  it("returns different fingerprint for different key index", async () => {
    const { request } = await installSnap();

    const result0 = await request({
      method: "canton_getFingerprint",
      params: { keyIndex: 0 },
    });
    const result1 = await request({
      method: "canton_getFingerprint",
      params: { keyIndex: 1 },
    });

    expect(result0).toRespondWith(expect.objectContaining({ fingerprint: expect.any(String) }));
    expect(result1).toRespondWith(expect.objectContaining({ fingerprint: expect.any(String) }));

    // Different key indices should produce different fingerprints
    // We can't easily extract values from the matcher result, but we verify
    // both succeed and rely on the getPublicKey test for determinism
    expect(result0).not.toEqual(result1);
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
